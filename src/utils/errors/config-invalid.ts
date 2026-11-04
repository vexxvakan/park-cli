import { Data } from "effect"

export class ConfigInvalid extends Data.TaggedError("ConfigInvalid")<{
  readonly message: string
}> {
  public constructor(configPath: string) {
    super({ message: `Park UI configuration at ${configPath} is invalid or outdated.` })
  }
}
