/**
 * sRGB to OKLCH, following Björn Ottosson's OKLab definition
 * (https://bottosson.github.io/posts/oklab/) and CSS Color 4.
 */

type Rgb = readonly [r: number, g: number, b: number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB channels in 0–1 to `[L, C, H]`, with L in 0–1 and H in degrees. */
export const rgbToOklch = ([r, g, b]: Rgb): [number, number, number] => {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, bb)
  const H = (Math.atan2(bb, a) * 180) / Math.PI
  return [L, C, H < 0 ? H + 360 : H]
}

/** `[L, C, H]` back to sRGB channels in 0–1, unclamped. */
export const oklchToRgb = ([L, C, H]: readonly [number, number, number]): [number, number, number] => {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const round = (value: number, digits: number) => {
  const text = value.toFixed(digits).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}

/** Formats sRGB channels (0–1) and alpha (0–1) as a CSS `oklch()` value. */
export const formatOklch = (rgb: Rgb, alpha = 1) => {
  const [L, C, H] = rgbToOklch(rgb)
  // Grays have no meaningful hue; write 0 so they stay stable and readable.
  const achromatic = C < 0.0002
  // 4/5/3 decimals round-trip every 8-bit sRGB color exactly.
  const body = `${round(L, 4)} ${achromatic ? '0' : round(C, 5)} ${achromatic ? '0' : round(H, 3)}`
  return alpha >= 1 ? `oklch(${body})` : `oklch(${body} / ${round(alpha, 4)})`
}

const parseHex = (hex: string): { rgb: Rgb; alpha: number } | undefined => {
  const digits = hex.slice(1)
  const full =
    digits.length === 3 || digits.length === 4
      ? [...digits].map((d) => d + d).join('')
      : digits.length === 6 || digits.length === 8
        ? digits
        : undefined
  if (!full) return undefined
  const channel = (i: number) => Number.parseInt(full.slice(i, i + 2), 16) / 255
  return { rgb: [channel(0), channel(2), channel(4)], alpha: full.length === 8 ? channel(6) : 1 }
}

const parseRgbFunction = (args: string): { rgb: Rgb; alpha: number } | undefined => {
  const parts = args
    .replace(/\s*\/\s*/, ',')
    .split(/\s*,\s*|\s+/)
    .filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return undefined
  const channel = (part: string) =>
    part.endsWith('%') ? Number.parseFloat(part) / 100 : Number.parseFloat(part) / 255
  const alphaPart = parts[3]
  const alpha =
    alphaPart === undefined
      ? 1
      : alphaPart.endsWith('%')
        ? Number.parseFloat(alphaPart) / 100
        : Number.parseFloat(alphaPart)
  const rgb: Rgb = [channel(parts[0]!), channel(parts[1]!), channel(parts[2]!)]
  return [...rgb, alpha].every(Number.isFinite) ? { rgb, alpha } : undefined
}

const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
const HEX = /(?<=^|[\s,(])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?=$|[\s,)])/g
const RGB = /\brgba?\(([^)]*)\)/g

// `black`/`white` keywords inside a multi-part value (a shadow) are raw CSS, not Panda tokens.
const KEYWORD = /(?<![{.\w-])\b(black|white)\b(?![.\w}-])/g
const HAS_LENGTH = /\d(?:px|rem|em)\b/

const convert = (text: string) =>
  (HAS_LENGTH.test(text) ? text.replace(KEYWORD, '{colors.$1}') : text)
    .replace(HEX, (match) => {
      const color = parseHex(match)
      return color ? formatOklch(color.rgb, color.alpha) : match
    })
    .replace(RGB, (match, args: string) => {
      const color = parseRgbFunction(args)
      return color ? formatOklch(color.rgb, color.alpha) : match
    })

/** Rewrites hex and `rgb()`/`rgba()` colors inside string literals to `oklch()`; code and comments are left alone. */
export const toOklch = (content: string) =>
  content.replace(STRING, (literal) => literal[0] + convert(literal.slice(1, -1)) + literal.at(-1))
