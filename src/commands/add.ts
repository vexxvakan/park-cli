import { styleText } from 'node:util'
import * as p from '@clack/prompts'
import { Effect, pipe } from 'effect'
import { withConfig } from '~/utils/config'
import { install } from '~/utils/install'
import { withPandaConfig } from '~/utils/panda-config'
import { fetchRegistryIndex, fetchRegistryItems } from '~/utils/registry-client'
import { withTSConfig } from '~/utils/tsconfig'

export const add = async (components: string[], opts: { all: boolean }) => {
    p.intro(styleText(['bgCyan', 'black'], ' Park UI '))

    const program = pipe(
      opts.all
        ? fetchRegistryIndex().pipe(
            Effect.map((items) => items.filter((item) => item.type === 'registry:ui')),
            Effect.map((items) => items.map((item) => item.name)),
          )
        : Effect.succeed(components),
      Effect.tap((items) => p.note(`Installing ${items.length} components...`, 'Info')),
      Effect.flatMap((ids) => fetchRegistryItems({ ids })),
      Effect.flatMap((items) => Effect.forEach(items, (item) => install(item))),
      Effect.tap(() => p.outro('Components installed. Happy Hacking 🤞')),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          process.exitCode = 1
          p.log.error(
            `An unexpected error occurred while installing components: ${'message' in error ? error.message : String(error)}`,
          )
          p.outro(
            `You can report this issue at: ${styleText(['underline', 'cyan'], 'https://github.com/vexxvakan/park-cli/issues')}`,
          )
        }),
      ),
    )
    await Effect.runPromise(withPandaConfig(withTSConfig(withConfig(program))))
}
