import { dirname, join, resolve } from 'node:path'

/** Walks up from `from` to the filesystem root and returns the first `name` that exists. */
export const findUp = async (name: string, from = process.cwd()): Promise<string | undefined> => {
  let directory = resolve(from)
  while (true) {
    const candidate = join(directory, name)
    if (await Bun.file(candidate).exists()) return candidate
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

/**
 * Resolves an import specifier through tsconfig `paths`, like TypeScript does:
 * the longest matching pattern wins and targets resolve against `baseUrl`.
 */
export const matchPath = (
  specifier: string,
  baseUrl: string,
  paths: Record<string, readonly string[]>,
): string | undefined => {
  const candidates = Object.entries(paths)
    .map(([pattern, targets]) => {
      const star = pattern.indexOf('*')
      const prefix = star === -1 ? pattern : pattern.slice(0, star)
      const suffix = star === -1 ? '' : pattern.slice(star + 1)
      return { pattern, prefix, suffix, star, targets }
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)

  for (const { prefix, suffix, star, targets } of candidates) {
    const target = targets[0]
    if (!target) continue
    if (star === -1) {
      if (specifier === prefix) return resolve(baseUrl, target)
      continue
    }
    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length
    ) {
      const captured = specifier.slice(prefix.length, specifier.length - suffix.length)
      return resolve(baseUrl, target.replace('*', captured))
    }
  }
  return undefined
}
