export type RecipeKind = "recipe" | "slotRecipe"

interface Recipe {
  readonly type: RecipeKind
  /** The registry's import line, e.g. `import { avatar } from './avatar'`. */
  readonly imports: string
}

const IMPORT = /import\s*\{?\s*(?<name>\w+)\s*\}?\s*from\s*['"](?<from>[^'"]+)['"]/u
const EXPORT_NAMES: Readonly<Record<RecipeKind, string>> = {
  recipe: "recipes",
  slotRecipe: "slotRecipes",
}
const NONE = 0
const EMPTY_INDEX = "export const recipes = {}\nexport const slotRecipes = {}\n"

const renderObject = (exportName: string, names: readonly string[]): string => {
  if (names.length === NONE) {
    return `export const ${exportName} = {}`
  }
  return `export const ${exportName} = {\n${names.map((name) => `  ${name},`).join("\n")}\n}`
}

/** Adds `name` to the `export const <exportName> = { … }` object of shorthand properties. */
const addToObject = (source: string, exportName: string, name: string): string => {
  const pattern = new RegExp(`export const ${exportName} = \\{(?<body>[^}]*)\\}`, "u")
  const match = pattern.exec(source)
  if (match === null) {
    return `${source.trimEnd()}\n${renderObject(exportName, [name])}\n`
  }
  const names = (match.groups?.["body"] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
  if (names.includes(name)) {
    return source
  }
  const [whole] = match
  return source.replace(whole, renderObject(exportName, [...names, name]))
}

/** Adds `import { name } from 'from'` at the top unless the file already imports `name`. */
const addImport = (source: string, name: string, from: string): string => {
  const existing = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`, "u")
  if (existing.test(source)) {
    return source
  }
  return `import { ${name} } from "${from}"\n${source}`
}

/** Registers a recipe in the theme's recipe index, creating the index when needed. */
export const updateRecipeIndex = async (indexPath: string, recipe: Recipe): Promise<void> => {
  const match = IMPORT.exec(recipe.imports)
  const name = match?.groups?.["name"]
  const from = match?.groups?.["from"]
  if (name === undefined || from === undefined) {
    throw new Error(`Invalid import statement: ${recipe.imports}`)
  }
  const file = Bun.file(indexPath)
  let source = EMPTY_INDEX
  if (await file.exists()) {
    source = await file.text()
  }
  await Bun.write(
    indexPath,
    addToObject(addImport(source, name, from), EXPORT_NAMES[recipe.type], name),
  )
}
