import fs from 'fs-extra'
import path from 'path'
import { Eta } from 'eta'
import type { TemplateConfig, TemplateInput, TemplateContext } from '../types'

const eta = new Eta({
  autoEscape: false,
  useWith: true,
})

async function resolveTemplateString(
  input: string,
  baseDir: string,
  templates?: TemplateConfig,
): Promise<string> {
  const dir = templates?.dir ? path.resolve(baseDir, templates.dir) : baseDir
  const candidate = path.isAbsolute(input) ? input : path.resolve(dir, input)
  if (await fs.pathExists(candidate)) {
    return fs.readFile(candidate, 'utf8')
  }
  return input
}

export async function renderTemplate(
  input: TemplateInput | undefined,
  ctx: TemplateContext,
  baseDir: string,
  templates?: TemplateConfig,
): Promise<string> {
  if (!input) return ''
  if (typeof input === 'function') {
    return await input(ctx)
  }
  const template = await resolveTemplateString(input, baseDir, templates)
  return eta.renderString(template, ctx)
}
