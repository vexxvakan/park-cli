interface Args {
  readonly path: string
  readonly exportStatement?: string | undefined
}

interface NamedSymbol {
  readonly name: string
  readonly isType: boolean
}

const TYPE_PREFIX = "type "

const NAMESPACE_EXPORT = /export\s*\*\s*as\s+(?<name>\w+)\s+from\s*['"](?<from>[^'"]+)['"]/u
const NAMED_EXPORT = /export\s*\{(?<list>[^}]+)\}\s*from\s*['"](?<from>[^'"]+)['"]/u
const NAMED_EXPORT_GLOBAL = new RegExp(NAMED_EXPORT.source, "gu")
const NAMESPACE_EXPORT_GLOBAL = new RegExp(NAMESPACE_EXPORT.source, "gu")

const parseSymbol = (part: string): NamedSymbol => {
  if (part.startsWith(TYPE_PREFIX)) {
    return { isType: true, name: part.slice(TYPE_PREFIX.length).trim() }
  }
  return { isType: false, name: part }
}

const parseSymbols = (list: string): NamedSymbol[] =>
  list
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => parseSymbol(part))

const formatSymbol = ({ isType, name }: NamedSymbol): string => {
  if (isType) {
    return `${TYPE_PREFIX}${name}`
  }
  return name
}

const formatNamed = (symbols: readonly NamedSymbol[], from: string): string =>
  `export { ${symbols.map((symbol) => formatSymbol(symbol)).join(", ")} } from '${from}'`

/** The namespace re-export to add, or undefined when the index already has it. */
const namespaceLine = (statement: string, source: string): string | undefined => {
  const groups = NAMESPACE_EXPORT.exec(statement)?.groups
  if (groups === undefined) {
    return undefined
  }
  const { name, from } = groups
  const exists = [...source.matchAll(NAMESPACE_EXPORT_GLOBAL)].some(
    (match) => match.groups?.["name"] === name && match.groups["from"] === from,
  )
  if (exists || name === undefined || from === undefined) {
    return undefined
  }
  return `export * as ${name} from '${from}'`
}

/** The named re-export to add, or undefined when the index already exports every symbol. */
const namedLine = (statement: string, source: string): string | undefined => {
  const groups = NAMED_EXPORT.exec(statement)?.groups
  if (groups === undefined) {
    return undefined
  }
  const { list = "", from = "" } = groups
  const symbols = parseSymbols(list)
  const existing = [...source.matchAll(NAMED_EXPORT_GLOBAL)]
    .filter((match) => match.groups?.["from"] === from)
    .flatMap((match) => parseSymbols(match.groups?.["list"] ?? ""))
  const exists = symbols.every((symbol) =>
    existing.some((other) => other.name === symbol.name && other.isType === symbol.isType),
  )
  if (exists) {
    return undefined
  }
  return formatNamed(symbols, from)
}

const readSource = async (path: string): Promise<string> => {
  const file = Bun.file(path)
  if (await file.exists()) {
    return file.text()
  }
  return ""
}

/** Adds a re-export to a barrel index file unless an equivalent one is already there. */
export const updateIndexFile = async ({ path, exportStatement }: Args): Promise<void> => {
  if (exportStatement === undefined || exportStatement === "") {
    return
  }
  const source = await readSource(path)
  const statement = exportStatement.replaceAll(/\s+/gu, " ").trim()
  const line = namedLine(statement, source) ?? namespaceLine(statement, source)
  if (line === undefined) {
    return
  }
  let separator = "\n"
  if (source === "" || source.endsWith("\n")) {
    separator = ""
  }
  await Bun.write(path, `${source}${separator}${line}\n`)
}
