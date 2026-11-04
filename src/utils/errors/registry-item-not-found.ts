import { Data } from "effect"

export class RegistryItemNotFound extends Data.TaggedError("RegistryItemNotFound")<{
  readonly message: string
}> {
  public constructor(id: string) {
    super({ message: `No Park UI registry item named "${id}".` })
  }
}
