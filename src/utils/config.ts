import path from "node:path"
import * as p from "@clack/prompts"
import { Context, Effect, Layer, Schema } from "effect"
import type { ParseResult } from "effect"
import type { Framework } from "~/schema"
import { ConfigInvalid } from "./errors/config-invalid"
import { ConfigNotFound } from "./errors/config-not-found"
import { FileError } from "./errors/file-error"
import { findUp, matchPath } from "./fs"
import { PandaConfig } from "./panda-config"
import { TSConfig } from "./tsconfig"
import type { TSConfigShape } from "./tsconfig"

const AliasesSchema = Schema.Struct({
  components: Schema.String,
  hooks: Schema.String,
  lib: Schema.String,
  recipes: Schema.String,
  theme: Schema.String,
  ui: Schema.String,
})

const FrameworkSchema = Schema.Literal("react", "solid", "svelte", "vue")

/** `components.json` as written on disk. */
const ConfigFile = Schema.Struct({
  aliases: AliasesSchema,
  framework: FrameworkSchema,
  panda: Schema.Struct({ config: Schema.String }),
})

type ConfigFileShape = typeof ConfigFile.Type
type Aliases = typeof AliasesSchema.Type
type ResolvedPaths = Record<keyof Aliases, string>

/** The configuration with every alias resolved to a directory. */
const ResolvedConfig = Schema.Struct({
  aliases: AliasesSchema,
  framework: FrameworkSchema,
  panda: Schema.Struct({ config: Schema.String }),
  resolvedPaths: Schema.Struct({
    components: Schema.String,
    hooks: Schema.String,
    lib: Schema.String,
    recipes: Schema.String,
    theme: Schema.String,
    ui: Schema.String,
  }),
})

export type ConfigShape = typeof ResolvedConfig.Type

const resolveAlias = (alias: string, tsConfig: TSConfigShape): string | undefined => {
  if (alias === "") {
    return undefined
  }
  return matchPath(alias, tsConfig.baseUrl, tsConfig.paths)
}

/** Resolves each alias through tsconfig `paths`, falling back to folders next to `components`. */
const resolvePaths = (config: ConfigFileShape, tsConfig: TSConfigShape): ResolvedPaths => {
  const { aliases } = config
  const components = resolveAlias(aliases.components, tsConfig) ?? process.cwd()
  return {
    components,
    hooks: resolveAlias(aliases.hooks, tsConfig) ?? path.resolve(components, "..", "hooks"),
    lib: resolveAlias(aliases.lib, tsConfig) ?? path.resolve(components, ".."),
    recipes:
      resolveAlias(aliases.recipes, tsConfig) ?? path.resolve(components, "..", "theme", "recipes"),
    theme: resolveAlias(aliases.theme, tsConfig) ?? path.resolve(components, "..", "theme"),
    ui: resolveAlias(aliases.ui, tsConfig) ?? path.resolve(components, "ui"),
  }
}

export const ConfigSchema = Schema.transformOrFail(ConfigFile, ResolvedConfig, {
  decode: (config) =>
    TSConfig.pipe(
      Effect.map((tsConfig) => ({ ...config, resolvedPaths: resolvePaths(config, tsConfig) })),
    ),
  encode: (config) => Effect.succeed(config),
})

export class Config extends Context.Tag("Config")<Config, ConfigShape>() {}

const CONFIG_FILE = "components.json"

const configPath = (): Effect.Effect<string> =>
  Effect.promise(async () => (await findUp(CONFIG_FILE)) ?? path.join(process.cwd(), CONFIG_FILE))

const readConfig: Effect.Effect<ConfigShape, ConfigNotFound | ConfigInvalid, TSConfig> =
  configPath().pipe(
    Effect.flatMap((file) =>
      Effect.tryPromise({
        catch: () => new ConfigNotFound(file),
        try: async (): Promise<unknown> => Bun.file(file).json(),
      }).pipe(
        Effect.flatMap((json) =>
          Schema.decodeUnknown(ConfigSchema)(json).pipe(
            Effect.mapError(() => new ConfigInvalid(file)),
          ),
        ),
      ),
    ),
  )

const ConfigLive = Layer.effect(Config, readConfig)

/** Provides `components.json`; reports and stops when it is missing or invalid. */
export const withConfig = <A, R>(
  effect: Effect.Effect<A, never, R>,
): Effect.Effect<A | undefined, never, Exclude<R, Config> | TSConfig> =>
  effect.pipe(
    Effect.provide(ConfigLive),
    Effect.catchAll(({ message }) =>
      Effect.sync(() => {
        p.log.error(message)
        p.outro("Run `park init` to create a new configuration.")
        process.exitCode = 1
        return undefined
      }),
    ),
  )

const JSON_INDENT = 2

/** Writes `components.json` for this project and returns what it wrote. */
export const saveConfig = (
  framework: Framework,
): Effect.Effect<ConfigFileShape, FileError, PandaConfig | TSConfig> =>
  Effect.all([PandaConfig, TSConfig, configPath()]).pipe(
    Effect.flatMap(([pandaConfig, { aliasPrefix }, file]) => {
      const config = {
        $schema: "https://park-ui.com/schema/components.json",
        aliases: {
          components: `${aliasPrefix}/components`,
          hooks: `${aliasPrefix}/hooks`,
          lib: `${aliasPrefix}/lib`,
          recipes: `${aliasPrefix}/theme/recipes`,
          theme: `${aliasPrefix}/theme`,
          ui: `${aliasPrefix}/components/ui`,
        },
        framework,
        panda: { config: path.relative(process.cwd(), pandaConfig.path) },
      }
      return Effect.tryPromise({
        catch: () => new FileError(file),
        try: () => Bun.write(file, `${JSON.stringify(config, undefined, JSON_INDENT)}\n`),
      }).pipe(Effect.as(config))
    }),
  )

/** Decodes a freshly saved `components.json` into the resolved configuration. */
export const resolveConfig = (
  config: ConfigFileShape,
): Effect.Effect<ConfigShape, ParseResult.ParseError, TSConfig> =>
  Schema.decodeUnknown(ConfigSchema)(config)
