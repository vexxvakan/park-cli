import { styleText } from 'node:util'
import * as p from '@clack/prompts'
import { Effect, Layer, pipe, Schema } from 'effect'
import { Config, ConigSchema, saveConfig } from '~/utils/config'
import { install } from '~/utils/install'
import { updatePandaConfig, withPandaConfig } from '~/utils/panda-config'
import { promptInitConfig } from '~/utils/prompt'
import { fetchRegistryItems } from '~/utils/registry-client'
import { withTSConfig } from '~/utils/tsconfig'

export const init = async () => {
  p.intro(styleText(['bgCyan', 'black'], ' Park UI '))

  const program = promptInitConfig().pipe(
    Effect.flatMap(({ framework, accentColor, grayColor, borderRadius }) =>
      pipe(
        saveConfig(framework),
        Effect.flatMap((config) => Schema.decodeUnknown(ConigSchema)(config)),
        Effect.flatMap((config) =>
          pipe(
            Effect.all([
              fetchRegistryItems({ ids: ['__init', accentColor, grayColor] }).pipe(
                Effect.flatMap((items) => Effect.all(items.map(install))),
              ),
              updatePandaConfig({ extension: borderRadius }),
            ]),
            Effect.provide(Layer.effect(Config, Effect.succeed(config))),
          ),
        ),
      ),
    ),
    Effect.tap(() => p.outro(`Park UI has been initialized successfully! 🎉`)),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        p.log.error(`An error occurred while initializing Park UI: ${describeError(error)}`)
        p.outro(
          `You can report this issue at: ${styleText(['underline', 'cyan'], 'https://github.com/vexxvakan/park-cli/issues')}`,
        )
      }),
    ),
  )

  await Effect.runPromise(withPandaConfig(withTSConfig(program)))
}

const describeError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : JSON.stringify(error)
