/**
 * Source rewrites that bring registry code up to current React and CSS.
 * The registry is uniform, so these work on text; each one leaves code it does not recognise alone.
 */

const NOT_FOUND = -1
/** Start of a string, depth of top-level code, length of an empty list. */
const NONE = 0
const NEXT = 1
const INDENT = "  "
const TYPE_PREFIX = "type "
const QUOTES = new Set(['"', "'", "`"])
const BRACKET_PAIRS: Readonly<Record<string, string>> = { "(": ")", "<": ">", "[": "]", "{": "}" }

/** Index just past the string that opens at `start`. */
const skipString = (source: string, start: number): number => {
  const quote = source.charAt(start)
  let index = start + NEXT
  while (index < source.length && source.charAt(index) !== quote) {
    if (source.charAt(index) === "\\") {
      index += NEXT
    }
    index += NEXT
  }
  return index
}

/** Index of the bracket that closes the one at `open`, skipping strings, template literals and comments. */
const matchBracket = (source: string, open: number): number => {
  const opener = source.charAt(open)
  const closer = BRACKET_PAIRS[opener]
  let depth = 0
  for (let index = open; index < source.length; index += NEXT) {
    const char = source.charAt(index)
    const following = source.charAt(index + NEXT)
    if (QUOTES.has(char)) {
      index = skipString(source, index)
    } else if (char === "/" && following === "/") {
      index = source.indexOf("\n", index)
      if (index === NOT_FOUND) {
        return NOT_FOUND
      }
    } else if (char === "/" && following === "*") {
      index = source.indexOf("*/", index) + NEXT
    } else if (opener === "<" && char === ">" && source.charAt(index - NEXT) === "=") {
      // `=>` inside generics is not a closing angle bracket.
    } else if (char === opener) {
      depth += NEXT
    } else if (char === closer) {
      depth -= NEXT
      if (depth === NONE) {
        return index
      }
    }
  }
  return NOT_FOUND
}

/**
 * Splits `text` at commas that are not nested in brackets or strings.
 * Angle brackets only count in type argument lists (`generics`), where `>` is never a comparison.
 */
const splitTopLevel = (text: string, generics = false): string[] => {
  let open = "([{"
  let close = ")]}"
  if (generics) {
    open = "<([{"
    close = ">)]}"
  }
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index += NEXT) {
    const char = text.charAt(index)
    if (QUOTES.has(char)) {
      index = skipString(text, index)
    } else if (open.includes(char)) {
      depth += NEXT
    } else if (close.includes(char) && !(char === ">" && text.charAt(index - NEXT) === "=")) {
      depth -= NEXT
    } else if (char === "," && depth === NONE) {
      parts.push(text.slice(start, index).trim())
      start = index + NEXT
    }
  }
  parts.push(text.slice(start).trim())
  return parts.filter((part) => part !== "")
}

const REACT_IMPORT = /import\s*\{(?<list>[^}]*)\}\s*from\s*(?<quote>['"])react\k<quote>/u
const bareName = (name: string): string => name.replace(/^type\s+/u, "")

/** Edits the named imports from `react`: removes `remove`, adds `add` (as written, e.g. `type Ref`). */
const editReactImport = (
  source: string,
  remove: readonly string[],
  add: readonly string[] = [],
): string => {
  const match = REACT_IMPORT.exec(source)
  if (match === null) {
    return source
  }
  const [whole] = match
  const { list = "", quote = '"' } = match.groups ?? {}
  const names = splitTopLevel(list).filter((name) => !remove.includes(bareName(name)))
  for (const name of add) {
    if (!names.some((existing) => bareName(existing) === bareName(name))) {
      names.push(name)
    }
  }
  let statement = `import { ${names.join(", ")} } from ${quote}react${quote}`
  if (names.length === NONE) {
    statement = ""
  } else if (names.every((name) => name.startsWith(TYPE_PREFIX))) {
    const types = names.map((name) => name.slice(TYPE_PREFIX.length)).join(", ")
    statement = `import type { ${types} } from ${quote}react${quote}`
  }
  return source.slice(NONE, match.index) + statement + source.slice(match.index + whole.length)
}

const FORWARD_REF = "forwardRef<"
const FORWARD_REF_HEADER =
  /^(?:function\s+(?<name>\w+)\s*)?\(\s*(?<props>\w+)\s*,\s*(?<ref>\w+)\s*\)\s*(?<arrow>=>)?\s*/u

/** Brings every line after the first back out by one indent level. */
const dedent = (text: string): string =>
  text
    .split("\n")
    .map((line, index) => {
      if (index > NONE && line.startsWith(INDENT)) {
        return line.slice(INDENT.length)
      }
      return line
    })
    .join("\n")

interface ForwardRefCall {
  readonly start: number
  readonly end: number
  readonly replacement: string
}

/** Reads the `forwardRef<…>(…)` call at `start`, or undefined when it is not the expected shape. */
const readForwardRef = (source: string, start: number): ForwardRefCall | undefined => {
  const genericOpen = start + FORWARD_REF.length - NEXT
  const genericClose = matchBracket(source, genericOpen)
  const callOpen = genericClose + NEXT
  if (genericClose === NOT_FOUND || source.charAt(callOpen) !== "(") {
    return undefined
  }
  const callClose = matchBracket(source, callOpen)
  const [element, props] = splitTopLevel(source.slice(genericOpen + NEXT, genericClose), true)
  const call = source.slice(callOpen + NEXT, callClose)
  const inner = call.trim().replace(/,\s*$/u, "")
  const header = FORWARD_REF_HEADER.exec(inner)
  if (callClose === NOT_FOUND || element === undefined || props === undefined || header === null) {
    return undefined
  }
  const { name = "", props: propsName = "props", ref = "ref", arrow } = header.groups ?? {}
  const [headerText] = header
  let body = inner.slice(headerText.length)
  // A function that starts on its own line sat one level deeper inside the call; bring it back out.
  if (/^\s*\n/u.test(call)) {
    body = dedent(body)
  }
  let refBinding = `ref: ${ref}`
  if (ref === "ref") {
    refBinding = "ref"
  }
  const parameter = `{ ${refBinding}, ...${propsName} }: ${props} & { ref?: Ref<${element}> }`
  let replacement = `function ${name}(${parameter}) ${body}`
  if (arrow !== undefined) {
    replacement = `(${parameter}) => ${body}`
  }
  return { end: callClose + NEXT, replacement, start }
}

/**
 * React 19 passes `ref` as a prop. Rewrites
 * `forwardRef<El, P>(function Name(props, ref) { … })` and the arrow form to
 * `function Name({ ref, ...props }: P & { ref?: Ref<El> }) { … }`.
 */
export const dropForwardRef = (source: string): string => {
  let out = source
  let changed = false
  let at = out.indexOf(FORWARD_REF)
  while (at !== NOT_FOUND) {
    const call = readForwardRef(out, at)
    if (call === undefined) {
      at = out.indexOf(FORWARD_REF, at + NEXT)
    } else {
      out = out.slice(NONE, call.start) + call.replacement + out.slice(call.end)
      changed = true
      at = out.indexOf(FORWARD_REF, call.start + call.replacement.length)
    }
  }
  if (!changed) {
    return source
  }
  // `const Name = function Name(` reads better as a declaration.
  out = out.replaceAll(
    /\b(?<exported>export\s+)?const\s+(?<name>\w+)\s*=\s*function\s+\k<name>\(/gu,
    "$<exported>function $<name>(",
  )
  return editReactImport(out, ["forwardRef"], [`${TYPE_PREFIX}Ref`])
}

const USE_MEMO = /\buseMemo\(/u
const ARROW_FACTORY = /^\(\s*\)\s*=>\s*/u

/**
 * With React Compiler, `useMemo(() => expr, deps)` is just `expr`. A block body becomes an
 * immediately called function, which the compiler memoizes the same way.
 */
export const dropMemo = (source: string): string => {
  let out = source
  let changed = false
  let at = out.search(USE_MEMO)
  while (at !== NOT_FOUND) {
    const open = out.indexOf("(", at)
    const close = matchBracket(out, open)
    const [factory = "", deps] = splitTopLevel(out.slice(open + NEXT, close))
    const arrow = ARROW_FACTORY.exec(factory)
    if (close === NOT_FOUND || deps === undefined || arrow === null) {
      break
    }
    const [arrowText] = arrow
    const body = factory.slice(arrowText.length)
    let replacement = body
    if (body.startsWith("{")) {
      replacement = `(() => ${body})()`
    }
    out = out.slice(NONE, at) + replacement + out.slice(close + NEXT)
    changed = true
    const next = out.slice(at + replacement.length).search(USE_MEMO)
    if (next === NOT_FOUND) {
      at = NOT_FOUND
    } else {
      at += replacement.length + next
    }
  }
  if (!changed) {
    return source
  }
  return editReactImport(out, ["useMemo"])
}

const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu

/** `vh`/`vw` in string values become the dynamic viewport units `dvh`/`dvw`. */
export const dynamicViewport = (source: string): string =>
  source.replaceAll(STRING, (literal) =>
    literal.replaceAll(/(?<![\w.-])(?<size>\d*\.?\d+)v(?<axis>[hw])\b/gu, "$<size>dv$<axis>"),
  )

/**
 * Keys from data, not the array index. Each rule matches one registry list; unknown code is left alone.
 */
const KEY_RULES: readonly (readonly [RegExp, string])[] = [
  // Carousel indicators: snap points are distinct positions.
  [
    /\.pageSnapPoints\.map\(\(_, index\) => \(\s*<Indicator key=\{index\}/gu,
    ".pageSnapPoints.map((snapPoint, index) => (\n        <Indicator key={snapPoint}",
  ],
  // Pagination ellipsis: there is at most one between two pages, so the page before it names it.
  [
    /if \(page\.type === 'ellipsis'\) \{(?<indent>\s*)return \(\s*<Ellipsis asChild key=\{index\}/gu,
    `if (page.type === 'ellipsis') {$<indent>const previous = ctx.pages[index - 1]$<indent>return ($<indent>  <Ellipsis asChild key={\`ellipsis-after-\${previous?.type === 'page' ? previous.value : 'start'}\`}`,
  ],
  // Pagination pages: the page number.
  [
    /<Item asChild key=\{index\} type="page" value=\{page\.value\}/gu,
    '<Item asChild key={page.value} type="page" value={page.value}',
  ],
  // Skeleton lines: the line number is the item itself, not its position.
  [
    /\[\.\.\.Array\(noOfLines\)\.keys\(\)\]\.map\(\(index\) => \((?<body>[\s\S]*?)key=\{index\}/gu,
    "[...Array(noOfLines).keys()].map((line) => ($<body>key={line}",
  ],
  // Slider marks: the mark's value.
  [/<Marker key=\{index\} value=\{value\}>/gu, "<Marker key={value} value={value}>"],
  // Slider thumbs: Zag identifies thumbs by position and their values change while dragging,
  // so the key is Zag's own thumb id.
  [
    /slider\.value\.map\(\(_, index\) => \(\s*<Thumb key=\{index\}/gu,
    "slider.value.map((_, index) => (\n    <Thumb key={slider.getThumbProps({ index }).id}",
  ],
  // Tags: the tag, plus which occurrence it is, since `allowDuplicates` can repeat values.
  [
    /context\.value\.map\(\(item, index\) => \(\s*<Item key=\{index\}/gu,
    `context.value.map((item, index) => (\n    <Item key={\`\${item}:\${context.value.slice(0, index).filter((other) => other === item).length}\`}`,
  ],
]

export const stableKeys = (source: string): string =>
  KEY_RULES.reduce((out, [pattern, replacement]) => out.replaceAll(pattern, replacement), source)

const REDUCED_MOTION = `'@media (prefers-reduced-motion: reduce)': {
      '*, *::before, *::after': {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      },
      '::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*)': {
        animation: 'none !important',
      },
    },
    `

/** Adds a reduced-motion rule to the theme's global CSS (`globalCss = { extend: { … } }`). */
export const addReducedMotion = (source: string): string => {
  if (source.includes("prefers-reduced-motion")) {
    return source
  }
  return source.replace(
    /(?<head>export const globalCss = \{\s*extend: \{\s*)/u,
    `$<head>${REDUCED_MOTION}`,
  )
}
