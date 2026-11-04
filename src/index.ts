#!/usr/bin/env bun
import { parseArgs } from "node:util"
import packageJson from "../package.json"
import { add } from "./commands/add"
import { debug } from "./commands/debug"
import { init } from "./commands/init"

const ARGUMENTS_START = 2

const usage = `Usage: park <command> [options]

Build your own Design System

Commands:
  init [options]               set up Park UI in this project
    --framework <name>         react or solid
    --accent <color>           accent color, e.g. blue
    --gray <color>             gray color: neutral, mauve, slate, sage, olive or sand
    --radius <scale>           none, xs, sm, md, lg, xl or 2xl
    -y, --yes                  use defaults (react, neutral, neutral, sm) for options not given
  add [components...] [--all]  add components to your project
  debug                        print the resolved configuration

Options:
  -v, --version                display the version number
  -h, --help                   display help for command`

const write = (text: string): void => {
  process.stdout.write(`${text}\n`)
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  args: Bun.argv.slice(ARGUMENTS_START),
  options: {
    accent: { type: "string" },
    all: { default: false, type: "boolean" },
    framework: { type: "string" },
    gray: { type: "string" },
    help: { default: false, short: "h", type: "boolean" },
    radius: { type: "string" },
    version: { default: false, short: "v", type: "boolean" },
    yes: { default: false, short: "y", type: "boolean" },
  },
})

const [command, ...rest] = positionals

if (values.version) {
  write(packageJson.version)
} else if (values.help || command === undefined) {
  write(usage)
} else if (command === "init") {
  await init({
    accent: values.accent,
    framework: values.framework,
    gray: values.gray,
    radius: values.radius,
    yes: values.yes,
  })
} else if (command === "add") {
  await add(rest, { all: values.all })
} else if (command === "debug") {
  await debug()
} else {
  process.stderr.write(`Unknown command "${command}".\n\n${usage}\n`)
  process.exitCode = 1
}
