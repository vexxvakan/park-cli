import { describe, expect, test } from 'bun:test'
import { addReducedMotion, dropForwardRef, dropMemo, dynamicViewport, stableKeys } from './modernize'

describe('dropForwardRef', () => {
  test('turns a named forwardRef function into a declaration taking ref as a prop', () => {
    const source = `import { type ComponentProps, forwardRef } from 'react'

export const Indicator = forwardRef<HTMLSpanElement, IndicatorProps>(
  function Indicator(props, ref) {
    return <StyledIndicator ref={ref} {...props} />
  },
)
`
    expect(dropForwardRef(source)).toBe(`import type { ComponentProps, Ref } from 'react'

export function Indicator({ ref, ...props }: IndicatorProps & { ref?: Ref<HTMLSpanElement> }) {
  return <StyledIndicator ref={ref} {...props} />
}
`)
  })

  test('rewrites the arrow form with multi-line generics', () => {
    const source = `import { forwardRef } from 'react'
export const Group = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof StyledGroup>
>((props, ref) => {
  return <StyledGroup {...props} ref={ref} />
})
`
    expect(dropForwardRef(source)).toBe(`import type { Ref } from 'react'
export const Group = ({ ref, ...props }: ComponentProps<typeof StyledGroup> & { ref?: Ref<HTMLDivElement> }) => {
  return <StyledGroup {...props} ref={ref} />
}
`)
  })

  test('leaves code without forwardRef alone', () => {
    const source = "import { useState } from 'react'\nexport const A = () => null\n"
    expect(dropForwardRef(source)).toBe(source)
  })
})

describe('dropMemo', () => {
  test('unwraps expression and block factories and cleans the import', () => {
    const source = `import { forwardRef, useMemo } from 'react'
const a = useMemo(() => split(props), [props])
const b = useMemo(() => {
  if (files.length > 1) return \`\${files.length} files\`
  return x
}, [files, x])
`
    expect(dropMemo(source)).toBe(`import { forwardRef } from 'react'
const a = split(props)
const b = (() => {
  if (files.length > 1) return \`\${files.length} files\`
  return x
})()
`)
  })
})

describe('dynamicViewport', () => {
  test.each([
    ["width: '100vw'", "width: '100dvw'"],
    ["maxH: 'calc(100vh - 2rem)'", "maxH: 'calc(100dvh - 2rem)'"],
    ["h: '100dvh'", "h: '100dvh'"],
    ["h: '50svh'", "h: '50svh'"],
    ['const vh = 1 // 100vh', 'const vh = 1 // 100vh'],
  ])('%s', (source, expected) => {
    expect(dynamicViewport(source)).toBe(expected)
  })
})

describe('stableKeys', () => {
  test('keys pagination pages by number', () => {
    expect(stableKeys('<Item asChild key={index} type="page" value={page.value} {...rest}>')).toBe(
      '<Item asChild key={page.value} type="page" value={page.value} {...rest}>',
    )
  })

  test('keys slider marks by value', () => {
    expect(stableKeys('<Marker key={index} value={value}>')).toBe('<Marker key={value} value={value}>')
  })

  test('leaves unknown lists alone', () => {
    const source = '{rows.map((row, index) => <Row key={index} />)}'
    expect(stableKeys(source)).toBe(source)
  })
})

describe('addReducedMotion', () => {
  const source = "export const globalCss = {\n  extend: {\n    html: { colorPalette: 'gray' },\n  },\n}\n"

  test('adds the media rule once', () => {
    const once = addReducedMotion(source)
    expect(once).toContain("'@media (prefers-reduced-motion: reduce)'")
    expect(once).toContain("html: { colorPalette: 'gray' }")
    expect(addReducedMotion(once)).toBe(once)
  })
})
