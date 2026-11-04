#!/usr/bin/env bun
import { parseArgs } from 'node:util'
import packageJson from '../package.json'
import { add } from './commands/add'
import { debug } from './commands/debug'
import { init } from './commands/init'

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

const usage = `Usage: park <command> [options]

Build your own Design System

Commands:
  init                         set up Park UI in this project
  add [components...] [--all]  add components to your project
  debug                        print the resolved configuration

Options:
  -v, --version                display the version number
  -h, --help                   display help for command`

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    all: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
  },
})

const [command, ...rest] = positionals

if (values.version) console.log(packageJson.version)
else if (values.help || !command) console.log(usage)
else if (command === 'init') await init()
else if (command === 'add') await add(rest, { all: values.all })
else if (command === 'debug') await debug()
else {
  console.error(`Unknown command "${command}".\n\n${usage}`)
  process.exit(1)
}
