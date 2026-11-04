import { Data } from "effect"

export class PandaConfigNotFound extends Data.TaggedError("PandaConfigNotFound")<{
  readonly message: string
}> {
  public constructor(configPath: string) {
    super({
      message: `No Panda CSS configuration found at ${configPath}\nInstall Panda CSS then try again.`,
    })
  }
}
