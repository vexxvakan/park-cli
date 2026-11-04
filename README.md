# Park UI CLI (TypeScript 7 + Panda 2 fork)

Fork of `@park-ui/cli` 1.0.1 from [cschroeter/park-ui](https://github.com/cschroeter/park-ui/tree/102769c/packages/cli) (`102769c`, 2026-02-21). Requires Bun 1.3 or newer and a project on `@pandacss/dev` 2 or newer; Panda 1 is not supported.

## Changes from upstream

- **TypeScript 7:** `tsconfig.json` without `baseUrl` is accepted; `paths` resolve from the tsconfig directory, as TypeScript does.
- **Panda 2 only:** the CLI exits with an error unless the project's installed `@pandacss/dev` is 2 or newer. Registry files, still written for Panda 1, are rewritten on install: `createStyleContext` becomes `createSlotRecipeContext` (every registry use wraps a slot recipe), and config types `@pandacss/dev` no longer exports (`RecipeConfig`) are imported from `@pandacss/types`. The CLI warns once when the project does not list `@pandacss/types`.
- **Aliases:** registry imports written as `@/components/ui` (and `@/components`, `@/theme`, …) are rewritten to the aliases in `components.json`.
- **Import maps:** registry files import from `styled-system/*`; they are rewritten to the project's Panda `importMap`.
- **Slot recipes:** recipes declared with `defineSlotRecipe` are registered under `slotRecipes` (upstream matched `slotRecipe` case-sensitively and filed them under `recipes`).
- **Errors:** failures name their cause instead of a generic message.
- **Dependencies:** runtime dependencies cut from 13 to 4 (`effect` 3, `@clack/prompts`, `magicast`, `tsconfck`), all at their latest versions. Bun and Node built-ins replace `@better-fetch/fetch`, `commander`, `cosmiconfig`, `fs-extra`, `package-directory`, `picocolors`, `ts-morph`, `tsconfig-paths`, and `zod`. `effect` stays on 3.x: 4.x renames most of the APIs this CLI uses.
- **Build:** `bun build` replaces `tsup`; no declaration files, since nothing imports a CLI.

Production install: 17 packages and 44 MB instead of 55 packages and 92 MB. `--version` starts in about 126 ms instead of 366 ms (upstream on Node).

Known upstream issues left as is:

- `init` asks for a border radius but always applies `sm`.
- The registry's `checkbox` recipe nests `control: { control: … }` in its `solid` variant; Panda 2 reports it as `nested_property`. Unwrap the inner `control` after adding it.

Verified with `init` and `add --all` (every React component) on TypeScript 7.0.2 and Panda 2.5.0: `tsc` reports no errors and `panda codegen` warns only about the checkbox recipe.


A command-line tool for integrating Park UI components into your project.

## Usage

### Initialize Park UI

Set up Park UI in your project with an interactive prompt:

```bash
bun /path/to/park-cli/src/index.ts init
```

This command will:
- Guide you through framework selection
- Let you choose accent and gray color themes
- Install the necessary theme configuration
- Set up the initial component structure

### Add Components

Add specific components to your project:

```bash
bun /path/to/park-cli/src/index.ts add button card dialog
```

Add all available components:

```bash
bun /path/to/park-cli/src/index.ts add --all
```

You can also add more Radix colors this way

```bash
bun /path/to/park-cli/src/index.ts add iris jade crimson
```

### Debug Configuration

View your current Park UI configuration:

```bash
bun /path/to/park-cli/src/index.ts debug
```

## Options

```bash
park-ui -v, --version    # Display version number
park-ui -h, --help       # Display help information
```

## Support

Report issues at: https://github.com/cschroeter/park-ui/issues
