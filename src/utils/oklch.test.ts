import { describe, expect, test } from "bun:test"
import { formatOklch, oklchToRgb, rgbToOklch, toOklch } from "./oklch"

const CHANNEL_MAX = 255
const HEX_RADIX = 16
const SWEEP_STEP = 5
const HEX_PAIR = /[\da-f]{2}/giu
const OKLCH_VALUE = /oklch\((?<lightness>[\d.]+) (?<chroma>[\d.]+) (?<hue>[\d.]+)/u

/** #0090ff (Radix blue 9) is oklch(0.6492 0.1934 251.8) in culori. */
const REFERENCE = { chroma: 0.1934, digits: 3, hue: 251.8, hueDigits: 1, lightness: 0.6492 }

const hexChannel = (pair: string): number => Number.parseInt(pair, HEX_RADIX) / CHANNEL_MAX

const hexToRgb = (hex: string): readonly [number, number, number] => {
  const [red = "", green = "", blue = ""] = hex.match(HEX_PAIR) ?? []
  return [hexChannel(red), hexChannel(green), hexChannel(blue)]
}

// The round trip is compared with `join`, which writes -0 as 0.
const to8Bit = (channel: number): number => Math.round(channel * CHANNEL_MAX)

/** Parses our own `oklch()` output back to 8-bit sRGB. */
const roundTrip = (css: string): readonly number[] => {
  const { lightness = "", chroma = "", hue = "" } = OKLCH_VALUE.exec(css)?.groups ?? {}
  return oklchToRgb([Number(lightness), Number(chroma), Number(hue)]).map((channel) =>
    to8Bit(channel),
  )
}

describe("toOklch", () => {
  test.each([
    ["'#ffffff'", "'oklch(1 0 0)'"],
    ["'#000000'", "'oklch(0 0 0)'"],
    ["'#fff'", "'oklch(1 0 0)'"],
    ["'rgba(0, 0, 0, 0.3)'", "'oklch(0 0 0 / 0.3)'"],
    ["'rgba(255, 255, 255, 0.05)'", "'oklch(1 0 0 / 0.05)'"],
    ["'rgb(255 255 255 / 50%)'", "'oklch(1 0 0 / 0.5)'"],
  ])("%s → %s", (source, expected) => {
    expect(toOklch(source)).toBe(expected)
  })

  test("converts every color in a shadow-like string", () => {
    expect(toOklch("'0 1px 2px #000000, 0 0 1px rgba(0,0,0,0.5)'")).toBe(
      "'0 1px 2px oklch(0 0 0), 0 0 1px oklch(0 0 0 / 0.5)'",
    )
  })

  test("turns black and white keywords in shadows into tokens", () => {
    expect(toOklch("'white 0px 0px 0px 2px, black 0px 0px 2px 1px'")).toBe(
      "'{colors.white} 0px 0px 0px 2px, {colors.black} 0px 0px 2px 1px'",
    )
    expect(toOklch("'white'")).toBe("'white'")
    expect(toOklch("'0px 1px 1px {colors.black.a8}'")).toBe("'0px 1px 1px {colors.black.a8}'")
  })

  test("converts alpha hex", () => {
    expect(toOklch("'#0080ff04'")).toMatch(/^'oklch\([\d.]+ [\d.]+ [\d.]+ \/ 0\.0157\)'$/u)
  })

  test("matches a reference value", () => {
    const [lightness, chroma, hue] = rgbToOklch(hexToRgb("#0090ff"))
    expect(lightness).toBeCloseTo(REFERENCE.lightness, REFERENCE.digits)
    expect(chroma).toBeCloseTo(REFERENCE.chroma, REFERENCE.digits)
    expect(hue).toBeCloseTo(REFERENCE.hue, REFERENCE.hueDigits)
  })

  test("leaves non-color text alone", () => {
    const source =
      "const id = 'item#1'\n// see #123 and rgb(0, 0, 0)\nconst url = 'https://x.dev/#add'"
    expect(toOklch(source)).toBe(source)
  })

  test("round-trips to the same 8-bit sRGB color", () => {
    // Every 5th step per channel, plus 255; a full 16.7M sweep also passes but takes 15 s.
    const steps = [
      ...Array.from(
        { length: Math.ceil(CHANNEL_MAX / SWEEP_STEP) },
        (_, index) => index * SWEEP_STEP,
      ),
      CHANNEL_MAX,
    ]
    const misses: string[] = []
    for (const red of steps) {
      for (const green of steps) {
        for (const blue of steps) {
          const css = formatOklch([red / CHANNEL_MAX, green / CHANNEL_MAX, blue / CHANNEL_MAX])
          if (roundTrip(css).join(",") !== [red, green, blue].join(",")) {
            misses.push(`${red},${green},${blue} → ${css}`)
          }
        }
      }
    }
    expect(misses).toEqual([])
  })
})
