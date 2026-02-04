import { loadConfig as loadC12Config } from 'c12'
import { defu } from 'defu'
import path from 'path'
import type { Config, RootConfig, ServerConfig, SharedConfig } from './types'

export interface LoadConfigOptions {
  cwd?: string
  configFile?: string
}

export interface ResolvedConfig {
  config: RootConfig
  configFile?: string
}

export function normalizeConfig(input: Config): RootConfig {
  if (Array.isArray(input)) {
    return { servers: input }
  }
  if ('servers' in input) {
    return input as RootConfig
  }
  return { servers: [input as ServerConfig] }
}

export function mergeSharedConfig(...configs: Array<SharedConfig | undefined>): SharedConfig {
  return defu({}, ...configs) as SharedConfig
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const cwd = options.cwd || process.cwd()
  const { config, configFile } = await loadC12Config<Config>({
    name: 'yapi-to-ts',
    cwd,
    configFile: options.configFile ? path.resolve(cwd, options.configFile) : undefined,
  })

  if (!config) {
    throw new Error('No config found. Create `yapi-to-ts.config.ts` or pass --config <path>.')
  }

  return {
    config: normalizeConfig(config),
    configFile,
  }
}
