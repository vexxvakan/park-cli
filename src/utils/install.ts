import { dirname, join } from 'node:path'
import * as p from '@clack/prompts'
import { Effect, Match, pipe } from 'effect'
import type { RegistryItem } from '../schema'
import { Config } from './config'
import { FileError } from './errors'
import { updateIndexFile } from './index-file'
import { findUp } from './fs'
import { adaptRegistrySource, readImportMap, rewriteTypeImports, usesPandaTypes } from './import-map'
import { PandaConfig, updatePandaConfig } from './panda-config'
import { updateRecipeIndex } from './recipes'

export const install = ({ panda, files = [] }: RegistryItem) =>
  Effect.all([
    Config,
    PandaConfig.pipe(Effect.flatMap(({ path }) => readImportMap(path))),
  ]).pipe(
    Effect.flatMap(([{ resolvedPaths, aliases }, importMap]) =>
      Effect.all([
        Effect.forEach(files, (file) =>
          pipe(
            Effect.tryPromise({
              try: async () => {
                const target = Match.value(file).pipe(
                  Match.when({ type: 'registry:block' }, ({ path }) =>
                    join(resolvedPaths.components, path),
                  ),
                  Match.when({ type: 'registry:color' }, ({ path }) =>
                    join(resolvedPaths.theme, path),
                  ),
                  Match.when({ type: 'registry:component' }, ({ path }) =>
                    join(resolvedPaths.components, path),
                  ),
                  Match.when({ type: 'registry:recipe' }, ({ path }) =>
                    join(resolvedPaths.recipes, path),
                  ),
                  Match.when({ type: 'registry:theme' }, ({ path }) =>
                    join(resolvedPaths.theme, path),
                  ),
                  Match.when({ type: 'registry:ui' }, ({ path }) => join(resolvedPaths.ui, path)),
                  Match.exhaustive,
                )
                // `init` ships an empty recipe index; re-running it must not drop recipes `add` registered.
                if (isRecipeIndex(file) && (await Bun.file(target).exists())) return
                await Bun.write(target, adaptRegistrySource(file.content, { importMap, aliases }))
              },
              catch: () => FileError(file.path),
            }),
            Effect.tap(() =>
              usesPandaTypes(rewriteTypeImports(file.content))
                ? Effect.promise(warnMissingPandaTypes)
                : Effect.void,
            ),
            Effect.tap(() => {
              if (file.type === 'registry:ui') {
                return Effect.tryPromise({
                  try: () =>
                    updateIndexFile({
                      path: join(resolvedPaths.ui, 'index.ts'),
                      exportStatement: file.exports,
                    }),
                  catch: () => FileError(join(resolvedPaths.ui, 'index.ts')),
                })
              }
              if (file.type === 'registry:recipe' && file.imports) {
                return updateRecipeIndex(join(resolvedPaths.recipes, 'index.ts'), {
                  type: /\bdefineSlotRecipe\b/.test(file.content) ? 'slotRecipe' : 'recipe',
                  imports: file.imports,
                })
              }
            }),
          ),
        ),
        updatePandaConfig(panda),
      ]),
    ),
  )

let warnedPandaTypes = false

/** Registry recipes import `@pandacss/types`; warn once when the project does not list it. */
const warnMissingPandaTypes = async () => {
  if (warnedPandaTypes) return
  warnedPandaTypes = true
  const manifest = await findUp('package.json')
  if (!manifest) return
  const { dependencies = {}, devDependencies = {} } = (await Bun.file(manifest).json()) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  if ('@pandacss/types' in dependencies || '@pandacss/types' in devDependencies) return
  p.log.warn(
    `Installed recipes import types from @pandacss/types, which ${dirname(manifest)}/package.json does not list.\nAdd it as a dev dependency at the same version as @pandacss/dev.`,
  )
}

const isRecipeIndex = (file: { type: string; path: string }) =>
  file.type === 'registry:recipe' && file.path === 'index.ts'
