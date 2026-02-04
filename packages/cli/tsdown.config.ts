import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    exports: true,
    target: 'node20',
    platform: 'node',
    shims: true,
  },
  {
    entry: ['src/cli.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    target: 'node20',
    platform: 'node',
    shims: true,
  },
])
