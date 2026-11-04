import { dirname, join } from "node:path"
import * as p from "@clack/prompts"
import { Context, Effect, Layer } from "effect"
import { builders, loadFile, writeFile } from "magicast"
import { deepMergeObject, getDefaultExportOptions } from "magicast/helpers"
import type { RegistryItemImport } from "~/schema"
import { Config } from "./config"
import { PandaConfigNotFound } from "./errors/panda-config-not-found"
import type { PandaVersionUnsupported } from "./errors/panda-version-unsupported"
import { findUp } from "./fs"
import { requirePanda2 } from "./import-map"
import { isRecord } from "./manifest"

export interface PandaConfigShape {
  readonly path: string
}

export class PandaConfig extends Context.Tag("PandaConfig")<PandaConfig, PandaConfigShape>() {}

const CONFIG_FILE = "panda.config.ts"

const projectDirectory = async (): Promise<string> => {
  const packageJson = await findUp("package.json")
  if (packageJson === undefined) {
    return process.cwd()
  }
  return dirname(packageJson)
}

const findPandaConfig: Effect.Effect<
  PandaConfigShape,
  PandaConfigNotFound | PandaVersionUnsupported
> = Effect.promise(async () => join(await projectDirectory(), CONFIG_FILE)).pipe(
  Effect.flatMap((path) =>
    Effect.promise(() => Bun.file(path).exists()).pipe(
      Effect.flatMap((exists) => {
        if (exists) {
          return Effect.succeed({ path })
        }
        return Effect.fail(new PandaConfigNotFound(path))
      }),
    ),
  ),
  Effect.tap(({ path }) => requirePanda2(path)),
)

const PandaConfigLive = Layer.effect(PandaConfig, findPandaConfig)

/** Provides the Panda config; reports and stops when it is missing or older than Panda 2. */
export const withPandaConfig = <A, R>(
  effect: Effect.Effect<A, never, R>,
): Effect.Effect<A | undefined, never, Exclude<R, PandaConfig>> =>
  effect.pipe(
    Effect.provide(PandaConfigLive),
    Effect.catchTags({
      PandaConfigNotFound: ({ message }) =>
        Effect.sync(() => {
          p.log.error(message)
          p.outro("Visit https://panda-css.com/docs/overview/getting-started to get started.")
          process.exitCode = 1
          return undefined
        }),
      PandaVersionUnsupported: ({ message }) =>
        Effect.sync(() => {
          p.log.error(message)
          process.exitCode = 1
          return undefined
        }),
    }),
  )

const REF_PREFIX = "$ref:"
const THEME_IMPORTS = new Set(["registry:theme", "registry:color", "registry:recipe"])

/** Turns `$ref:name` strings in a registry extension into references to the imported `name`. */
export const replaceRefs = (value: unknown): unknown => {
  if (typeof value === "string" && value.startsWith(REF_PREFIX)) {
    return builders.raw(value.slice(REF_PREFIX.length))
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => replaceRefs(item))
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRefs(item)]))
  }
  return value
}

interface UpdatePandaConfigOptions {
  readonly extension?: unknown
  readonly imports?: readonly RegistryItemImport[]
}

/** Merges a registry extension into `panda.config.ts` and adds the theme imports it needs. */
export const updatePandaConfig = ({
  extension,
  imports = [],
}: UpdatePandaConfigOptions = {}): Effect.Effect<void, never, PandaConfig | Config> =>
  Effect.all([PandaConfig, Config]).pipe(
    Effect.flatMap(([pandaConfig, { aliases }]) =>
      Effect.promise(async () => {
        const mod = await loadFile(pandaConfig.path)
        deepMergeObject(getDefaultExportOptions(mod), replaceRefs(extension))
        for (const item of imports) {
          if (THEME_IMPORTS.has(item.type)) {
            mod.imports.$prepend({
              from: join(aliases.theme, item.from),
              imported: item.name,
              local: item.name,
            })
          }
        }
        await writeFile(mod, pandaConfig.path)
      }),
    ),
  )
