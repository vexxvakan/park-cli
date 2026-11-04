export const PandaConfigNotFound = (configPath: string) => ({
  _tag: 'PandaConfigNotFound' as const,
  message: `No Panda CSS configuration found at ${configPath}\nInstall Panda CSS then try again.`,
})

export const PandaVersionUnsupported = (found: string | undefined) => ({
  _tag: 'PandaVersionUnsupported' as const,
  message: `Park UI needs @pandacss/dev 2 or newer; ${found ? `found ${found}` : 'it is not installed'}.\nSee https://panda-css.com/docs/get-started/upgrading-to-v2`,
})

export const PandaConfigInvalid = (configPath: string) => ({
  _tag: 'PandaConfigInvalid' as const,
  message: `Failed to update your Panda config at ${configPath}.\nPlease review your configuration file`,
})

export const ConfigNotFound = (configPath: string) => ({
  _tag: 'ConfigNotFound' as const,
  message: `No Park UI configuration found at ${configPath}.`,
})

export const ConfigInvalid = (configPath: string) => ({
  _tag: 'ConfigInvalid' as const,
  message: `Park UI configuration at ${configPath} is invalid or outdated.`,
})

export const TSConfigNotFound = (configPath: string) => ({
  _tag: 'TSConfigNotFound' as const,
  message: `No tsconfig.json or jsconfig.json found at ${configPath}.\nPlease create one then try again.`,
})

export const TSConfigInvalid = () => ({
  _tag: 'TSConfigInvalid' as const,
  message: `No import alias found in your tsconfig.json file.`,
})

export const RegistryItemNotFound = (id: string) => ({
  _tag: 'RegistryItemNotFound' as const,
  message: `No Park UI registry item named "${id}".`,
})

export const HttpError = (path: string, cause: unknown) => ({
  _tag: 'HttpError' as const,
  message: `Failed to load ${path} from the Park UI registry: ${cause instanceof Error ? cause.message : String(cause)}`,
})

export const FileError = (filePath: string) => ({
  _tag: 'FileError' as const,
  message: `Failed to read or write file at ${filePath}`,
})
