import { styleText } from "node:util"
import * as p from "@clack/prompts"
import { Effect } from "effect"
import { withConfig } from "~/utils/config"
import type { Config } from "~/utils/config"
import { install } from "~/utils/install"
import { withPandaConfig } from "~/utils/panda-config"
import { fetchRegistryIndex, fetchRegistryItems } from "~/utils/registry-client"
import type { RegistryError } from "~/utils/registry-client"
import { withTSConfig } from "~/utils/tsconfig"
import { describeError, ISSUES_URL } from "./report"

interface AddOptions {
  readonly all: boolean
}

const allComponents = fetchRegistryIndex().pipe(
  Effect.map((items) =>
    items.filter((item) => item.type === "registry:ui").map((item) => item.name),
  ),
)

/** `park add`: installs the named components (or all of them) and their dependencies. */
export const add = async (components: readonly string[], { all }: AddOptions): Promise<void> => {
  p.intro(styleText(["bgCyan", "black"], " Park UI "))

  let names: Effect.Effect<readonly string[], RegistryError, Config> = Effect.succeed(components)
  if (all) {
    names = allComponents
  }
  const program = names.pipe(
    Effect.tap((ids) => {
      p.note(`Installing ${ids.length} components...`, "Info")
    }),
    Effect.flatMap((ids) => fetchRegistryItems({ ids })),
    Effect.flatMap((items) => Effect.forEach(items, (item) => install(item), { discard: true })),
    Effect.tap(() => {
      p.outro("Components installed. Happy Hacking 🤞")
    }),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        process.exitCode = 1
        p.log.error(
          `An unexpected error occurred while installing components: ${describeError(error)}`,
        )
        p.outro(`You can report this issue at: ${styleText(["underline", "cyan"], ISSUES_URL)}`)
      }),
    ),
  )
  await Effect.runPromise(withPandaConfig(withTSConfig(withConfig(program))))
}
