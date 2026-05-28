# yapi-typed

Modern, plugin-ready YApi → TypeScript generator.

Requires Node.js >= 20.

- ESM + CJS builds
- TypeScript-first codebase
- Fast type generation with caching
- CLI with `init`, `generate`, `config`
- Pluggable lifecycle hooks
- Configurable templates
- Split-by-category output with optional translation

## Install

```bash
# pnpm
pnpm add -D yapi-typed

# npm
npm install -D yapi-typed

# yarn
yarn add -D yapi-typed
```

Or run directly with `npx` — no install needed:

```bash
npx yapi-typed init
npx yapi-typed generate
```

> `yapi-typed-runtime` is installed automatically the first time you run `generate`.

## Quick Start

1. Initialize a config file in your project root:

```bash
npx yapi-typed init
```

1. Edit the generated `yapi.config.ts`:

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
              id: 0, // 0 = all categories
              outputFilePath: 'src/api/index.ts',
            },
          ],
        },
      ],
    },
  ],
})
```

1. Generate types and request functions:

```bash
npx yapi-typed generate
```

## Using the Generated Code

```ts
import { getUserInfo, type GetUserInfoRequest, type GetUserInfoResponse } from './api'

const response = await getUserInfo({ id: '123' })
console.log(response.data.name) // fully typed
```

## Types Only

If you only want type definitions, skip the request functions:

```ts
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
              typesOnly: true,
              outputFilePath: 'src/api/types.ts',
            },
          ],
        },
      ],
    },
  ],
})
```

## Split By Category

Generate one file per YApi category and keep a unified barrel entry:

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
              categoryFile: {
                enabled: true,
                clean: true,
                // Without translation, the original category name is used.
                nameMap: {
                  用户管理: 'user',
                  订单接口: 'order',
                },
              },
            },
          ],
        },
      ],
    },
  ],
})
```

Result:

```ts
// src/api/index.ts
export * from './order'
export * from './user'
```

You can also point at a self-hosted LibreTranslate instance:

```ts
categoryFile: {
  enabled: true,
  libreTranslate: {
    endpoint: 'http://localhost:5000',
    source: 'zh',
    target: 'en',
  },
}
```

Or plug in DeepL / Google Cloud Translation with a custom translator:

```ts
categoryFile: {
  enabled: true,
  async translate(categoryName) {
    return await translateCategoryName(categoryName)
  },
}
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

## Custom Request Function Name

```ts
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
              requestFunctionFilePath: 'src/api/request.ts',
              dataKey: 'data',
              getRequestFunctionName(interfaceInfo, changeCase) {
                return changeCase.camelCase(interfaceInfo.path)
              },
            },
          ],
        },
      ],
    },
  ],
})
```

## FAQ

**Where do I get a project token?**
Log in to YApi → project settings → "token configuration".

**How do I generate only a specific category?**
Set the `id` field on the category to the YApi category ID.

**Can I customize formatting?**
Generated code is formatted with Prettier and picks up your project's `.prettierrc` automatically.

## Links

- Repository: https://github.com/Aybrea/yapi-typed
- Runtime package: [`yapi-typed-runtime`](https://www.npmjs.com/package/yapi-typed-runtime)

## License

MIT
