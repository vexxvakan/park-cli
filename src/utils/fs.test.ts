import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findUp, matchPath } from './fs'
import { updateIndexFile } from './index-file'
import { Effect, Either } from 'effect'
import { adaptRegistrySource, requirePanda2, rewriteAliases, rewriteImportMap } from './import-map'

const root = await mkdtemp(join(tmpdir(), 'park-ui-cli-'))
afterAll(() => rm(root, { recursive: true, force: true }))

describe('matchPath', () => {
  const base = '/project'
  const paths = {
    '@app/*': ['./src/*'],
    '@app-theme/*': ['./styled-system/*'],
    '@app/special': ['./src/special/index.ts'],
  }

  test.each([
    ['@app/components/ui', '/project/src/components/ui'],
    ['@app-theme/css', '/project/styled-system/css'],
    ['@app/special', '/project/src/special/index.ts'],
    ['@app/', '/project/src'],
  ])('%s resolves to %s', (specifier, expected) => {
    expect(matchPath(specifier, base, paths)).toBe(expected)
  })

  test('returns undefined when nothing matches', () => {
    expect(matchPath('react', base, paths)).toBeUndefined()
  })

  test('prefers the longest matching prefix', () => {
    expect(matchPath('@a/b/c', base, { '@a/*': ['./x/*'], '@a/b/*': ['./y/*'] })).toBe('/project/y/c')
  })
})

describe('findUp', () => {
  test('finds a file in an ancestor directory', async () => {
    const nested = join(root, 'a', 'b', 'c')
    await mkdir(nested, { recursive: true })
    await Bun.write(join(root, 'a', 'marker.json'), '{}')
    expect(await findUp('marker.json', nested)).toBe(join(root, 'a', 'marker.json'))
  })

  test('returns undefined when no ancestor has the file', async () => {
    expect(await findUp('no-such-file-park-ui.json', root)).toBeUndefined()
  })
})

describe('updateIndexFile', () => {
  test('creates the file and appends each new export once', async () => {
    const path = join(root, 'ui', 'index.ts')
    await updateIndexFile({ path, exportStatement: "export * as Dialog from './dialog'" })
    await updateIndexFile({ path, exportStatement: "export { Button, type ButtonProps } from './button'" })
    await updateIndexFile({ path, exportStatement: "export * as Dialog from './dialog'" })
    await updateIndexFile({
      path,
      exportStatement: "export {\n  Button,\n  type ButtonProps,\n} from './button'",
    })

    expect(await Bun.file(path).text()).toBe(
      "export * as Dialog from './dialog'\nexport { Button, type ButtonProps } from './button'\n",
    )
  })

  test('adds a missing symbol from an already exported module', async () => {
    const path = join(root, 'ui2', 'index.ts')
    await Bun.write(path, "export { Button } from './button'")
    await updateIndexFile({ path, exportStatement: "export { Button, type ButtonProps } from './button'" })

    expect(await Bun.file(path).text()).toBe(
      "export { Button } from './button'\nexport { Button, type ButtonProps } from './button'\n",
    )
  })

  test('does nothing without an export statement', async () => {
    const path = join(root, 'ui3', 'index.ts')
    await updateIndexFile({ path })
    expect(await Bun.file(path).exists()).toBe(false)
  })
})

describe('rewriteImportMap', () => {
  test('points registry imports at the project import map', () => {
    const source = `import { styled } from 'styled-system/jsx'\nimport { css } from "styled-system/css"\nconst label = 'my-styled-system/x'`
    expect(rewriteImportMap(source, '@app-theme')).toBe(
      `import { styled } from '@app-theme/jsx'\nimport { css } from "@app-theme/css"\nconst label = 'my-styled-system/x'`,
    )
  })

  test('leaves content alone for the default import map', () => {
    const source = "import { styled } from 'styled-system/jsx'"
    expect(rewriteImportMap(source, 'styled-system')).toBe(source)
  })
})

const aliases = {
  components: '@app/components',
  hooks: '@app/hooks',
  lib: '@app/lib',
  recipes: '@app/theme/recipes',
  theme: '@app/theme',
  ui: '@app/components/ui',
}
const app = (importMap: string) => ({ importMap, aliases })

describe('rewriteAliases', () => {
  test.each([
    ["import { Button } from '@/components/ui'", "import { Button } from '@app/components/ui'"],
    ["import { x } from '@/components/ui/button'", "import { x } from '@app/components/ui/button'"],
    ['import { y } from "@/components/demo"', 'import { y } from "@app/components/demo"'],
    ["import { r } from '@/theme/recipes'", "import { r } from '@app/theme/recipes'"],
    ["import { z } from '@/lib/utils'", "import { z } from '@app/lib/utils'"],
    ["import { k } from '@/components-extra'", "import { k } from '@/components-extra'"],
  ])('%s', (source, expected) => {
    expect(rewriteAliases(source, aliases)).toBe(expected)
  })
})

describe('adaptRegistrySource', () => {
  test('renames createStyleContext and maps the import', () => {
    const source =
      "import { createStyleContext } from 'styled-system/jsx'\nconst ctx = createStyleContext(dialog)"
    expect(adaptRegistrySource(source, app('@app-theme'))).toBe(
      "import { createSlotRecipeContext } from '@app-theme/jsx'\nconst ctx = createSlotRecipeContext(dialog)",
    )
  })

  test('moves config types dropped from @pandacss/dev to @pandacss/types', () => {
    expect(adaptRegistrySource("import type { RecipeConfig } from '@pandacss/dev'", app('styled-system'))).toBe(
      "import type { RecipeConfig } from '@pandacss/types'",
    )
  })

  test('keeps types @pandacss/dev still exports and splits mixed imports', () => {
    expect(adaptRegistrySource("import type { Config } from '@pandacss/dev'", app('styled-system'))).toBe(
      "import type { Config } from '@pandacss/dev'",
    )
    expect(
      adaptRegistrySource('import type { Preset, SlotRecipeConfig } from "@pandacss/dev"', app('styled-system')),
    ).toBe(
      'import type { Preset } from "@pandacss/dev"\nimport type { SlotRecipeConfig } from "@pandacss/types"',
    )
  })

  test('leaves value imports from @pandacss/dev alone', () => {
    const source = "import { defineRecipe } from '@pandacss/dev'"
    expect(adaptRegistrySource(source, app('styled-system'))).toBe(source)
  })
})

describe('requirePanda2', () => {
  const project = async (version?: string) => {
    const dir = await mkdtemp(join(root, 'panda-'))
    if (version)
      await Bun.write(join(dir, 'node_modules/@pandacss/dev/package.json'), JSON.stringify({ version }))
    return join(dir, 'panda.config.ts')
  }

  test('passes for Panda 2', async () => {
    expect(await Effect.runPromise(Effect.either(requirePanda2(await project('2.5.0'))))).toEqual(
      Either.right(undefined),
    )
  })

  test.each(['1.9.0', undefined])('fails for Panda %p', async (version) => {
    const result = await Effect.runPromise(Effect.either(requirePanda2(await project(version))))
    expect(Either.isLeft(result) && result.left._tag).toBe('PandaVersionUnsupported')
  })
})
