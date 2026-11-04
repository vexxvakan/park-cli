import type * as p from "@clack/prompts"
import { Effect, Schema } from "effect"
import { registryIndexList, registryItem } from "../schema"
import type { Framework, RegistryItem } from "../schema"
import { Config } from "./config"
import { HttpError } from "./errors/http-error"
import { RegistryItemNotFound } from "./errors/registry-item-not-found"

const REGISTRY_URL = "https://park-ui.com/registry"
const TIMEOUT_MS = 15_000
const NOT_FOUND_STATUS = 404
const NONE = 0

export type RegistryError = HttpError | RegistryItemNotFound

type RegistryIndex = typeof registryIndexList.Type

interface Params {
  readonly ids: readonly string[]
}

/** Accent and gray choices, as prompt options. */
export interface Colors {
  readonly accentColors: p.Option<string>[]
  readonly neutralColors: p.Option<string>[]
}

const GRAY_COLORS = new Set(["neutral", "mauve", "slate", "sage", "olive", "sand"])

const readBody = (
  response: Response,
  path: string,
  id: string,
): Effect.Effect<unknown, RegistryError> => {
  if (response.status === NOT_FOUND_STATUS) {
    return Effect.fail(new RegistryItemNotFound(id))
  }
  if (!response.ok) {
    return Effect.fail(new HttpError(path, `HTTP ${response.status}`))
  }
  return Effect.tryPromise({
    catch: (cause) => new HttpError(path, cause),
    try: async (): Promise<unknown> => response.json(),
  })
}

const fetchJson = <A, I>(
  path: string,
  schema: Schema.Schema<A, I>,
  id: string,
): Effect.Effect<A, RegistryError> =>
  Effect.tryPromise({
    catch: (cause) => new HttpError(path, cause),
    try: () => fetch(`${REGISTRY_URL}/${path}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
  }).pipe(
    Effect.flatMap((response) => readBody(response, path, id)),
    Effect.flatMap((json) =>
      Schema.decodeUnknown(schema)(json).pipe(
        Effect.mapError((cause) => new HttpError(path, cause)),
      ),
    ),
  )

const fetchIndex = (framework: Framework): Effect.Effect<RegistryIndex, RegistryError> =>
  fetchJson(`${framework}/index`, registryIndexList, "index")

/** Every registry color as an accent choice, and the gray ones as gray choices. */
export const fetchColors = (): Effect.Effect<Colors, RegistryError> =>
  fetchIndex("react").pipe(
    Effect.map((items) => {
      const colors = items.filter((item) => item.type === "registry:color")
      return {
        accentColors: colors.map(({ name }) => ({ value: name })),
        neutralColors: colors
          .filter((color) => GRAY_COLORS.has(color.name))
          .map(({ name }) => ({ value: name })),
      }
    }),
  )

export const fetchRegistryIndex = (): Effect.Effect<RegistryIndex, RegistryError, Config> =>
  Config.pipe(Effect.flatMap(({ framework }) => fetchIndex(framework)))

const fetchRegistryItemsRecursive = (
  ids: readonly string[],
  visited: Set<string>,
  framework: Framework,
): Effect.Effect<Map<string, RegistryItem>, RegistryError> => {
  const newIds = ids.filter((id) => !visited.has(id))
  if (newIds.length === NONE) {
    return Effect.succeed(new Map<string, RegistryItem>())
  }
  for (const id of newIds) {
    visited.add(id)
  }
  return Effect.all(
    newIds.map((id) => fetchJson(`${framework}/${encodeURIComponent(id)}`, registryItem, id)),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.flatMap((items) =>
      fetchRegistryItemsRecursive(
        items.flatMap((item) => item.registryDependencies ?? []),
        visited,
        framework,
      ).pipe(
        Effect.map(
          (dependencies) =>
            new Map<string, RegistryItem>([
              ...items.map((item): [string, RegistryItem] => [item.name, item]),
              ...dependencies,
            ]),
        ),
      ),
    ),
  )
}

/** The requested items and every registry item they depend on. */
export const fetchRegistryItems = ({
  ids,
}: Params): Effect.Effect<RegistryItem[], RegistryError, Config> =>
  Config.pipe(
    Effect.flatMap(({ framework }) =>
      fetchRegistryItemsRecursive(ids, new Set(), framework).pipe(
        Effect.map((items) => [...items.values()]),
      ),
    ),
  )
