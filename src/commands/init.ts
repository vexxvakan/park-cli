import { styleText } from "node:util"
import * as p from "@clack/prompts"
import { Effect, Layer } from "effect"
import { Config, resolveConfig, saveConfig } from "~/utils/config"
import { install } from "~/utils/install"
import { updatePandaConfig, withPandaConfig } from "~/utils/panda-config"
import { promptInitConfig } from "~/utils/prompt"
import type { InitAnswers, InitOptions } from "~/utils/prompt"
import { fetchRegistryItems } from "~/utils/registry-client"
import { withTSConfig } from "~/utils/tsconfig"
import { describeError, ISSUES_URL } from "./report"

const setUp = ({ framework, accentColor, grayColor, borderRadius }: InitAnswers) =>
  saveConfig(framework).pipe(
    Effect.flatMap((saved) => resolveConfig(saved)),
    Effect.flatMap((config) =>
      fetchRegistryItems({ ids: ["__init", accentColor, grayColor] }).pipe(
        Effect.flatMap((items) =>
          Effect.forEach(items, (item) => install(item), { discard: true }),
        ),
        Effect.zipRight(updatePandaConfig({ extension: borderRadius })),
        Effect.provide(Layer.succeed(Config, config)),
      ),
    ),
  )

/** `park init`: writes `components.json`, installs the theme and the chosen colors. */
export const init = async (options: InitOptions): Promise<void> => {
  p.intro(styleText(["bgCyan", "black"], " Park UI "))

  const program = promptInitConfig(options).pipe(
    Effect.flatMap((answers) => setUp(answers)),
    Effect.tap(() => {
      p.outro("Park UI has been initialized successfully! 🎉")
    }),
    Effect.catchTag("InitCancelled", ({ message }) =>
      Effect.sync(() => {
        p.cancel(message)
      }),
    ),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        process.exitCode = 1
        p.log.error(`An error occurred while initializing Park UI: ${describeError(error)}`)
        p.outro(`You can report this issue at: ${styleText(["underline", "cyan"], ISSUES_URL)}`)
      }),
    ),
  )

  await Effect.runPromise(withPandaConfig(withTSConfig(program)))
}
