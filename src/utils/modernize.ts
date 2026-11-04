/**
 * Source rewrites that bring registry code up to current React and CSS.
 * The registry is uniform, so these work on text; each one leaves code it does not recognise alone.
 */

/** Index of the bracket that closes the one at `open`, skipping strings, template literals and comments. */
const matchBracket = (source: string, open: number): number => {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']', '<': '>' }
  const opener = source[open]!
  const closer = pairs[opener]!
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const char = source[i]!
    if (char === '"' || char === "'" || char === '`') {
      for (i++; i < source.length && source[i] !== char; i++) if (source[i] === '\\') i++
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i)
      if (i === -1) return -1
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i) + 1
      continue
    }
    // `=>` inside generics is not a closing angle bracket.
    if (opener === '<' && char === '>' && source[i - 1] === '=') continue
    if (char === opener) depth++
    else if (char === closer && --depth === 0) return i
  }
  return -1
}

/**
 * Splits `text` at commas that are not nested in brackets or strings.
 * Angle brackets only count in type argument lists (`generics`), where `>` is never a comparison.
 */
const splitTopLevel = (text: string, { generics = false } = {}) => {
  const open = generics ? '<([{' : '([{'
  const close = generics ? '>)]}' : ')]}'
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"' || char === "'" || char === '`') {
      for (i++; i < text.length && text[i] !== char; i++) if (text[i] === '\\') i++
      continue
    }
    if (open.includes(char)) depth++
    else if (close.includes(char) && !(char === '>' && text[i - 1] === '=')) depth--
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts.filter(Boolean)
}

const REACT_IMPORT = /import\s*\{([^}]*)\}\s*from\s*(['"])react\2/

/** Edits the named imports from `react`: removes `remove`, adds `add` (as written, e.g. `type Ref`). */
const editReactImport = (source: string, remove: string[], add: string[] = []) =>
  source.replace(REACT_IMPORT, (_statement, list: string, quote: string) => {
    const names = splitTopLevel(list).filter(
      (name) => !remove.includes(name.replace(/^type\s+/, '')),
    )
    for (const name of add) {
      const bare = name.replace(/^type\s+/, '')
      if (!names.some((existing) => existing.replace(/^type\s+/, '') === bare)) names.push(name)
    }
    if (names.length === 0) return ''
    const allTypes = names.every((name) => name.startsWith('type '))
    return allTypes
      ? `import type { ${names.map((name) => name.slice(5)).join(', ')} } from ${quote}react${quote}`
      : `import { ${names.join(', ')} } from ${quote}react${quote}`
  })

/**
 * React 19 passes `ref` as a prop. Rewrites
 * `forwardRef<El, P>(function Name(props, ref) { … })` and the arrow form to
 * `function Name({ ref, ...props }: P & { ref?: Ref<El> }) { … }`.
 */
export const dropForwardRef = (source: string) => {
  let out = source
  let changed = false
  for (let at = out.indexOf('forwardRef<'); at !== -1; at = out.indexOf('forwardRef<', at)) {
    const genericOpen = at + 'forwardRef'.length
    const genericClose = matchBracket(out, genericOpen)
    const callOpen = genericClose + 1
    if (genericClose === -1 || out[callOpen] !== '(') {
      at++
      continue
    }
    const callClose = matchBracket(out, callOpen)
    const [element, props] = splitTopLevel(out.slice(genericOpen + 1, genericClose), {
      generics: true,
    })
    const inner = out.slice(callOpen + 1, callClose).trim().replace(/,\s*$/, '')
    const header = inner.match(/^(?:function\s+(\w+)\s*)?\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*(=>)?\s*/)
    if (callClose === -1 || !element || !props || !header) {
      at++
      continue
    }
    const [matched, name, propsName, refName, arrow] = header
    // A function that starts on its own line sat one level deeper inside the call; bring it back out.
    const nested = /^\s*\n/.test(out.slice(callOpen + 1, callClose))
    const body = nested
      ? inner
          .slice(matched.length)
          .split('\n')
          .map((line, index) => (index > 0 && line.startsWith('  ') ? line.slice(2) : line))
          .join('\n')
      : inner.slice(matched.length)
    const parameter = `{ ${refName === 'ref' ? 'ref' : `ref: ${refName}`}, ...${propsName} }: ${props} & { ref?: Ref<${element}> }`
    const replacement = arrow
      ? `(${parameter}) => ${body}`
      : `function ${name ?? ''}(${parameter}) ${body}`
    out = out.slice(0, at) + replacement + out.slice(callClose + 1)
    changed = true
    at += replacement.length
  }
  if (!changed) return source
  // `const Name = function Name(` reads better as a declaration.
  out = out.replace(/\b(export\s+)?const\s+(\w+)\s*=\s*function\s+\2\(/g, '$1function $2(')
  return editReactImport(out, ['forwardRef'], ['type Ref'])
}

/**
 * With React Compiler, `useMemo(() => expr, deps)` is just `expr`. A block body becomes an
 * immediately called function, which the compiler memoizes the same way.
 */
export const dropMemo = (source: string) => {
  let out = source
  let changed = false
  for (let at = out.search(/\buseMemo\(/); at !== -1; ) {
    const open = out.indexOf('(', at)
    const close = matchBracket(out, open)
    const [factory, deps] = splitTopLevel(out.slice(open + 1, close))
    const arrow = factory?.match(/^\(\s*\)\s*=>\s*/)
    if (close === -1 || !factory || !deps || !arrow) break
    const body = factory.slice(arrow[0].length)
    const replacement = body.startsWith('{') ? `(() => ${body})()` : body
    out = out.slice(0, at) + replacement + out.slice(close + 1)
    changed = true
    const next = out.slice(at + replacement.length).search(/\buseMemo\(/)
    at = next === -1 ? -1 : at + replacement.length + next
  }
  return changed ? editReactImport(out, ['useMemo']) : source
}

const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

/** `vh`/`vw` in string values become the dynamic viewport units `dvh`/`dvw`. */
export const dynamicViewport = (source: string) =>
  source.replace(STRING, (literal) =>
    literal.replace(/(?<![\w.-])(\d*\.?\d+)v([hw])\b/g, '$1dv$2'),
  )

/**
 * Keys from data, not the array index. Each rule matches one registry list; unknown code is left alone.
 */
const KEY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Carousel indicators: snap points are distinct positions.
  [
    /\.pageSnapPoints\.map\(\(_, index\) => \(\s*<Indicator key=\{index\}/g,
    '.pageSnapPoints.map((snapPoint, index) => (\n        <Indicator key={snapPoint}',
  ],
  // Pagination ellipsis: there is at most one between two pages, so the page before it names it.
  [
    /if \(page\.type === 'ellipsis'\) \{(\s*)return \(\s*<Ellipsis asChild key=\{index\}/g,
    "if (page.type === 'ellipsis') {$1const previous = ctx.pages[index - 1]$1return ($1  <Ellipsis asChild key={`ellipsis-after-${previous?.type === 'page' ? previous.value : 'start'}`}",
  ],
  // Pagination pages: the page number.
  [/<Item asChild key=\{index\} type="page" value=\{page\.value\}/g, '<Item asChild key={page.value} type="page" value={page.value}'],
  // Skeleton lines: the line number is the item itself, not its position.
  [
    /\[\.\.\.Array\(noOfLines\)\.keys\(\)\]\.map\(\(index\) => \(([\s\S]*?)key=\{index\}/g,
    '[...Array(noOfLines).keys()].map((line) => ($1key={line}',
  ],
  // Slider marks: the mark's value.
  [/<Marker key=\{index\} value=\{value\}>/g, '<Marker key={value} value={value}>'],
  // Slider thumbs: Zag identifies thumbs by position and their values change while dragging,
  // so the key is Zag's own thumb id.
  [
    /slider\.value\.map\(\(_, index\) => \(\s*<Thumb key=\{index\}/g,
    'slider.value.map((_, index) => (\n    <Thumb key={slider.getThumbProps({ index }).id}',
  ],
  // Tags: the tag, plus which occurrence it is, since `allowDuplicates` can repeat values.
  [
    /context\.value\.map\(\(item, index\) => \(\s*<Item key=\{index\}/g,
    'context.value.map((item, index) => (\n    <Item key={`${item}:${context.value.slice(0, index).filter((other) => other === item).length}`}',
  ],
]

export const stableKeys = (source: string) =>
  KEY_RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), source)

/** True when a `key` is still the bare array index. */
export const hasIndexKey = (source: string) => /\bkey=\{(?:index|i|idx)\}/.test(source)

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
export const addReducedMotion = (source: string) =>
  source.includes('prefers-reduced-motion')
    ? source
    : source.replace(/(export const globalCss = \{\s*extend: \{\s*)/, `$1${REDUCED_MOTION}`)
