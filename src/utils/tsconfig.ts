import { dirname, resolve } from "node:path"
import * as p from "@clack/prompts"
import { Context, Effect, Layer, Schema } from "effect"
import type { ParseResult } from "effect"
import { parse } from "tsconfck"
import { TSConfigInvalid } from "./errors/tsconfig-invalid"
import { TSConfigNotFound } from "./errors/tsconfig-not-found"
import { PandaConfig } from "./panda-config"

const TSConfigFile = Schema.Struct({
  compilerOptions: Schema.Struct({
    // TypeScript 7 removed baseUrl; paths then resolve from the tsconfig directory.
    baseUrl: Schema.optional(Schema.String),
    paths: Schema.Record({
      key: Schema.String,
      value: Schema.mutable(Schema.Array(Schema.String)),
    }),
  }),
})

type TSConfigFileShape = typeof TSConfigFile.Type

export interface TSConfigShape {
  readonly aliasPrefix: string
  readonly baseUrl: string
  readonly paths: Record<string, string[]>
}

export class TSConfig extends Context.Tag("TSConfig")<TSConfig, TSConfigShape>() {}

/** Folders a project alias usually points at; the alias for one of them is the project's. */
const COMMON_TARGETS = new Set(["./*", "./src/*", "./app/*", "./resources/js/*"])
const WILDCARD_SUFFIX = /\/\*$/u

const aliasPrefixOf = (config: TSConfigFileShape): string | undefined => {
  const entries = Object.entries(config.compilerOptions.paths)
  const preferred = entries.find(([, targets]) =>
    targets.some((target) => COMMON_TARGETS.has(target)),
  )
  const [first] = entries
  const [alias] = preferred ?? first ?? []
  return alias?.replace(WILDCARD_SUFFIX, "")
}

const readTSConfig: Effect.Effect<
  TSConfigShape,
  TSConfigInvalid | TSConfigNotFound | ParseResult.ParseError,
  PandaConfig
> = PandaConfig.pipe(
  Effect.flatMap((pandaConfig) =>
    Effect.tryPromise({
      catch: () => new TSConfigNotFound(process.cwd()),
      try: () => parse(pandaConfig.path),
    }),
  ),
  Effect.flatMap((parsed) =>
    Schema.decodeUnknown(TSConfigFile)(parsed.tsconfig).pipe(
      Effect.map((config) => ({ config, directory: dirname(parsed.tsconfigFile) })),
    ),
  ),
  Effect.flatMap(({ config, directory }) => {
    const aliasPrefix = aliasPrefixOf(config)
    if (aliasPrefix === undefined || aliasPrefix === "") {
      return Effect.fail(new TSConfigInvalid())
    }
    return Effect.succeed({
      aliasPrefix,
      // Absolute, so path targets resolve the same from any working directory.
      baseUrl: resolve(directory, config.compilerOptions.baseUrl ?? "."),
      paths: config.compilerOptions.paths,
    })
  }),
)

const TSConfigLive = Layer.effect(TSConfig, readTSConfig)

/** Provides the project's tsconfig; reports and stops when it is missing or has no alias. */
export const withTSConfig = <A, R>(
  effect: Effect.Effect<A, never, R>,
): Effect.Effect<A | undefined, never, Exclude<R, TSConfig> | PandaConfig> =>
  Effect.provide(effect, TSConfigLive).pipe(
    Effect.catchAll(({ message }) =>
      Effect.sync(() => {
        p.log.error(message)
        p.outro("Visit https://park-ui.com/docs/installation to learn how to get started.")
        process.exitCode = 1
        return undefined
      }),
    ),
  )
