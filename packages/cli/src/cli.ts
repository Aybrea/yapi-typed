#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import fs from 'fs-extra'
import path from 'path'
import { loadConfig } from './config'
import { Generator } from './core/generator'
import { ensureRuntime } from './utils/ensure-runtime'

const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Create a starter yapi-typed config file',
  },
  args: {
    cwd: {
      type: 'string',
      description: 'Working directory',
    },
  },
  async run(ctx) {
    const cwd = ctx.args.cwd ? path.resolve(ctx.args.cwd) : process.cwd()
    const target = path.join(cwd, 'yapi.config.ts')
    if (await fs.pathExists(target)) {
      consola.warn(`Config already exists at ${target}`)
      process.exit(0)
    }
    const content = `import { defineConfig } from 'yapi-typed'\n\nexport default defineConfig({\n  servers: [\n    {\n      serverUrl: 'https://yapi.example.com',\n      projects: [\n        {\n          token: 'YOUR_PROJECT_TOKEN',\n          categories: [\n            {\n              id: 0,\n              outputFilePath: 'src/api/index.ts',\n            },\n          ],\n        },\n      ],\n    },\n  ],\n})\n`
    await fs.outputFile(target, content)
    consola.success(`Created ${target}`)
    process.exit(0)
  },
})

async function runGenerate(ctx: any) {
  const cwd = ctx.args.cwd ? path.resolve(ctx.args.cwd) : process.cwd()

  await ensureRuntime(cwd, consola)

  const { config, configFile } = await loadConfig({
    cwd,
    configFile: ctx.args.config,
  })

  const generator = new Generator(config, {
    cwd,
    configFilePath: configFile,
    logger: consola,
  })

  try {
    await generator.prepare()
    const output = await generator.generate()
    if (ctx.args.dryRun) {
      consola.info('Dry run enabled, skipping file writes.')
      return
    }
    await generator.write(output)
    consola.success('Generation completed.')
  } finally {
    await generator.destroy()
  }
}

const generateCommand = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate TypeScript files from YApi',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file',
    },
    cwd: {
      type: 'string',
      description: 'Working directory',
    },
    dryRun: {
      type: 'boolean',
      description: 'Generate code without writing files',
      default: false,
    },
  },
  async run(ctx) {
    await runGenerate(ctx)
  },
})

const configCommand = defineCommand({
  meta: {
    name: 'config',
    description: 'Show resolved config',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file',
    },
    cwd: {
      type: 'string',
      description: 'Working directory',
    },
  },
  async run(ctx) {
    const cwd = ctx.args.cwd ? path.resolve(ctx.args.cwd) : process.cwd()
    const { config, configFile } = await loadConfig({
      cwd,
      configFile: ctx.args.config,
    })
    consola.info(configFile ? `Config file: ${configFile}` : 'Config file: <auto>')
    consola.log(JSON.stringify(config, null, 2))
    process.exit(0)
  },
})

const main = defineCommand({
  meta: {
    name: 'yapi-typed',
    description: 'Modern YApi to TypeScript generator',
  },
  subCommands: {
    init: initCommand,
    generate: generateCommand,
    config: configCommand,
  },
})

runMain(main)
