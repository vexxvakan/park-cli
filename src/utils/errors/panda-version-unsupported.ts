import { Data } from "effect"

const describeInstalled = (found: string | undefined): string => {
  if (found === undefined) {
    return "it is not installed"
  }
  return `found ${found}`
}

export class PandaVersionUnsupported extends Data.TaggedError("PandaVersionUnsupported")<{
  readonly message: string
}> {
  public constructor(found: string | undefined) {
    super({
      message: `Park UI needs @pandacss/dev 2 or newer; ${describeInstalled(found)}.\nSee https://panda-css.com/docs/get-started/upgrading-to-v2`,
    })
  }
}
