## [Unreleased]

## [1.1.0] - 2026-11-04

### Added

- `init` flags for non-interactive use: `--framework`, `--accent`, `--gray`, `--radius`, and `-y, --yes` for defaults. Without a terminal, `init` fails and names the missing flags instead of waiting on a prompt.

### Fixed

- `init` applies the chosen border radius; it always wrote the `sm` scale.
- Failed `init` and `add` runs exit with code 1.

## [1.0.0] - 2026-11-04

Fork: TypeScript 7 and Panda 2 support, Panda 1 dropped, 4 runtime dependencies. See the README.

## [1.0.1] - 2025-11-20

### Changed

- Bump depdendencies.

## [1.0.0] - 2025-11-20

### Added

- Initial release of Park UI Next CLI.
