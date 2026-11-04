import { Data } from "effect"

export class TSConfigInvalid extends Data.TaggedError("TSConfigInvalid")<{
  readonly message: string
}> {
  public constructor() {
    super({ message: "No import alias found in your tsconfig.json file." })
  }
}
