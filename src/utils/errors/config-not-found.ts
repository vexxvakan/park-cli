import { Data } from "effect"

export class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly message: string
}> {
  public constructor(configPath: string) {
    super({ message: `No Park UI configuration found at ${configPath}.` })
  }
}
