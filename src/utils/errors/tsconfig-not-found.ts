import { Data } from "effect"

export class TSConfigNotFound extends Data.TaggedError("TSConfigNotFound")<{
  readonly message: string
}> {
  public constructor(configPath: string) {
    super({
      message: `No tsconfig.json or jsconfig.json found at ${configPath}.\nPlease create one then try again.`,
    })
  }
}
