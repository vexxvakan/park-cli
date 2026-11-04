import { Data } from "effect"

export class InitCancelled extends Data.TaggedError("InitCancelled")<{
  readonly message: string
}> {
  public constructor() {
    super({
      message: "Setup cancelled. Run the command again when you're ready to configure Park UI.",
    })
  }
}
