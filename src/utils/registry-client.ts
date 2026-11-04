import { Effect, pipe, Schema } from 'effect'
import { type Framework, type RegistryItem, registryIndexList, registryItem } from '../schema'
import { Config } from './config'
import { HttpError, RegistryItemNotFound } from './errors'

const REGISTRY_URL = 'https://park-ui.com/registry'
const TIMEOUT_MS = 15_000

type RegistryError = ReturnType<typeof HttpError> | ReturnType<typeof RegistryItemNotFound>

interface Params {
  ids: string[]
}

const fetchJson = <A, I>(
  path: string,
  schema: Schema.Schema<A, I>,
  id: string,
): Effect.Effect<A, RegistryError> =>
  pipe(
    Effect.tryPromise({
      try: () => fetch(`${REGISTRY_URL}/${path}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
      catch: (cause) => HttpError(path, cause),
    }),
    Effect.flatMap((response): Effect.Effect<unknown, RegistryError> =>
      response.status === 404
        ? Effect.fail(RegistryItemNotFound(id))
        : response.ok
          ? Effect.tryPromise({ try: () => response.json(), catch: (cause) => HttpError(path, cause) })
          : Effect.fail(HttpError(path, `HTTP ${response.status}`)),
    ),
    Effect.flatMap((json) =>
      Schema.decodeUnknown(schema)(json).pipe(Effect.mapError((cause) => HttpError(path, cause))),
    ),
  )

const fetchIndex = (framework: Framework) =>
  fetchJson(`${framework}/index`, registryIndexList, 'index')

export const fetchColors = () =>
  fetchIndex('react').pipe(
    Effect.map((items) => items.filter((item) => item.type === 'registry:color')),
    Effect.map((colors) => {
      const grayColorNames = ['neutral', 'mauve', 'slate', 'sage', 'olive', 'sand']

      const accentColors = colors.map(({ name }) => ({ value: name }))
      const neutralColors = colors
        .filter((color) => grayColorNames.includes(color.name))
        .map(({ name }) => ({ value: name }))

      return { accentColors, neutralColors }
    }),
  )

export const fetchRegistryIndex = () =>
  Config.pipe(Effect.flatMap(({ framework }) => fetchIndex(framework)))

export const fetchRegistryItems = ({ ids }: Params) =>
  Config.pipe(
    Effect.flatMap(({ framework }) =>
      pipe(
        fetchRegistryItemsRecursive(ids, new Set(), framework),
        Effect.map((items) => Array.from(items.values())),
      ),
    ),
  )

const fetchRegistryItemsRecursive = (
  ids: readonly string[],
  visited: Set<string>,
  framework: Framework,
): Effect.Effect<Map<string, RegistryItem>, RegistryError> => {
  const newIds = ids.filter((id) => !visited.has(id))
  if (newIds.length === 0) return Effect.succeed(new Map())

  for (const id of newIds) visited.add(id)

  return pipe(
    Effect.all(
      newIds.map((id) => fetchJson(`${framework}/${encodeURIComponent(id)}`, registryItem, id)),
      { concurrency: 'unbounded' },
    ),
    Effect.flatMap((items) =>
      pipe(
        fetchRegistryItemsRecursive(
          items.flatMap((item) => item.registryDependencies ?? []),
          visited,
          framework,
        ),
        Effect.map(
          (depItems) => new Map([...new Map(items.map((item) => [item.name, item])), ...depItems]),
        ),
      ),
    ),
  )
}
