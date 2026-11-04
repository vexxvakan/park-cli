/** The parts of a `package.json` the CLI reads. */
export interface Manifest {
  readonly version: string | undefined
  readonly dependencies: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringRecord = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) {
    return {}
  }
  const record: Record<string, string> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      record[key] = entryValue
    }
  }
  return record
}

const stringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value
  }
  return undefined
}

/** Reads a `package.json`; missing or malformed fields come back empty. */
export const readManifest = async (path: string): Promise<Manifest> => {
  const json: unknown = await Bun.file(path).json()
  if (!isRecord(json)) {
    return { dependencies: {}, devDependencies: {}, version: undefined }
  }
  const { version } = json
  return {
    dependencies: stringRecord(json["dependencies"]),
    devDependencies: stringRecord(json["devDependencies"]),
    version: stringOrUndefined(version),
  }
}

/** Major version of a semver string such as `2.5.0`, or NaN. */
export const majorVersion = (version: string): number => {
  const [major = ""] = version.split(".")
  return Number(major)
}

/** True when the manifest lists `name` as a dependency or dev dependency. */
export const dependsOn = (manifest: Manifest, name: string): boolean =>
  Object.hasOwn(manifest.dependencies, name) || Object.hasOwn(manifest.devDependencies, name)
