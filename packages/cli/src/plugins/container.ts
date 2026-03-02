import type { Plugin, PluginHooks, PluginInput, PluginFactoryContext, HookContextMap } from '../types'

export type { PluginFactoryContext as PluginRuntimeContext }

export class PluginContainer {
  private plugins: Plugin[]

  constructor(inputs: PluginInput[] = [], private readonly runtime: PluginFactoryContext) {
    this.plugins = this.resolvePlugins(inputs)
  }

  private resolvePlugins(inputs: PluginInput[]): Plugin[] {
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

  async hook<K extends keyof PluginHooks>(name: K, ctx: HookContextMap[K]): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks?.[name] as ((ctx: HookContextMap[K]) => Promise<void> | void) | undefined
      if (fn) {
        await fn(ctx)
      }
    }
  }
}
