# yapi-to-ts

Modern, plugin-ready YApi → TypeScript generator.

Requires Node.js >= 20.

## Features

- ESM + CJS builds
- TypeScript-first codebase
- Fast type generation with caching
- CLI with `init`, `generate`, `config`
- Pluggable lifecycle hooks
- Configurable templates

## Quick Start

1. Install dependencies (from this repo root):

```bash
pnpm install
```

2. Create config (CLI package):

```bash
pnpm --filter yapi-to-ts exec yapi-to-ts init
```

3. Generate:

```bash
pnpm --filter yapi-to-ts exec yapi-to-ts generate
```

Note: Generated clients depend on `yapi-to-ts/runtime` (install `yapi-to-ts` as a runtime dependency).

## Monorepo

- CLI package: `packages/cli` (name: `yapi-to-ts`)
- Runtime package: `packages/runtime` (name: `@yapi-to-ts/runtime`)

## Config Example

```ts
import { defineConfig } from 'yapi-to-ts'

export default defineConfig({
  servers: [
    {
      serverUrl: 'https://yapi.example.com',
      projects: [
        {
          token: 'YOUR_PROJECT_TOKEN',
          categories: [
            {
              id: 0,
              outputFilePath: 'src/api/index.ts',
            },
          ],
        },
      ],
    },
  ],
})
```

## Plugins

```ts
import { defineConfig, definePlugin } from 'yapi-to-ts'

export default defineConfig({
  plugins: [
    definePlugin({
      name: 'logger',
      hooks: {
        onStart() {
          console.log('start')
        },
        onAfterWrite(ctx) {
          console.log('wrote', ctx.outputFilePath)
        },
      },
    }),
  ],
  servers: [/* ... */],
})
```

## Templates

```ts
import { defineConfig } from 'yapi-to-ts'

export default defineConfig({
  templates: {
    dir: 'templates',
    requestFunction: 'request.eta',
    fileBanner: 'banner.eta',
  },
  servers: [/* ... */],
})
```

## Build

```bash
pnpm build
```

## License

MIT
