import { Console, Effect } from "effect"
import { Config, withConfig } from "~/utils/config"
import { withPandaConfig } from "~/utils/panda-config"
import { withTSConfig } from "~/utils/tsconfig"

/** `park debug`: prints the resolved configuration. */
export const debug = async (): Promise<void> => {
  const program = Config.pipe(Effect.flatMap((config) => Console.log(config)))
  await Effect.runPromise(withPandaConfig(withTSConfig(withConfig(program))))
}
