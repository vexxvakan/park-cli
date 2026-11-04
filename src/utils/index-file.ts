interface Args {
  path: string
  exportStatement?: string
}

interface NamedSymbol {
  name: string
  isType: boolean
}

const NAMESPACE_EXPORT = /export\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/
const NAMED_EXPORT = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/
const NAMED_EXPORT_GLOBAL = new RegExp(NAMED_EXPORT.source, 'g')
const NAMESPACE_EXPORT_GLOBAL = new RegExp(NAMESPACE_EXPORT.source, 'g')

const parseSymbols = (list: string): NamedSymbol[] =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part.startsWith('type ')
        ? { name: part.slice(5).trim(), isType: true }
        : { name: part, isType: false },
    )

const formatNamed = (symbols: NamedSymbol[], from: string) =>
  `export { ${symbols.map((s) => (s.isType ? `type ${s.name}` : s.name)).join(', ')} } from '${from}'`

/** Adds a re-export to a barrel index file unless an equivalent one is already there. */
export const updateIndexFile = async ({ path, exportStatement }: Args) => {
  if (!exportStatement) return

  const file = Bun.file(path)
  const source = (await file.exists()) ? await file.text() : ''
  const statement = exportStatement.replace(/\s+/g, ' ').trim()

  let line: string | undefined

  const namespace = statement.match(NAMESPACE_EXPORT)
  if (namespace) {
    const [, name, from] = namespace
    const exists = [...source.matchAll(NAMESPACE_EXPORT_GLOBAL)].some(
      ([, existingName, existingFrom]) => existingName === name && existingFrom === from,
    )
    if (!exists) line = `export * as ${name} from '${from}'`
  }

  const named = statement.match(NAMED_EXPORT)
  if (named) {
    const [, list = '', from = ''] = named
    const symbols = parseSymbols(list)
    const existing = [...source.matchAll(NAMED_EXPORT_GLOBAL)]
      .filter(([, , existingFrom]) => existingFrom === from)
      .flatMap(([, existingList = '']) => parseSymbols(existingList))
    const exists = symbols.every((s) =>
      existing.some((e) => e.name === s.name && e.isType === s.isType),
    )
    if (!exists) line = formatNamed(symbols, from)
  }

  if (!line) return

  const separator = source === '' || source.endsWith('\n') ? '' : '\n'
  await Bun.write(path, `${source}${separator}${line}\n`)
}
