import * as p from '@clack/prompts'
import { Effect } from 'effect'
import type { Framework } from '~/schema'
import { fetchColors } from './registry-client'

export const FRAMEWORKS = ['react', 'solid'] as const satisfies readonly Framework[]
export const RADII = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const
export type Radius = (typeof RADII)[number]

/** Panda radii scale; `l2` is the chosen step, `l1` one smaller, `l3` one larger. */
const SCALE = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const

/** Semantic radius tokens for a chosen scale, matching the Park UI website's theme builder. */
export const radiusTokens = (radius: Radius) => {
  const step = SCALE.indexOf(radius as (typeof SCALE)[number])
  const [l1, l2, l3] =
    radius === 'none' || step === -1 ? ['none', 'none', 'none'] : SCALE.slice(step - 1, step + 2)
  return {
    theme: {
      extend: {
        semanticTokens: {
          radii: {
            l1: { value: `{radii.${l1}}` },
            l2: { value: `{radii.${l2}}` },
            l3: { value: `{radii.${l3}}` },
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

const DEFAULTS = { framework: 'react', accent: 'neutral', gray: 'neutral', radius: 'sm' } as const

interface Answers {
  framework: Framework
  accentColor: string
  grayColor: string
  borderRadius: Radius
}

const invalid = (flag: string, value: string, allowed: readonly string[]) =>
  new Error(`Invalid --${flag} "${value}". Use one of: ${allowed.join(', ')}.`)

export const promptInitConfig = (options: InitOptions) =>
  fetchColors().pipe(
    Effect.flatMap(({ accentColors, neutralColors }) => {
      const accents = accentColors.map(({ value }) => value)
      const grays = neutralColors.map(({ value }) => value)

      const given = {
        framework: options.framework ?? (options.yes ? DEFAULTS.framework : undefined),
        accent: options.accent ?? (options.yes ? DEFAULTS.accent : undefined),
        gray: options.gray ?? (options.yes ? DEFAULTS.gray : undefined),
        radius: options.radius ?? (options.yes ? DEFAULTS.radius : undefined),
      }

      if (given.framework && !(FRAMEWORKS as readonly string[]).includes(given.framework))
        return Effect.fail(invalid('framework', given.framework, FRAMEWORKS))
      if (given.accent && !accents.includes(given.accent))
        return Effect.fail(invalid('accent', given.accent, accents))
      if (given.gray && !grays.includes(given.gray))
        return Effect.fail(invalid('gray', given.gray, grays))
      if (given.radius && !(RADII as readonly string[]).includes(given.radius))
        return Effect.fail(invalid('radius', given.radius, RADII))

      const missing = Object.entries(given)
        .filter(([, value]) => value === undefined)
        .map(([flag]) => `--${flag}`)

      if (missing.length > 0 && !process.stdin.isTTY)
        return Effect.fail(
          new Error(
            `No terminal to prompt in. Pass ${missing.join(', ')}, or --yes to use the defaults.`,
          ),
        )

      return Effect.tryPromise({
        try: () => prompt(given, { accentColors, neutralColors }),
        catch: () => new Error('Failed to collect configuration. Please try again.'),
      })
    }),
    Effect.map(({ framework, accentColor, grayColor, borderRadius }) => ({
      framework,
      accentColor,
      grayColor,
      borderRadius: radiusTokens(borderRadius),
    })),
  )

type Option = p.Option<string>

interface Colors {
  accentColors: Option[]
  neutralColors: Option[]
}

/** Asks only for what the flags left out. */
const prompt = (
  given: Partial<Record<'framework' | 'accent' | 'gray' | 'radius', string>>,
  { accentColors, neutralColors }: Colors,
): Promise<Answers> =>
  p.group(
    {
      framework: () =>
        given.framework
          ? Promise.resolve(given.framework as Framework)
          : p.select<Framework>({
              message: 'Which JavaScript framework are you using?',
              options: FRAMEWORKS.map((value) => ({ value })),
              initialValue: 'react',
            }),
      accentColor: () =>
        given.accent
          ? Promise.resolve(given.accent)
          : p.autocomplete({
              message: 'Which color would you like to use as the accent color?',
              options: accentColors,
              placeholder: 'Type to search...',
              maxItems: 8,
            }),
      grayColor: () =>
        given.gray
          ? Promise.resolve(given.gray)
          : p.autocomplete({
              message: 'Which color would you like to use as the gray color?',
              options: neutralColors,
              placeholder: 'Type to search...',
              maxItems: 8,
            }),
      borderRadius: () =>
        given.radius
          ? Promise.resolve(given.radius as Radius)
          : p.select<Radius>({
              message: 'What border radius scale would you like to use?',
              options: RADII.map((value) => (value === 'sm' ? { value, hint: 'default' } : { value })),
              initialValue: 'sm',
            }),
    },
    {
      onCancel: () => {
        p.cancel("Setup cancelled. Run the command again when you're ready to configure Park UI.")
        process.exit(0)
      },
    },
  ) as Promise<Answers>
