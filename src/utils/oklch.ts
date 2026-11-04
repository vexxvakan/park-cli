/**
 * sRGB to OKLCH, following Björn Ottosson's OKLab definition
 * (https://bottosson.github.io/posts/oklab/) and CSS Color 4.
 */

type Rgb = readonly [r: number, g: number, b: number]
type Lch = readonly [lightness: number, chroma: number, hue: number]
interface Color {
  readonly rgb: Rgb
  readonly alpha: number
}

/** sRGB transfer function (IEC 61966-2-1). */
const SRGB = {
  decodeThreshold: 0.04045,
  encodeThreshold: 0.0031308,
  gamma: 2.4,
  linearSlope: 12.92,
  offset: 0.055,
  scale: 1.055,
} as const

/** Linear sRGB to LMS cone response. */
const RGB_TO_LMS = {
  l: { b: 0.0514459929, g: 0.5363325363, r: 0.4122214708 },
  m: { b: 0.1073969566, g: 0.6806995451, r: 0.2119034982 },
  s: { b: 0.6299787005, g: 0.2817188376, r: 0.0883024619 },
} as const

/** Cube-rooted LMS to OKLab. */
const LMS_TO_LAB = {
  a: { l: 1.9779984951, m: -2.428592205, s: 0.4505937099 },
  b: { l: 0.0259040371, m: 0.7827717662, s: -0.808675766 },
  lightness: { l: 0.2104542553, m: 0.793617785, s: -0.0040720468 },
} as const

/** OKLab to cube-rooted LMS. */
const LAB_TO_LMS = {
  l: { a: 0.3963377774, b: 0.2158037573 },
  m: { a: -0.1055613458, b: -0.0638541728 },
  s: { a: -0.0894841775, b: -1.291485548 },
} as const

/** LMS to linear sRGB. */
const LMS_TO_RGB = {
  b: { l: -0.0041960863, m: -0.7034186147, s: 1.707614701 },
  g: { l: -1.2684380046, m: 2.6097574011, s: -0.3413193965 },
  r: { l: 4.0767416621, m: -3.3077115913, s: 0.2309699292 },
} as const

const CUBE = 3
const HALF_TURN_DEGREES = 180
const FULL_TURN_DEGREES = 360
const OPAQUE = 1
const PERCENT = 100
const CHANNEL_MAX = 255
const HEX_RADIX = 16

/** 4/5/3 decimals round-trip every 8-bit sRGB color exactly. */
const DECIMALS = { alpha: 4, chroma: 5, hue: 3, lightness: 4 } as const

/** Below this chroma a color is a gray; its hue is noise, so write 0. */
const ACHROMATIC_CHROMA = 0.0002

const toLinear = (channel: number): number => {
  if (channel <= SRGB.decodeThreshold) {
    return channel / SRGB.linearSlope
  }
  return ((channel + SRGB.offset) / SRGB.scale) ** SRGB.gamma
}

const fromLinear = (channel: number): number => {
  if (channel <= SRGB.encodeThreshold) {
    return SRGB.linearSlope * channel
  }
  return SRGB.scale * channel ** (OPAQUE / SRGB.gamma) - SRGB.offset
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / HALF_TURN_DEGREES

/** sRGB channels in 0–1 to `[L, C, H]`, with L in 0–1 and H in degrees. */
export const rgbToOklch = ([red, green, blue]: Rgb): Lch => {
  const linear = { b: toLinear(blue), g: toLinear(green), r: toLinear(red) }
  const cone = (row: { readonly r: number; readonly g: number; readonly b: number }): number =>
    Math.cbrt(row.r * linear.r + row.g * linear.g + row.b * linear.b)
  const lms = { l: cone(RGB_TO_LMS.l), m: cone(RGB_TO_LMS.m), s: cone(RGB_TO_LMS.s) }
  const lab = (row: { readonly l: number; readonly m: number; readonly s: number }): number =>
    row.l * lms.l + row.m * lms.m + row.s * lms.s
  const lightness = lab(LMS_TO_LAB.lightness)
  const greenRed = lab(LMS_TO_LAB.a)
  const blueYellow = lab(LMS_TO_LAB.b)
  const hue = (Math.atan2(blueYellow, greenRed) * HALF_TURN_DEGREES) / Math.PI
  return [
    lightness,
    Math.hypot(greenRed, blueYellow),
    (hue + FULL_TURN_DEGREES) % FULL_TURN_DEGREES,
  ]
}

/** `[L, C, H]` back to sRGB channels in 0–1, unclamped. */
export const oklchToRgb = ([lightness, chroma, hue]: Lch): Rgb => {
  const greenRed = chroma * Math.cos(toRadians(hue))
  const blueYellow = chroma * Math.sin(toRadians(hue))
  const cone = (row: { readonly a: number; readonly b: number }): number =>
    (lightness + row.a * greenRed + row.b * blueYellow) ** CUBE
  const lms = { l: cone(LAB_TO_LMS.l), m: cone(LAB_TO_LMS.m), s: cone(LAB_TO_LMS.s) }
  const channel = (row: { readonly l: number; readonly m: number; readonly s: number }): number =>
    fromLinear(row.l * lms.l + row.m * lms.m + row.s * lms.s)
  return [channel(LMS_TO_RGB.r), channel(LMS_TO_RGB.g), channel(LMS_TO_RGB.b)]
}

const round = (value: number, digits: number): string => {
  const text = value.toFixed(digits).replace(/\.?0+$/u, "")
  if (text === "-0") {
    return "0"
  }
  return text
}

/** Formats sRGB channels (0–1) and alpha (0–1) as a CSS `oklch()` value. */
export const formatOklch = (rgb: Rgb, alpha: number = OPAQUE): string => {
  const [lightness, chroma, hue] = rgbToOklch(rgb)
  let chromaText = "0"
  let hueText = "0"
  if (chroma >= ACHROMATIC_CHROMA) {
    chromaText = round(chroma, DECIMALS.chroma)
    hueText = round(hue, DECIMALS.hue)
  }
  const body = `${round(lightness, DECIMALS.lightness)} ${chromaText} ${hueText}`
  if (alpha >= OPAQUE) {
    return `oklch(${body})`
  }
  return `oklch(${body} / ${round(alpha, DECIMALS.alpha)})`
}

const HEX_DIGITS = /^#(?<digits>[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu
const SHORT_HEX = /^[\da-f]{3,4}$/iu
const HEX_PAIR = /[\da-f]{2}/giu

const hexChannel = (pair: string): number => Number.parseInt(pair, HEX_RADIX) / CHANNEL_MAX

const parseHex = (hex: string): Color | undefined => {
  const digits = HEX_DIGITS.exec(hex)?.groups?.["digits"]
  if (digits === undefined) {
    return undefined
  }
  let full = digits
  if (SHORT_HEX.test(digits)) {
    full = Array.from(digits, (digit) => digit + digit).join("")
  }
  const [red = "", green = "", blue = "", alpha] = full.match(HEX_PAIR) ?? []
  let alphaValue = OPAQUE
  if (alpha !== undefined) {
    alphaValue = hexChannel(alpha)
  }
  return { alpha: alphaValue, rgb: [hexChannel(red), hexChannel(green), hexChannel(blue)] }
}

const RGB_ARGUMENTS =
  /^(?<red>\S+?)[\s,]+(?<green>\S+?)[\s,]+(?<blue>[^\s,/]+)(?:[\s,/]+(?<alpha>\S+))?$/u

const PERCENT_SIGN = "%"

/** A percentage as a 0–1 fraction, or a plain number divided by `max`. */
const fraction = (part: string, max: number): number => {
  if (part.endsWith(PERCENT_SIGN)) {
    return Number(part.replace(PERCENT_SIGN, "")) / PERCENT
  }
  return Number(part) / max
}

const rgbChannel = (part: string): number => fraction(part, CHANNEL_MAX)

const alphaChannel = (part: string | undefined): number => {
  if (part === undefined) {
    return OPAQUE
  }
  return fraction(part, OPAQUE)
}

const parseRgbFunction = (args: string): Color | undefined => {
  const groups = RGB_ARGUMENTS.exec(args.trim())?.groups
  if (groups === undefined) {
    return undefined
  }
  const { red = "", green = "", blue = "", alpha } = groups
  const rgb: Rgb = [rgbChannel(red), rgbChannel(green), rgbChannel(blue)]
  const alphaValue = alphaChannel(alpha)
  if (![...rgb, alphaValue].every((value) => Number.isFinite(value))) {
    return undefined
  }
  return { alpha: alphaValue, rgb }
}

const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu
const HEX = /(?<=^|[\s,(])#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{3,4})(?=$|[\s,)])/gu
const RGB = /\brgba?\((?<args>[^)]*)\)/gu

// `black`/`white` keywords inside a multi-part value (a shadow) are raw CSS, not Panda tokens.
const KEYWORD = /(?<![{.\w-])\b(?<name>black|white)\b(?![.\w}-])/gu
const HAS_LENGTH = /\d(?:px|rem|em)\b/u

const replaceColor = (match: string, color: Color | undefined): string => {
  if (color === undefined) {
    return match
  }
  return formatOklch(color.rgb, color.alpha)
}

const convert = (text: string): string => {
  let out = text
  if (HAS_LENGTH.test(out)) {
    out = out.replaceAll(KEYWORD, "{colors.$<name>}")
  }
  return out
    .replaceAll(HEX, (match) => replaceColor(match, parseHex(match)))
    .replaceAll(RGB, (match, args: string) => replaceColor(match, parseRgbFunction(args)))
}

/** Rewrites hex and `rgb()`/`rgba()` colors inside string literals to `oklch()`; code and comments are left alone. */
export const toOklch = (content: string): string =>
  content.replaceAll(STRING, (literal) => {
    const [quote = ""] = literal
    return quote + convert(literal.slice(quote.length, -quote.length)) + quote
  })
