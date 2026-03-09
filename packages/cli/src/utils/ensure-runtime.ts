import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'
import type { ConsolaInstance } from 'consola'

const RUNTIME_PACKAGE = 'yapi-typed-runtime'

function detectPackageManager(cwd: string): 'pnpm' | 'yarn' | 'npm' {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function isRuntimeInstalled(cwd: string): boolean {
  const pkgPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkgPath)) return false

  const pkg = fs.readJsonSync(pkgPath)
  const inPackageJson = !!(pkg.dependencies?.[RUNTIME_PACKAGE] || pkg.devDependencies?.[RUNTIME_PACKAGE])

  if (inPackageJson) return true

  // Check if it exists in node_modules
  const nodeModulesPath = path.join(cwd, 'node_modules', RUNTIME_PACKAGE)
  return fs.existsSync(nodeModulesPath)
}

export async function ensureRuntime(cwd: string, logger: ConsolaInstance): Promise<void> {
  if (isRuntimeInstalled(cwd)) return

  const pm = detectPackageManager(cwd)
  logger.info(`Installing ${RUNTIME_PACKAGE}...`)

  try {
    const cmd = pm === 'yarn' ? `${pm} add ${RUNTIME_PACKAGE}` : `${pm} install ${RUNTIME_PACKAGE}`
    execSync(cmd, { cwd, stdio: 'inherit' })
    logger.success(`${RUNTIME_PACKAGE} installed successfully`)
  } catch (error) {
    // Check if it exists in node_modules despite installation failure
    const nodeModulesPath = path.join(cwd, 'node_modules', RUNTIME_PACKAGE)
    if (fs.existsSync(nodeModulesPath)) {
      logger.warn(`${RUNTIME_PACKAGE} installation failed, but package exists in node_modules. Continuing...`)
      return
    }
    logger.error(`Failed to install ${RUNTIME_PACKAGE}. Please install it manually: ${pm} ${pm === 'yarn' ? 'add' : 'install'} ${RUNTIME_PACKAGE}`)
    throw error
  }
}
