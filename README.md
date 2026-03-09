# yapi-typed

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

1. Install the CLI:

```bash
pnpm add -D yapi-typed
```

2. Create config:

```bash
npx yapi-typed init
```

3. Generate:

```bash
npx yapi-typed generate
```

## Monorepo

- CLI package: `packages/cli` (name: `yapi-typed`)
- Runtime package: `packages/runtime` (name: `yapi-typed-runtime`)

## Config Example

```ts
import { defineConfig } from 'yapi-typed'

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
import { defineConfig, definePlugin } from 'yapi-typed'

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
import { defineConfig } from 'yapi-typed'

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
