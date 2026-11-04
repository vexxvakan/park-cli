import { Data } from "effect"

const describe = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

export class HttpError extends Data.TaggedError("HttpError")<{
  readonly message: string
}> {
  public constructor(path: string, cause: unknown) {
    super({
      message: `Failed to load ${path} from the Park UI registry: ${describe(cause)}`,
    })
  }
}
