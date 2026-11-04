import { dirname, join } from "node:path"
import { Effect } from "effect"
import { loadFile } from "magicast"
import { getDefaultExportOptions } from "magicast/helpers"
import { PandaVersionUnsupported } from "./errors/panda-version-unsupported"
import { findUp } from "./fs"
import { dependsOn, isRecord, majorVersion, readManifest } from "./manifest"
import {
  addReducedMotion,
  dropForwardRef,
  dropMemo,
  dynamicViewport,
  stableKeys,
} from "./modernize"
import { toOklch } from "./oklch"

const DEFAULT_IMPORT_MAP = "styled-system"
const PANDA_MAJOR = 2
const REF_AS_PROP_MAJOR = 19
const NONE = 0

/** Types `@pandacss/dev` still exports in v2; every other config type lives in `@pandacss/types`. */
const DEV_TYPES = new Set(["Config", "Preset", "UserConfig"])

/** The specifier generated Panda code is imported through; registry files assume the default. */
export const readImportMap = (configPath: string): Effect.Effect<string> =>
  Effect.promise(() => loadFile(configPath)).pipe(
    Effect.map((mod) => {
      const options: unknown = getDefaultExportOptions(mod)
      if (isRecord(options)) {
        const { importMap } = options
        if (typeof importMap === "string" && importMap !== "") {
          return importMap
        }
      }
      return DEFAULT_IMPORT_MAP
    }),
  )

/** Version of the project's installed `@pandacss/dev`, or undefined when it is not installed. */
const readPandaVersion = async (configPath: string): Promise<string | undefined> => {
  const path = await findUp(
    join("node_modules", "@pandacss", "dev", "package.json"),
    dirname(configPath),
  )
  if (path === undefined) {
    return undefined
  }
  const { version } = await readManifest(path)
  return version
}

/** Fails unless the project's installed `@pandacss/dev` is 2 or newer. */
export const requirePanda2 = (configPath: string): Effect.Effect<void, PandaVersionUnsupported> =>
  Effect.promise(() => readPandaVersion(configPath)).pipe(
    Effect.flatMap((version) => {
      if (version !== undefined && majorVersion(version) >= PANDA_MAJOR) {
        return Effect.void
      }
      return Effect.fail(new PandaVersionUnsupported(version))
    }),
  )

export const rewriteImportMap = (content: string, importMap: string): string => {
  if (importMap === DEFAULT_IMPORT_MAP) {
    return content
  }
  return content.replaceAll(/(?<quote>['"])styled-system\//gu, `$<quote>${importMap}/`)
}

const DEV_TYPE_IMPORT =
  /import\s+type\s*\{(?<list>[^}]*)\}\s*from\s*(?<quote>['"])@pandacss\/dev\k<quote>/gu

const importedName = (name: string): string => {
  const [imported = name] = name.split(/\s+as\s+/u)
  return imported
}

/** Splits one `import type { … } from '@pandacss/dev'` into the names v2 still exports and the rest. */
const splitDevTypeImport = (statement: string, list: string, quote: string): string => {
  const names = list
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
  const moved = names.filter((name) => !DEV_TYPES.has(importedName(name)))
  if (moved.length === NONE) {
    return statement
  }
  const kept = names.filter((name) => !moved.includes(name))
  const toTypes = `import type { ${moved.join(", ")} } from ${quote}@pandacss/types${quote}`
  if (kept.length === NONE) {
    return toTypes
  }
  return `import type { ${kept.join(", ")} } from ${quote}@pandacss/dev${quote}\n${toTypes}`
}

/** Moves type imports `@pandacss/dev` dropped in v2 (`RecipeConfig`, …) to `@pandacss/types`. */
export const rewriteTypeImports = (content: string): string =>
  content.replaceAll(DEV_TYPE_IMPORT, (statement, list: string, quote: string) =>
    splitDevTypeImport(statement, list, quote),
  )

export interface Aliases {
  readonly components: string
  readonly hooks: string
  readonly lib: string
  readonly recipes: string
  readonly theme: string
  readonly ui: string
}

/** Registry folders written as `@/…`, most specific first, and the alias each maps to. */
const REGISTRY_PATHS = [
  ["components/ui", "ui"],
  ["components", "components"],
  ["theme/recipes", "recipes"],
  ["theme", "theme"],
  ["hooks", "hooks"],
  ["lib", "lib"],
] as const

/** Points the registry's `@/components/ui` style imports at the project's own aliases. */
export const rewriteAliases = (content: string, aliases: Aliases): string =>
  REGISTRY_PATHS.reduce(
    (source, [path, key]) =>
      source.replaceAll(
        new RegExp(`(?<quote>['"])@/${path.replace("/", String.raw`\/`)}(?=['"/])`, "gu"),
        `$<quote>${aliases[key]}`,
      ),
    content,
  )

/** What the project supports, read once per install. */
export interface Project {
  /** React 19 or newer: `ref` is a prop, so `forwardRef` goes. */
  readonly react19: boolean
  /** React Compiler is installed: manual `useMemo` goes. */
  readonly reactCompiler: boolean
}

interface Target {
  readonly importMap: string
  readonly aliases: Aliases
  readonly project?: Project
  /** Registry path of the file, e.g. `global-css.ts`. */
  readonly path?: string
}

/**
 * Adapts registry source, written for Panda 1, the `@/` alias and the default import map, to this project.
 * Every `createStyleContext` in the registry wraps a slot recipe, which v2 names `createSlotRecipeContext`.
 * Colors become `oklch()`, `vh`/`vw` become `dvh`/`dvw`, list keys come from data, and the
 * theme's global CSS honours reduced motion. On React 19 `forwardRef` is dropped, and with
 * React Compiler so is `useMemo`.
 */
export const adaptRegistrySource = (
  content: string,
  { importMap, aliases, project, path }: Target,
): string => {
  let source = rewriteTypeImports(
    rewriteAliases(rewriteImportMap(content, importMap), aliases),
  ).replaceAll(/\bcreateStyleContext\b/gu, "createSlotRecipeContext")
  source = stableKeys(dynamicViewport(toOklch(source)))
  if (path === "global-css.ts") {
    source = addReducedMotion(source)
  }
  if (project?.reactCompiler === true) {
    source = dropMemo(source)
  }
  if (project?.react19 === true) {
    source = dropForwardRef(source)
  }
  return source
}

const readReactMajor = async (from: string): Promise<number> => {
  const path = await findUp(join("node_modules", "react", "package.json"), from)
  if (path === undefined) {
    return Number.NaN
  }
  const { version } = await readManifest(path)
  if (version === undefined) {
    return Number.NaN
  }
  return majorVersion(version)
}

const readReactCompiler = async (from: string): Promise<boolean> => {
  const path = await findUp("package.json", from)
  if (path === undefined) {
    return false
  }
  return dependsOn(await readManifest(path), "babel-plugin-react-compiler")
}

/** Reads the project's React version and whether React Compiler is installed. */
export const readProject = (from: string): Effect.Effect<Project> =>
  Effect.promise(async () => ({
    react19: (await readReactMajor(from)) >= REF_AS_PROP_MAJOR,
    reactCompiler: await readReactCompiler(from),
  }))

/** True when adapted source imports `@pandacss/types`, which projects rarely list themselves. */
export const usesPandaTypes = (content: string): boolean =>
  /from\s*['"]@pandacss\/types['"]/u.test(content)
