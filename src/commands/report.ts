export const ISSUES_URL = "https://github.com/vexxvakan/park-cli/issues"

/** A readable message for anything an Effect can fail with. */
export const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message)
  }
  return JSON.stringify(error)
}
