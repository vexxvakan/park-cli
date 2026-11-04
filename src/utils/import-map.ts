import { dirname, join } from 'node:path'
import { Effect } from 'effect'
import { loadFile } from 'magicast'
import { PandaVersionUnsupported } from './errors'
import { findUp } from './fs'
import { addReducedMotion, dropForwardRef, dropMemo, dynamicViewport, stableKeys } from './modernize'
import { toOklch } from './oklch'

const DEFAULT_IMPORT_MAP = 'styled-system'

/** Types `@pandacss/dev` still exports in v2; every other config type lives in `@pandacss/types`. */
const DEV_TYPES = new Set(['Config', 'Preset', 'UserConfig'])

/** The specifier generated Panda code is imported through; registry files assume the default. */
export const readImportMap = (configPath: string) =>
  Effect.promise(() => loadFile(configPath)).pipe(
    Effect.map((mod) => {
      const options =
        mod.exports['default'].$type === 'function-call'
          ? mod.exports['default'].$args[0]
          : mod.exports['default']
      const importMap: unknown = options?.importMap
      return typeof importMap === 'string' && importMap !== '' ? importMap : DEFAULT_IMPORT_MAP
    }),
  )

/** Fails unless the project's installed `@pandacss/dev` is 2 or newer. */
export const requirePanda2 = (configPath: string) =>
  Effect.promise(async () => {
    const manifest = await findUp(
      join('node_modules', '@pandacss', 'dev', 'package.json'),
      dirname(configPath),
    )
    if (!manifest) return undefined
    const { version } = (await Bun.file(manifest).json()) as { version?: unknown }
    return typeof version === 'string' ? version : undefined
  }).pipe(
    Effect.flatMap((version) =>
      version !== undefined && Number.parseInt(version, 10) >= 2
        ? Effect.void
        : Effect.fail(PandaVersionUnsupported(version)),
    ),
  )

export const rewriteImportMap = (content: string, importMap: string) =>
  importMap === DEFAULT_IMPORT_MAP
    ? content
    : content.replace(/(['"])styled-system\//g, `$1${importMap}/`)

const DEV_TYPE_IMPORT = /import\s+type\s*\{([^}]*)\}\s*from\s*(['"])@pandacss\/dev\2/g

/** Moves type imports `@pandacss/dev` dropped in v2 (`RecipeConfig`, …) to `@pandacss/types`. */
export const rewriteTypeImports = (content: string) =>
  content.replace(DEV_TYPE_IMPORT, (statement, list: string, quote: string) => {
    const names = list
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    const moved = names.filter((name) => !DEV_TYPES.has(name.split(/\s+as\s+/)[0] ?? name))
    if (moved.length === 0) return statement
    const kept = names.filter((name) => !moved.includes(name))
    const toTypes = `import type { ${moved.join(', ')} } from ${quote}@pandacss/types${quote}`
    return kept.length === 0
      ? toTypes
      : `import type { ${kept.join(', ')} } from ${quote}@pandacss/dev${quote}\n${toTypes}`
  })

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
  ['components/ui', 'ui'],
  ['components', 'components'],
  ['theme/recipes', 'recipes'],
  ['theme', 'theme'],
  ['hooks', 'hooks'],
  ['lib', 'lib'],
] as const

/** Points the registry's `@/components/ui` style imports at the project's own aliases. */
export const rewriteAliases = (content: string, aliases: Aliases) =>
  REGISTRY_PATHS.reduce(
    (source, [path, key]) =>
      source.replace(
        new RegExp(`(['"])@/${path.replace('/', '\\/')}(?=['"/])`, 'g'),
        `$1${aliases[key]}`,
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
export const adaptRegistrySource = (content: string, { importMap, aliases, project, path }: Target) => {
  let source = rewriteTypeImports(rewriteAliases(rewriteImportMap(content, importMap), aliases)).replace(
    /\bcreateStyleContext\b/g,
    'createSlotRecipeContext',
  )
  source = stableKeys(dynamicViewport(toOklch(source)))
  if (path === 'global-css.ts') source = addReducedMotion(source)
  if (project?.reactCompiler) source = dropMemo(source)
  if (project?.react19) source = dropForwardRef(source)
  return source
}

/** Reads the project's React version and whether React Compiler is installed. */
export const readProject = (from: string) =>
  Effect.promise(async (): Promise<Project> => {
    const reactManifest = await findUp(join('node_modules', 'react', 'package.json'), from)
    const reactVersion = reactManifest
      ? ((await Bun.file(reactManifest).json()) as { version?: string }).version
      : undefined
    const manifest = await findUp('package.json', from)
    const { dependencies = {}, devDependencies = {} } = manifest
      ? ((await Bun.file(manifest).json()) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        })
      : {}
    return {
      react19: reactVersion !== undefined && Number.parseInt(reactVersion, 10) >= 19,
      reactCompiler: 'babel-plugin-react-compiler' in { ...dependencies, ...devDependencies },
    }
  })

/** True when adapted source imports `@pandacss/types`, which projects rarely list themselves. */
export const usesPandaTypes = (content: string) => /from\s*['"]@pandacss\/types['"]/.test(content)
