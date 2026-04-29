# yapi-typed 使用指南

## 安装

**推荐：安装到项目（可锁定版本）**

```bash
# 使用 npm
npm install -D yapi-typed

# 使用 pnpm
pnpm add -D yapi-typed

# 使用 yarn
yarn add -D yapi-typed
```

**或者：直接使用 npx（无需安装）**

```bash
npx yapi-typed init
npx yapi-typed generate
```

> **注意**：`yapi-typed-runtime` 会在首次运行 `generate` 命令时自动安装，无需手动安装。

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

### 只生成类型（不生成请求函数）

如果只需要类型定义，不需要请求函数：

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
              typesOnly: true, // 只生成类型
              outputFilePath: 'src/api/types.ts',
            },
          ],
        },
      ],
    },
  ],
})
```

### 完整配置示例

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

### 按分类拆分文件并统一导出

如果希望每个 YApi 分类生成一个独立文件，同时保留统一入口：

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
              categoryFile: {
                enabled: true,
                clean: true,
                // 不配置翻译时，会直接使用分类原名生成文件。
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

生成结果类似：

```ts
// src/api/index.ts
export * from './order'
export * from './user'
```

也可以接入自托管 LibreTranslate，把中文分类名翻译成英文文件名：

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

如果需要接入 DeepL、Google Cloud Translation 或其他服务，可以使用自定义翻译函数：

```ts
categoryFile: {
  enabled: true,
  async translate(categoryName) {
    return await translateCategoryName(categoryName)
  },
}
```

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

生成的代码依赖 `yapi-typed-runtime` 包，它会在首次运行 `generate` 时自动安装。

### runtime 提供的功能

- **类型定义**：`RequestConfig`、`RequestFunctionParams` 等
- **枚举类型**：`Method`、`RequestBodyType`、`ResponseBodyType` 等
- **核心函数**：`prepare()` - 处理请求数据（路径参数替换、查询参数提取、文件数据分离）
- **文件上传**：`FileData` 类 - 包装文件数据

### 手动安装

虽然会自动安装，但建议手动添加到 package.json 以锁定版本：

```bash
pnpm add yapi-typed-runtime
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
