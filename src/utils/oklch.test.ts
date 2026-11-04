import { describe, expect, test } from 'bun:test'
import { formatOklch, oklchToRgb, rgbToOklch, toOklch } from './oklch'

const hexToRgb = (hex: string) =>
  [0, 2, 4].map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255) as [number, number, number]

/** Parses our own `oklch()` output back to 8-bit sRGB. */
const roundTrip = (css: string) => {
  const [, L, C, H] = css.match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)/)!
  return oklchToRgb([Number(L), Number(C), Number(H)]).map((c) => Math.round(c * 255) + 0)
}

describe('toOklch', () => {
  test.each([
    ["'#ffffff'", "'oklch(1 0 0)'"],
    ["'#000000'", "'oklch(0 0 0)'"],
    ["'#fff'", "'oklch(1 0 0)'"],
    ["'rgba(0, 0, 0, 0.3)'", "'oklch(0 0 0 / 0.3)'"],
    ["'rgba(255, 255, 255, 0.05)'", "'oklch(1 0 0 / 0.05)'"],
    ["'rgb(255 255 255 / 50%)'", "'oklch(1 0 0 / 0.5)'"],
  ])('%s → %s', (source, expected) => {
    expect(toOklch(source)).toBe(expected)
  })

  test('converts every color in a shadow-like string', () => {
    expect(toOklch("'0 1px 2px #000000, 0 0 1px rgba(0,0,0,0.5)'")).toBe(
      "'0 1px 2px oklch(0 0 0), 0 0 1px oklch(0 0 0 / 0.5)'",
    )
  })

  test('turns black and white keywords in shadows into tokens', () => {
    expect(toOklch("'white 0px 0px 0px 2px, black 0px 0px 2px 1px'")).toBe(
      "'{colors.white} 0px 0px 0px 2px, {colors.black} 0px 0px 2px 1px'",
    )
    expect(toOklch("'white'")).toBe("'white'")
    expect(toOklch("'0px 1px 1px {colors.black.a8}'")).toBe("'0px 1px 1px {colors.black.a8}'")
  })

  test('converts alpha hex', () => {
    expect(toOklch("'#0080ff04'")).toMatch(/^'oklch\([\d.]+ [\d.]+ [\d.]+ \/ 0\.0157\)'$/)
  })

  test('matches a reference value', () => {
    // #0090ff (Radix blue 9) is oklch(0.6492 0.1934 251.8) in culori.
    const [L, C, H] = rgbToOklch(hexToRgb('#0090ff'))
    expect(L).toBeCloseTo(0.6492, 3)
    expect(C).toBeCloseTo(0.1934, 3)
    expect(H).toBeCloseTo(251.8, 1)
  })

  test('leaves non-color text alone', () => {
    const source = "const id = 'item#1'\n// see #123 and rgb(0, 0, 0)\nconst url = 'https://x.dev/#add'"
    expect(toOklch(source)).toBe(source)
  })

  test('round-trips to the same 8-bit sRGB color', () => {
    // Every 5th step per channel, plus 255; a full 16.7M sweep also passes but takes 15 s.
    const steps = [...Array.from({ length: 52 }, (_, i) => i * 5), 255]
    const misses: string[] = []
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const css = formatOklch([r / 255, g / 255, b / 255])
          if (roundTrip(css).join() !== [r, g, b].join()) misses.push(`${r},${g},${b} → ${css}`)
        }
    expect(misses).toEqual([])
  })
})
