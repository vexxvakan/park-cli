import { dirname, join } from "node:path"
import * as p from "@clack/prompts"
import { Effect } from "effect"
import type { RegistryFile, RegistryItem } from "../schema"
import { Config } from "./config"
import type { ConfigShape } from "./config"
import { FileError } from "./errors/file-error"
import { findUp } from "./fs"
import {
  adaptRegistrySource,
  readImportMap,
  readProject,
  rewriteTypeImports,
  usesPandaTypes,
} from "./import-map"
import type { Project } from "./import-map"
import { updateIndexFile } from "./index-file"
import { dependsOn, readManifest } from "./manifest"
import { PandaConfig, updatePandaConfig } from "./panda-config"
import { updateRecipeIndex } from "./recipes"
import type { RecipeKind } from "./recipes"

type ResolvedPaths = ConfigShape["resolvedPaths"]

/** Where each kind of registry file lives in the project. */
const DESTINATIONS: Readonly<Record<RegistryFile["type"], keyof ResolvedPaths>> = {
  "registry:block": "components",
  "registry:color": "theme",
  "registry:component": "components",
  "registry:recipe": "recipes",
  "registry:theme": "theme",
  "registry:ui": "ui",
}

const INDEX_FILE = "index.ts"

/** `init` ships an empty recipe index; re-running it must not drop recipes `add` registered. */
const isRecipeIndex = (file: RegistryFile): boolean =>
  file.type === "registry:recipe" && file.path === INDEX_FILE

interface InstallContext {
  readonly config: ConfigShape
  readonly importMap: string
  readonly project: Project
}

const writeRegistryFile = async (
  file: RegistryFile,
  { config, importMap, project }: InstallContext,
): Promise<void> => {
  const target = join(config.resolvedPaths[DESTINATIONS[file.type]], file.path)
  if (isRecipeIndex(file) && (await Bun.file(target).exists())) {
    return
  }
  await Bun.write(
    target,
    adaptRegistrySource(file.content, {
      aliases: config.aliases,
      importMap,
      path: file.path,
      project,
    }),
  )
}

let warnedPandaTypes = false

/** Registry recipes import `@pandacss/types`; warn once when the project does not list it. */
const warnMissingPandaTypes = async (): Promise<void> => {
  if (warnedPandaTypes) {
    return
  }
  warnedPandaTypes = true
  const manifest = await findUp("package.json")
  if (manifest === undefined || dependsOn(await readManifest(manifest), "@pandacss/types")) {
    return
  }
  p.log.warn(
    `Installed recipes import types from @pandacss/types, which ${dirname(manifest)}/package.json does not list.\nAdd it as a dev dependency at the same version as @pandacss/dev.`,
  )
}

const recipeKind = (content: string): RecipeKind => {
  if (/\bdefineSlotRecipe\b/u.test(content)) {
    return "slotRecipe"
  }
  return "recipe"
}

/** Registers the file in the ui or recipe index it belongs to. */
const register = async (file: RegistryFile, paths: ResolvedPaths): Promise<void> => {
  if (file.type === "registry:ui") {
    await updateIndexFile({ exportStatement: file.exports, path: join(paths.ui, INDEX_FILE) })
  } else if (file.type === "registry:recipe" && file.imports !== undefined) {
    await updateRecipeIndex(join(paths.recipes, INDEX_FILE), {
      imports: file.imports,
      type: recipeKind(file.content),
    })
  }
}

const installFile = async (file: RegistryFile, context: InstallContext): Promise<void> => {
  await writeRegistryFile(file, context)
  if (usesPandaTypes(rewriteTypeImports(file.content))) {
    await warnMissingPandaTypes()
  }
  await register(file, context.config.resolvedPaths)
}

/** Writes a registry item's files into the project and merges its Panda extension. */
export const install = ({
  panda,
  files = [],
}: RegistryItem): Effect.Effect<void, FileError, Config | PandaConfig> =>
  Effect.all([
    Config,
    PandaConfig.pipe(Effect.flatMap(({ path }) => readImportMap(path))),
    PandaConfig.pipe(Effect.flatMap(({ path }) => readProject(dirname(path)))),
  ]).pipe(
    Effect.flatMap(([config, importMap, project]) =>
      Effect.forEach(
        files,
        (file) =>
          Effect.tryPromise({
            catch: () => new FileError(file.path),
            try: () => installFile(file, { config, importMap, project }),
          }),
        { discard: true },
      ),
    ),
    Effect.zipRight(updatePandaConfig(panda)),
  )
