import { Data } from "effect"

export class FileError extends Data.TaggedError("FileError")<{
  readonly message: string
}> {
  public constructor(filePath: string) {
    super({ message: `Failed to read or write file at ${filePath}` })
  }
}
