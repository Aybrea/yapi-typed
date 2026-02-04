import type { Plugin, PluginHooks, PluginInput } from '../types'

export interface PluginRuntimeContext {
  config: any
  cwd: string
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
}

export class PluginContainer {
  private plugins: Plugin[]

  constructor(inputs: PluginInput[] = [], private readonly runtime: PluginRuntimeContext) {
    this.plugins = this.resolvePlugins(inputs)
  }

  private resolvePlugins(inputs: PluginInput[]) {
    const resolved: Plugin[] = []
    for (const input of inputs) {
      if (!input) continue
      if (typeof input === 'function') {
        const result = input(this.runtime)
        if (result && 'name' in result) {
          resolved.push(result as Plugin)
        } else if (result) {
          resolved.push({ name: 'anonymous-plugin', hooks: result as PluginHooks })
        }
        continue
      }
      resolved.push(input)
    }
    return resolved
  }

  async hook<K extends keyof PluginHooks>(name: K, ctx: any) {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks?.[name]
      if (fn) {
        await fn(ctx)
      }
    }
  }
}
