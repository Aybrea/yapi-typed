# yapi-typed 使用指南

## 安装

```bash
# 使用 npm
npm install -D yapi-typed
npm install yapi-typed-runtime

# 使用 pnpm
pnpm add -D yapi-typed
pnpm add yapi-typed-runtime

# 使用 yarn
yarn add -D yapi-typed
yarn add yapi-typed-runtime
```

> **注意**：`yapi-typed` 是开发依赖（devDependencies），`yapi-typed-runtime` 是运行时依赖（dependencies），因为生成的代码需要在运行时使用它。

## 快速开始

### 1. 初始化配置

在项目根目录运行：

```bash
npx yapi-typed init
```

这会创建一个 `yapi.config.ts` 配置文件。

### 2. 配置 YApi 服务器

编辑 `yapi.config.ts`：

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
              id: 0, // 分类 ID，0 表示全部
              outputFilePath: 'src/api/index.ts',
            },
          ],
        },
      ],
    },
  ],
})
```

### 3. 生成类型和接口

```bash
npx yapi-typed generate
```

这会根据配置生成 TypeScript 类型定义和请求函数。

## 使用生成的代码

生成的代码会包含类型定义和请求函数，你可以直接在项目中使用：

```ts
import { getUserInfo, type GetUserInfoRequest, type GetUserInfoResponse } from './api'

// 调用接口
const response = await getUserInfo({
  id: '123'
})

// response 是类型安全的
console.log(response.data.name)
```

## 高级配置

### 自定义请求函数

你可以自定义请求函数的实现：

```ts
export default defineConfig({
  templates: {
    dir: 'templates',
    requestFunction: 'request.eta',
  },
  servers: [/* ... */],
})
```

### 使用插件

```ts
import { defineConfig, definePlugin } from 'yapi-typed'

export default defineConfig({
  plugins: [
    definePlugin({
      name: 'logger',
      hooks: {
        onStart() {
          console.log('开始生成')
        },
        onAfterWrite(ctx) {
          console.log('已写入:', ctx.outputFilePath)
        },
      },
    }),
  ],
  servers: [/* ... */],
})
```

## 运行时依赖

生成的代码依赖 `yapi-typed-runtime` 包，它会在生成代码时自动安装。如果需要手动安装：

```bash
npm install yapi-typed-runtime
```

## 常见问题

### 如何获取项目 token？

1. 登录 YApi
2. 进入项目设置
3. 在"token 配置"中查看或生成 token

### 如何指定特定分类？

在配置中设置 `categories` 的 `id`：

```ts
categories: [
  {
    id: 123, // 具体的分类 ID
    outputFilePath: 'src/api/user.ts',
  },
]
```

### 如何自定义生成的代码格式？

yapi-typed 使用 Prettier 格式化生成的代码，会自动读取项目中的 `.prettierrc` 配置。
