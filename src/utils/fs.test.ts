import { afterAll, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findUp, matchPath } from "./fs"
import { updateIndexFile } from "./index-file"
import { PandaVersionUnsupported } from "./errors/panda-version-unsupported"
import { radiusTokens } from "./prompt"
import type { Radius, RadiusTokens } from "./prompt"
import { updateRecipeIndex } from "./recipes"
import { Effect, Either } from "effect"
import { adaptRegistrySource, requirePanda2, rewriteAliases, rewriteImportMap } from "./import-map"

const root = await mkdtemp(join(tmpdir(), "park-ui-cli-"))
afterAll(() => rm(root, { force: true, recursive: true }))

describe("matchPath", () => {
  const base = "/project"
  const paths = {
    "@app-theme/*": ["./styled-system/*"],
    "@app/*": ["./src/*"],
    "@app/special": ["./src/special/index.ts"],
  }

  test.each([
    ["@app/components/ui", "/project/src/components/ui"],
    ["@app-theme/css", "/project/styled-system/css"],
    ["@app/special", "/project/src/special/index.ts"],
    ["@app/", "/project/src"],
  ])("%s resolves to %s", (specifier, expected) => {
    expect(matchPath(specifier, base, paths)).toBe(expected)
  })

  test("returns undefined when nothing matches", () => {
    expect(matchPath("react", base, paths)).toBeUndefined()
  })

  test("prefers the longest matching prefix", () => {
    expect(matchPath("@a/b/c", base, { "@a/*": ["./x/*"], "@a/b/*": ["./y/*"] })).toBe(
      "/project/y/c",
    )
  })
})

describe("findUp", () => {
  test("finds a file in an ancestor directory", async () => {
    const nested = join(root, "a", "b", "c")
    await mkdir(nested, { recursive: true })
    await Bun.write(join(root, "a", "marker.json"), "{}")
    expect(await findUp("marker.json", nested)).toBe(join(root, "a", "marker.json"))
  })

  test("returns undefined when no ancestor has the file", async () => {
    expect(await findUp("no-such-file-park-ui.json", root)).toBeUndefined()
  })
})

describe("updateIndexFile", () => {
  test("creates the file and appends each new export once", async () => {
    const path = join(root, "ui", "index.ts")
    await updateIndexFile({ exportStatement: "export * as Dialog from './dialog'", path })
    await updateIndexFile({
      exportStatement: "export { Button, type ButtonProps } from './button'",
      path,
    })
    await updateIndexFile({ exportStatement: "export * as Dialog from './dialog'", path })
    await updateIndexFile({
      exportStatement: "export {\n  Button,\n  type ButtonProps,\n} from './button'",
      path,
    })

    expect(await Bun.file(path).text()).toBe(
      "export * as Dialog from './dialog'\nexport { Button, type ButtonProps } from './button'\n",
    )
  })

  test("adds a missing symbol from an already exported module", async () => {
    const path = join(root, "ui2", "index.ts")
    await Bun.write(path, "export { Button } from './button'")
    await updateIndexFile({
      exportStatement: "export { Button, type ButtonProps } from './button'",
      path,
    })

    expect(await Bun.file(path).text()).toBe(
      "export { Button } from './button'\nexport { Button, type ButtonProps } from './button'\n",
    )
  })

  test("does nothing without an export statement", async () => {
    const path = join(root, "ui3", "index.ts")
    await updateIndexFile({ path })
    expect(await Bun.file(path).exists()).toBe(false)
  })
})

describe("rewriteImportMap", () => {
  test("points registry imports at the project import map", () => {
    const source = `import { styled } from 'styled-system/jsx'\nimport { css } from "styled-system/css"\nconst label = 'my-styled-system/x'`
    expect(rewriteImportMap(source, "@app-theme")).toBe(
      `import { styled } from '@app-theme/jsx'\nimport { css } from "@app-theme/css"\nconst label = 'my-styled-system/x'`,
    )
  })

  test("leaves content alone for the default import map", () => {
    const source = "import { styled } from 'styled-system/jsx'"
    expect(rewriteImportMap(source, "styled-system")).toBe(source)
  })
})

const aliases = {
  components: "@app/components",
  hooks: "@app/hooks",
  lib: "@app/lib",
  recipes: "@app/theme/recipes",
  theme: "@app/theme",
  ui: "@app/components/ui",
}
const app = (importMap: string) => ({ aliases, importMap })

describe("rewriteAliases", () => {
  test.each([
    ["import { Button } from '@/components/ui'", "import { Button } from '@app/components/ui'"],
    ["import { x } from '@/components/ui/button'", "import { x } from '@app/components/ui/button'"],
    ['import { y } from "@/components/demo"', 'import { y } from "@app/components/demo"'],
    ["import { r } from '@/theme/recipes'", "import { r } from '@app/theme/recipes'"],
    ["import { z } from '@/lib/utils'", "import { z } from '@app/lib/utils'"],
    ["import { k } from '@/components-extra'", "import { k } from '@/components-extra'"],
  ])("%s", (source, expected) => {
    expect(rewriteAliases(source, aliases)).toBe(expected)
  })
})

describe("adaptRegistrySource", () => {
  test("renames createStyleContext and maps the import", () => {
    const source =
      "import { createStyleContext } from 'styled-system/jsx'\nconst ctx = createStyleContext(dialog)"
    expect(adaptRegistrySource(source, app("@app-theme"))).toBe(
      "import { createSlotRecipeContext } from '@app-theme/jsx'\nconst ctx = createSlotRecipeContext(dialog)",
    )
  })

  test("moves config types dropped from @pandacss/dev to @pandacss/types", () => {
    expect(
      adaptRegistrySource(
        "import type { RecipeConfig } from '@pandacss/dev'",
        app("styled-system"),
      ),
    ).toBe("import type { RecipeConfig } from '@pandacss/types'")
  })

  test("keeps types @pandacss/dev still exports and splits mixed imports", () => {
    expect(
      adaptRegistrySource("import type { Config } from '@pandacss/dev'", app("styled-system")),
    ).toBe("import type { Config } from '@pandacss/dev'")
    expect(
      adaptRegistrySource(
        'import type { Preset, SlotRecipeConfig } from "@pandacss/dev"',
        app("styled-system"),
      ),
    ).toBe(
      'import type { Preset } from "@pandacss/dev"\nimport type { SlotRecipeConfig } from "@pandacss/types"',
    )
  })

  test("leaves value imports from @pandacss/dev alone", () => {
    const source = "import { defineRecipe } from '@pandacss/dev'"
    expect(adaptRegistrySource(source, app("styled-system"))).toBe(source)
  })
})

const pandaProject = async (version?: string): Promise<string> => {
  const dir = await mkdtemp(join(root, "panda-"))
  if (version !== undefined) {
    await Bun.write(
      join(dir, "node_modules/@pandacss/dev/package.json"),
      JSON.stringify({ version }),
    )
  }
  return join(dir, "panda.config.ts")
}

describe("requirePanda2", () => {
  test("passes for Panda 2", async () => {
    const result = await Effect.runPromise(
      Effect.either(requirePanda2(await pandaProject("2.5.0"))),
    )
    expect(result).toEqual(Either.right(undefined))
  })

  test.each(["1.9.0", undefined])("fails for Panda %p", async (version) => {
    const result = await Effect.runPromise(
      Effect.either(requirePanda2(await pandaProject(version))),
    )
    expect(Either.isLeft(result) && result.left instanceof PandaVersionUnsupported).toBe(true)
  })
})

const radii = (radius: Radius): RadiusTokens["theme"]["extend"]["semanticTokens"]["radii"] =>
  radiusTokens(radius).theme.extend.semanticTokens.radii
const token = (step: string): { value: string } => ({ value: `{radii.${step}}` })

describe("radiusTokens", () => {
  test.each([
    ["none", { value: "0" }, { value: "0" }, { value: "0" }],
    ["xs", { value: "0.0625rem" }, token("xs"), token("sm")],
    ["sm", token("xs"), token("sm"), token("md")],
    ["md", token("sm"), token("md"), token("lg")],
    ["lg", token("md"), token("lg"), token("xl")],
    ["xl", token("lg"), token("xl"), token("2xl")],
    ["2xl", token("xl"), token("2xl"), token("3xl")],
  ] as const)("%s", (radius, l1, l2, l3) => {
    expect(radii(radius)).toEqual({ l1, l2, l3 })
  })
})

describe("updateRecipeIndex", () => {
  test("creates the index and registers recipes and slot recipes once", async () => {
    const path = join(root, "recipes", "index.ts")
    await updateRecipeIndex(path, { imports: "import { button } from './button'", type: "recipe" })
    await updateRecipeIndex(path, {
      imports: "import { dialog } from './dialog'",
      type: "slotRecipe",
    })
    await updateRecipeIndex(path, { imports: "import { button } from './button'", type: "recipe" })
    expect(await Bun.file(path).text()).toBe(
      'import { dialog } from "./dialog"\nimport { button } from "./button"\nexport const recipes = {\n  button,\n}\nexport const slotRecipes = {\n  dialog,\n}\n',
    )
  })

  test("keeps recipes already in the index", async () => {
    const path = join(root, "recipes2", "index.ts")
    await Bun.write(
      path,
      'import { badge } from "./badge"\nexport const recipes = {\n  badge\n}\nexport const slotRecipes = {}\n',
    )
    await updateRecipeIndex(path, { imports: "import { kbd } from './kbd'", type: "recipe" })
    expect(await Bun.file(path).text()).toContain("export const recipes = {\n  badge,\n  kbd,\n}")
  })
})
