import { dirname, join, resolve } from "node:path"

const NOT_FOUND = -1
const WILDCARD = "*"

/** Walks up from `from` to the filesystem root and returns the first `name` that exists. */
export const findUp = async (
  name: string,
  from: string = process.cwd(),
): Promise<string | undefined> => {
  let directory = resolve(from)
  let parent = dirname(directory)
  while (!(await Bun.file(join(directory, name)).exists())) {
    if (parent === directory) {
      return undefined
    }
    directory = parent
    parent = dirname(directory)
  }
  return join(directory, name)
}

interface PathPattern {
  readonly prefix: string
  readonly suffix: string
  readonly wildcard: boolean
  readonly target: string | undefined
}

const toPattern = (pattern: string, targets: readonly string[]): PathPattern => {
  const [target] = targets
  const star = pattern.indexOf(WILDCARD)
  if (star === NOT_FOUND) {
    return { prefix: pattern, suffix: "", target, wildcard: false }
  }
  return {
    prefix: pattern.slice(undefined, star),
    suffix: pattern.slice(star + WILDCARD.length),
    target,
    wildcard: true,
  }
}

/** The target `specifier` resolves to through one pattern, or undefined when it does not match. */
const resolveThrough = (
  specifier: string,
  baseUrl: string,
  { prefix, suffix, target, wildcard }: PathPattern,
): string | undefined => {
  if (target === undefined) {
    return undefined
  }
  if (!wildcard) {
    if (specifier === prefix) {
      return resolve(baseUrl, target)
    }
    return undefined
  }
  if (
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix) &&
    specifier.length >= prefix.length + suffix.length
  ) {
    const captured = specifier.slice(prefix.length, specifier.length - suffix.length)
    return resolve(baseUrl, target.replace(WILDCARD, captured))
  }
  return undefined
}

/**
 * Resolves an import specifier through tsconfig `paths`, like TypeScript does:
 * the longest matching pattern wins and targets resolve against `baseUrl`.
 */
export const matchPath = (
  specifier: string,
  baseUrl: string,
  paths: Readonly<Record<string, readonly string[]>>,
): string | undefined => {
  const patterns = Object.entries(paths)
    .map(([pattern, targets]) => toPattern(pattern, targets))
    .toSorted((first, second) => second.prefix.length - first.prefix.length)
  for (const pattern of patterns) {
    const resolved = resolveThrough(specifier, baseUrl, pattern)
    if (resolved !== undefined) {
      return resolved
    }
  }
  return undefined
}
