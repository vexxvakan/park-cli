import * as p from "@clack/prompts"
import { Effect } from "effect"
import type { Framework } from "~/schema"
import { InitCancelled } from "./errors/init-cancelled"
import { fetchColors } from "./registry-client"
import type { Colors } from "./registry-client"

export const FRAMEWORKS = ["react", "solid"] as const satisfies readonly Framework[]
export const RADII = ["none", "xs", "sm", "md", "lg", "xl", "2xl"] as const
export type Radius = (typeof RADII)[number]

const NOT_FOUND = -1
const STEP = 1
const MAX_SUGGESTIONS = 8
const NONE = 0

/** Panda radii scale; `l2` is the chosen step, `l1` one smaller, `l3` one larger. */
const SCALE = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const

/**
 * Steps `@pandacss/preset-panda` has no token for, written as plain values.
 * `2xs` is half of `xs` (0.125rem).
 */
const RAW: Partial<Record<string, string>> = { "2xs": "0.0625rem", none: "0" }

const tokenValue = (step: string): string => RAW[step] ?? `{radii.${step}}`

export interface RadiusTokens {
  readonly theme: {
    readonly extend: {
      readonly semanticTokens: {
        readonly radii: Readonly<Record<"l1" | "l2" | "l3", { readonly value: string }>>
      }
    }
  }
}

/** Semantic radius tokens for a chosen scale, matching the Park UI website's theme builder. */
export const radiusTokens = (radius: Radius): RadiusTokens => {
  const scale: readonly string[] = SCALE
  const step = scale.indexOf(radius)
  let steps: readonly string[] = []
  if (step !== NOT_FOUND) {
    steps = SCALE.slice(step - STEP, step + STEP + STEP)
  }
  const [l1 = "none", l2 = "none", l3 = "none"] = steps
  return {
    theme: {
      extend: {
        semanticTokens: {
          radii: {
            l1: { value: tokenValue(l1) },
            l2: { value: tokenValue(l2) },
            l3: { value: tokenValue(l3) },
          },
        },
      },
    },
  }
}

export interface InitOptions {
  readonly framework?: string
  readonly accent?: string
  readonly gray?: string
  readonly radius?: string
  /** Use defaults for anything not given instead of prompting. */
  readonly yes: boolean
}

const DEFAULTS = { accent: "neutral", framework: "react", gray: "neutral", radius: "sm" } as const

type Flag = keyof typeof DEFAULTS
type Given = Partial<Record<Flag, string>>

export interface InitAnswers {
  readonly framework: Framework
  readonly accentColor: string
  readonly grayColor: string
  readonly borderRadius: RadiusTokens
}

interface Answers {
  readonly framework: Framework
  readonly accentColor: string
  readonly grayColor: string
  readonly radius: Radius
}

const isFramework = (value: string): value is Framework =>
  FRAMEWORKS.some((framework) => framework === value)

const isRadius = (value: string): value is Radius => RADII.some((radius) => radius === value)

const withDefault = (value: string | undefined, flag: Flag, yes: boolean): string | undefined => {
  if (value === undefined && yes) {
    return DEFAULTS[flag]
  }
  return value
}

/** The first flag whose value is not allowed, as an error. */
const validate = (given: Given, colors: Colors): Error | undefined => {
  const checks: readonly (readonly [Flag, readonly string[]])[] = [
    ["framework", FRAMEWORKS],
    ["accent", colors.accentColors.map(({ value }) => value)],
    ["gray", colors.neutralColors.map(({ value }) => value)],
    ["radius", RADII],
  ]
  for (const [flag, allowed] of checks) {
    const value = given[flag]
    if (value !== undefined && !allowed.includes(value)) {
      return new Error(`Invalid --${flag} "${value}". Use one of: ${allowed.join(", ")}.`)
    }
  }
  return undefined
}

const askFramework = async (given: string | undefined): Promise<Framework | undefined> => {
  if (given !== undefined && isFramework(given)) {
    return given
  }
  const choice = await p.select<Framework>({
    initialValue: "react",
    message: "Which JavaScript framework are you using?",
    options: FRAMEWORKS.map((value) => ({ value })),
  })
  if (p.isCancel(choice)) {
    return undefined
  }
  return choice
}

const askColor = async (
  given: string | undefined,
  message: string,
  options: p.Option<string>[],
): Promise<string | undefined> => {
  if (given !== undefined) {
    return given
  }
  const choice = await p.autocomplete({
    maxItems: MAX_SUGGESTIONS,
    message,
    options,
    placeholder: "Type to search...",
  })
  if (p.isCancel(choice)) {
    return undefined
  }
  return choice
}

const radiusOption = (value: Radius): p.Option<Radius> => {
  if (value === "sm") {
    return { hint: "default", value }
  }
  return { value }
}

const askRadius = async (given: string | undefined): Promise<Radius | undefined> => {
  if (given !== undefined && isRadius(given)) {
    return given
  }
  const choice = await p.select<Radius>({
    initialValue: "sm",
    message: "What border radius scale would you like to use?",
    options: RADII.map((value) => radiusOption(value)),
  })
  if (p.isCancel(choice)) {
    return undefined
  }
  return choice
}

/** Asks only for what the flags left out, in a fixed order; undefined when cancelled. */
const prompt = async (given: Given, colors: Colors): Promise<Answers | undefined> => {
  const framework = await askFramework(given.framework)
  if (framework === undefined) {
    return undefined
  }
  const accentColor = await askColor(
    given.accent,
    "Which color would you like to use as the accent color?",
    colors.accentColors,
  )
  if (accentColor === undefined) {
    return undefined
  }
  const grayColor = await askColor(
    given.gray,
    "Which color would you like to use as the gray color?",
    colors.neutralColors,
  )
  if (grayColor === undefined) {
    return undefined
  }
  const radius = await askRadius(given.radius)
  if (radius === undefined) {
    return undefined
  }
  return { accentColor, framework, grayColor, radius }
}

const collect = (given: Given, colors: Colors): Effect.Effect<Answers, Error | InitCancelled> =>
  Effect.tryPromise({
    catch: () => new Error("Failed to collect configuration. Please try again."),
    try: () => prompt(given, colors),
  }).pipe(
    Effect.flatMap((answers) => {
      if (answers === undefined) {
        return Effect.fail(new InitCancelled())
      }
      return Effect.succeed(answers)
    }),
  )

const resolve = (
  options: InitOptions,
  colors: Colors,
): Effect.Effect<Answers, Error | InitCancelled> => {
  const given: Given = {
    accent: withDefault(options.accent, "accent", options.yes),
    framework: withDefault(options.framework, "framework", options.yes),
    gray: withDefault(options.gray, "gray", options.yes),
    radius: withDefault(options.radius, "radius", options.yes),
  }
  const error = validate(given, colors)
  if (error !== undefined) {
    return Effect.fail(error)
  }
  const missing = Object.entries(given)
    .filter(([, value]) => value === undefined)
    .map(([flag]) => `--${flag}`)
  if (missing.length > NONE && !process.stdin.isTTY) {
    return Effect.fail(
      new Error(
        `No terminal to prompt in. Pass ${missing.join(", ")}, or --yes to use the defaults.`,
      ),
    )
  }
  return collect(given, colors)
}

export const promptInitConfig = (
  options: InitOptions,
): Effect.Effect<InitAnswers, Error | InitCancelled> =>
  fetchColors().pipe(
    Effect.mapError((error) => new Error(error.message)),
    Effect.flatMap((colors) => resolve(options, colors)),
    Effect.map(({ framework, accentColor, grayColor, radius }) => ({
      accentColor,
      borderRadius: radiusTokens(radius),
      framework,
      grayColor,
    })),
  )
