## [Unreleased]

## [1.1.0] - 2026-11-04

### Added

- Installed code is modernized:
  - On React 19 or newer, `forwardRef` is dropped: components take `ref` as a prop.
  - With React Compiler (`babel-plugin-react-compiler` in `package.json`), `useMemo` is removed.
  - `vh`/`vw` become `dvh`/`dvw`.
  - List keys come from data instead of the array index (carousel, pagination, skeleton, slider, tags input), so `react/no-array-index-key` passes.
  - `init` adds a `prefers-reduced-motion` rule to the theme's global CSS that stops animations, transitions, smooth scrolling and view transitions.
- Registry colors are written as `oklch()`: hex and `rgb()`/`rgba()` values in installed files are converted (lossless for every 8-bit sRGB color, alpha included), and `black`/`white` keywords in shadow values become `{colors.black}`/`{colors.white}` tokens.
- `init` flags for non-interactive use: `--framework`, `--accent`, `--gray`, `--radius`, and `-y, --yes` for defaults. Without a terminal, `init` fails and names the missing flags instead of waiting on a prompt.

### Changed

- Cancelling `init` (Ctrl+C) exits with code 0 and writes nothing; failures to find `components.json`, `tsconfig.json` or `panda.config.ts` exit with code 1.
- The recipe index is edited as text instead of through a syntax tree.

### Fixed

- `init` applies the chosen border radius; it always wrote the `sm` scale.
- `none` and `xs` radii no longer reference `radii.none` and `radii.2xs`, which `@pandacss/preset-panda` does not define; they use `0` and `0.0625rem`.
- Failed `init` and `add` runs exit with code 1.
- Re-running `init` keeps the recipe index; it used to reset it and drop every recipe `add` had registered.

## [1.0.0] - 2026-11-04

Fork: TypeScript 7 and Panda 2 support, Panda 1 dropped, 4 runtime dependencies. See the README.

## [1.0.1] - 2025-11-20

### Changed

- Bump depdendencies.

## [1.0.0] - 2025-11-20

### Added

- Initial release of Park UI Next CLI.
