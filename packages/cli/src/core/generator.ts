import * as changeCase from 'change-case'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'
import {
  castArray,
  cloneDeepFast,
  dedent,
  groupBy,
  isEmpty,
  isFunction,
  last,
  memoize,
  noop,
  omit,
  uniq,
  values,
} from '../utils/vtils'
import {
  CategoryList,
  CommentConfig,
  Config,
  ExtendedInterface,
  Interface,
  InterfaceList,
  Method,
  Project,
  ProjectConfig,
  QueryStringArrayFormat,
  RequestBodyType,
  RootConfig,
  ServerConfig,
  SyntheticalConfig,
} from '../types'
import { PluginContainer } from '../plugins/container'
import { renderTemplate } from './template'
import { mergeSharedConfig, normalizeConfig } from '../config'
import { exec } from 'child_process'
import {
  getCachedPrettierOptions,
  getNormalizedRelativePath,
  getPrettier,
  getRequestDataJsonSchema,
  getResponseDataJsonSchema,
  httpGet,
  jsonSchemaToType,
  configureSchemaCache,
  sortByWeights,
  throwError,
} from './utils'
import { SwaggerToYApiServer } from './swaggerToYApiServer'

interface OutputFileList {
  [outputFilePath: string]: {
    syntheticalConfig: SyntheticalConfig
    content: string[]
    requestFunctionFilePath: string
    requestHookMakerFilePath: string
  }
}

/**
 * @see https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free
 * @see https://terser.org/docs/api-reference.html#annotations
 */
const COMPRESSOR_TREE_SHAKING_ANNOTATION = '/*#__PURE__*/'
const require = createRequire(import.meta.url)

const DEFAULT_FILE_BANNER_TEMPLATE = dedent`
  /* tslint:disable */
  /* eslint-disable */

  /* 该文件由 yapi-to-ts 自动生成，请勿直接修改！！！ */
`

const DEFAULT_REQUEST_FUNCTION_TEMPLATE = dedent`
  import type { RequestFunctionParams } from '@yapi-to-ts/runtime'

  export interface RequestOptions {
    /**
     * 使用的服务器。
     *
     * - \`prod\`: 生产服务器
     * - \`dev\`: 测试服务器
     * - \`mock\`: 模拟服务器
     *
     * @default prod
     */
    server?: 'prod' | 'dev' | 'mock',
  }

  export default function request<TResponseData>(
    payload: RequestFunctionParams,
    options: RequestOptions = {
      server: 'prod',
    },
  ): Promise<TResponseData> {
    return new Promise<TResponseData>((resolve, reject) => {
      // 基本地址
      const baseUrl = options.server === 'mock'
        ? payload.mockUrl
        : options.server === 'dev'
          ? payload.devUrl
          : payload.prodUrl

      // 请求地址
      const url = \`\${baseUrl}\${payload.path}\`

      // 具体请求逻辑
    })
  }
`

const DEFAULT_REQUEST_HOOK_TEMPLATE = dedent`
  import { useState, useEffect } from 'react'
  import type { RequestConfig } from 'yapi-to-ts'
  import type { Request } from <%- JSON.stringify(getNormalizedRelativePath(requestHookMakerFilePath, outputFilePath)) %>
  import baseRequest from <%- JSON.stringify(getNormalizedRelativePath(requestHookMakerFilePath, requestFunctionFilePath)) %>

  export default function makeRequestHook<TRequestData, TRequestConfig extends RequestConfig, TRequestResult extends ReturnType<typeof baseRequest>>(request: Request<TRequestData, TRequestConfig, TRequestResult>) {
    type Data = TRequestResult extends Promise<infer R> ? R : TRequestResult
    return function useRequest(requestData: TRequestData) {
      // 一个简单的 Hook 实现，实际项目可结合其他库使用，比如：
      // @umijs/hooks 的 useRequest (https://github.com/umijs/hooks)
      // swr (https://github.com/vercel/swr)

      const [loading, setLoading] = useState(true)
      const [data, setData] = useState<Data>()

      useEffect(() => {
        request(requestData).then(data => {
          setLoading(false)
          setData(data as any)
        })
      }, [JSON.stringify(requestData)])

      return {
        loading,
        data,
      }
    }
  }
`

const RESERVED_IDENTIFIERS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'await',
  'implements',
  'interface',
  'let',
  'package',
  'private',
  'protected',
  'public',
  'static',
])

function sanitizeIdentifier(name: string): string {
  let result = String(name || '').replace(/[^A-Za-z0-9_$]/g, '_')
  if (!result) result = '_'
  if (!/^[A-Za-z_$]/.test(result)) result = `_${result}`
  if (RESERVED_IDENTIFIERS.has(result)) result = `${result}_`
  return result
}

function ensureUniqueIdentifier(name: string, used: Set<string>): string {
  let result = name
  let index = 2
  while (used.has(result)) {
    result = `${name}_${index}`
    index += 1
  }
  used.add(result)
  return result
}

function getDefaultRequestFunctionName(
  interfacePath: string,
  cc: typeof changeCase,
): string {
  const cleaned = interfacePath.split('?')[0]
  const parts = cleaned
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/^\{(.+)\}$/, '$1').replace(/^:(.+)$/, '$1'))
  if (parts.length === 0) return 'request'
  return cc.camelCase(parts.join('-'))
}

export class Generator {
  /** 配置 */
  private config: ServerConfig[] = []

  private rootConfig: RootConfig

  private disposes: Array<() => any> = []

  constructor(
    config: Config,
    private options: {
      cwd: string
      configFilePath?: string
      logger?: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
    } = { cwd: process.cwd() },
  ) {
    this.rootConfig = normalizeConfig(config)
    this.config = this.rootConfig.servers
  }

  private getTemplateBaseDir() {
    return this.options.configFilePath
      ? path.dirname(this.options.configFilePath)
      : this.options.cwd
  }

  private collectPlugins(...configs: Array<{ plugins?: any[] } | undefined>) {
    return configs.flatMap(item => item?.plugins ?? [])
  }

  async prepare(): Promise<void> {
    this.config = await Promise.all(
      // config 可能是对象或数组，统一为数组
      this.config.map(async item => {
        if (item.serverType === 'swagger') {
          const swaggerToYApiServer = new SwaggerToYApiServer({
            swaggerJsonUrl: item.serverUrl,
          })
          item.serverUrl = await swaggerToYApiServer.start()
          this.disposes.push(() => swaggerToYApiServer.stop())
        }
        if (item.serverUrl) {
          // 去除地址后面的 /
          // fix: https://github.com/fjc0k/yapi-to-typescript/issues/22
          item.serverUrl = item.serverUrl.replace(/\/+$/, '')
        }
        return item
      }),
    )
  }

  async generate(): Promise<OutputFileList> {
    const outputFileList: OutputFileList = Object.create(null)
    const logger = this.options.logger ?? console
    const runtime = { config: this.rootConfig, cwd: this.options.cwd, logger }
    const globalPlugins = this.collectPlugins(this.rootConfig, this.rootConfig.defaults)
    const globalContainer = new PluginContainer(globalPlugins, runtime)

    await globalContainer.hook('onStart', {
      config: this.rootConfig,
      cwd: this.options.cwd,
    })

    try {
      await Promise.all(
        this.config.map(async (serverConfig, serverIndex) => {
          const serverPlugins = this.collectPlugins(
            this.rootConfig,
            this.rootConfig.defaults,
            serverConfig,
          )
          const serverContainer = new PluginContainer(serverPlugins, {
            ...runtime,
            config: serverConfig,
          })

          await serverContainer.hook('onServer', {
            serverConfig,
            serverIndex,
          })

          const projects = serverConfig.projects.reduce<ProjectConfig[]>(
            (projects, project) => {
              projects.push(
                ...castArray(project.token).map(token => ({
                  ...project,
                  token: token,
                })),
              )
              return projects
            },
            [],
          )
          return Promise.all(
            projects.map(async (projectConfig, projectIndex) => {
              const projectPlugins = this.collectPlugins(
                this.rootConfig,
                this.rootConfig.defaults,
                serverConfig,
                projectConfig,
              )
              const projectContainer = new PluginContainer(projectPlugins, {
                ...runtime,
                config: projectConfig,
              })
              await projectContainer.hook('onProject', {
                serverConfig,
                projectConfig,
                projectIndex,
              })

              const projectInfo = await this.fetchProjectInfo({
                ...serverConfig,
                ...projectConfig,
              })
              await Promise.all(
                projectConfig.categories.map(
                  async (categoryConfig, categoryIndex) => {
                    const categoryPlugins = this.collectPlugins(
                      this.rootConfig,
                      this.rootConfig.defaults,
                      serverConfig,
                      projectConfig,
                      categoryConfig,
                    )
                    const categoryContainer = new PluginContainer(
                      categoryPlugins,
                      {
                        ...runtime,
                        config: categoryConfig,
                      },
                    )
                    await categoryContainer.hook('onCategory', {
                      serverConfig,
                      projectConfig,
                      categoryConfig,
                      categoryIndex,
                    })
                    // 分类处理
                    // 数组化
                    let categoryIds = castArray(categoryConfig.id)
                    // 全部分类
                    if (categoryIds.includes(0)) {
                      if (!isEmpty(projectInfo.cats)) {
                        categoryIds.push(
                          ...projectInfo.cats.map(cat => cat._id),
                        )
                      } else {
                        const exportCats =
                          (await this.fetchExport({
                            serverUrl: serverConfig.serverUrl!,
                            token: projectConfig.token!,
                          })) || []
                        const exportCatIds = exportCats
                          .map(cat => {
                            const rawCatId =
                              (cat as any)._id ??
                              (cat as any).catid ??
                              cat.list?.[0]?.catid
                            const catId = Number(rawCatId)
                            return Number.isFinite(catId) ? catId : undefined
                          })
                          .filter((id): id is number => typeof id === 'number')
                        categoryIds.push(...exportCatIds)
                      }
                    }
                    // 唯一化
                    categoryIds = uniq(categoryIds)
                    // 去掉被排除的分类
                    const excludedCategoryIds = categoryIds
                      .filter(id => id < 0)
                      .map(Math.abs)
                    categoryIds = categoryIds.filter(
                      id => !excludedCategoryIds.includes(Math.abs(id)),
                    )
                    // 删除不存在的分类
                    categoryIds = categoryIds.filter(
                      id => !!projectInfo.cats.find(cat => cat._id === id),
                    )
                    // 顺序化
                    categoryIds = categoryIds.sort()

                    const nameRegistryByOutputFilePath = new Map<
                      string,
                      Set<string>
                    >()
                    const codes = (
                      await Promise.all(
                        categoryIds.map<
                          Promise<
                            Array<{
                              outputFilePath: string
                              code: string
                              weights: number[]
                            }>
                          >
                        >(async (id, categoryIndex2) => {
                          categoryConfig = {
                            ...categoryConfig,
                            id: id,
                          }
                          const sharedDefaults = this.rootConfig.defaults
                          const mergedShared = mergeSharedConfig(
                            sharedDefaults,
                            serverConfig,
                            projectConfig,
                            categoryConfig,
                          )
                          const syntheticalConfig: SyntheticalConfig = {
                            ...mergedShared,
                            mockUrl: projectInfo.getMockUrl(),
                            templates:
                              mergedShared.templates ??
                              this.rootConfig.templates ??
                              sharedDefaults?.templates,
                            format:
                              mergedShared.format ??
                              this.rootConfig.format ??
                              sharedDefaults?.format,
                            cache:
                              mergedShared.cache ??
                              this.rootConfig.cache ??
                              sharedDefaults?.cache,
                            plugins: categoryPlugins,
                          }
                          syntheticalConfig.target =
                            syntheticalConfig.target || 'typescript'
                          syntheticalConfig.devUrl = projectInfo.getDevUrl(
                            syntheticalConfig.devEnvName!,
                          )
                          syntheticalConfig.prodUrl = projectInfo.getProdUrl(
                            syntheticalConfig.prodEnvName!,
                          )
                          configureSchemaCache(syntheticalConfig.cache?.schema)
                          const syntheticalContainer = new PluginContainer(
                            syntheticalConfig.plugins ?? [],
                            {
                              ...runtime,
                              config: syntheticalConfig,
                            },
                          )

                          // 接口列表
                          let interfaceList = await this.fetchInterfaceList(
                            syntheticalConfig,
                          )
                          interfaceList = (
                            await Promise.all(
                              interfaceList.map(async interfaceInfo => {
                                // 实现 _project 字段
                                interfaceInfo._project = omit(projectInfo, [
                                  'cats',
                                  'getMockUrl',
                                  'getDevUrl',
                                  'getProdUrl',
                                ])
                                // 预处理
                                const _interfaceInfo = isFunction(
                                  syntheticalConfig.preproccessInterface,
                                )
                                  ? syntheticalConfig.preproccessInterface(
                                      cloneDeepFast(interfaceInfo),
                                      changeCase,
                                      syntheticalConfig,
                                    )
                                  : interfaceInfo
                                await syntheticalContainer.hook('onInterface', {
                                  serverConfig,
                                  projectConfig,
                                  categoryConfig,
                                  interfaceInfo: _interfaceInfo,
                                  syntheticalConfig,
                                })
                                // preproccessInterface 返回 false 则剔除当前接口
                                if (_interfaceInfo === false) return false as any
                                return _interfaceInfo
                              }),
                            )
                          ).filter(Boolean)

                          // 检测是否有数据
                          if (isEmpty(interfaceList)) {
                            return []
                          }

                          // 生成代码
                          const interfaceCodes = await Promise.all(
                            interfaceList.map<
                              Promise<{
                                categoryUID: string
                                outputFilePath: string
                                weights: number[]
                                code: string
                              }>
                            >(async interfaceInfo => {
                              const outputFilePath = path.resolve(
                                this.options.cwd,
                                typeof syntheticalConfig.outputFilePath ===
                                  'function'
                                  ? syntheticalConfig.outputFilePath(
                                      interfaceInfo,
                                      changeCase,
                                    )
                                  : syntheticalConfig.outputFilePath!,
                              )
                              let nameRegistry =
                                nameRegistryByOutputFilePath.get(outputFilePath)
                              if (!nameRegistry) {
                                nameRegistry = new Set<string>()
                                nameRegistryByOutputFilePath.set(
                                  outputFilePath,
                                  nameRegistry,
                                )
                              }
                              const categoryUID = `_${serverIndex}_${projectIndex}_${categoryIndex}_${categoryIndex2}`
                              const code = await this.generateInterfaceCode(
                                syntheticalConfig,
                                interfaceInfo,
                                categoryUID,
                                nameRegistry,
                              )
                              const weights: number[] = [
                                serverIndex,
                                projectIndex,
                                categoryIndex,
                                categoryIndex2,
                              ]
                              return {
                                categoryUID,
                                outputFilePath,
                                weights,
                                code,
                              }
                            }),
                          )

                          const groupedInterfaceCodes = groupBy(
                            interfaceCodes,
                            item => item.outputFilePath,
                          )
                          return Object.keys(groupedInterfaceCodes).map(
                            outputFilePath => {
                              const categoryCode = [
                                ...uniq(
                                  sortByWeights(
                                    groupedInterfaceCodes[outputFilePath],
                                  ).map(item => item.categoryUID),
                                ).map(categoryUID =>
                                  syntheticalConfig.typesOnly
                                    ? ''
                                    : dedent`
                                      const mockUrl${categoryUID} = ${JSON.stringify(
                                        syntheticalConfig.mockUrl,
                                      )} as any
                                      const devUrl${categoryUID} = ${JSON.stringify(
                                        syntheticalConfig.devUrl,
                                      )} as any
                                      const prodUrl${categoryUID} = ${JSON.stringify(
                                        syntheticalConfig.prodUrl,
                                      )} as any
                                      const dataKey${categoryUID} = ${JSON.stringify(
                                        syntheticalConfig.dataKey,
                                      )} as any
                                    `,
                                ),
                                ...sortByWeights(
                                  groupedInterfaceCodes[outputFilePath],
                                ).map(item => item.code),
                              ]
                                .filter(Boolean)
                                .join('\n\n')
                              if (!outputFileList[outputFilePath]) {
                                outputFileList[outputFilePath] = {
                                  syntheticalConfig,
                                  content: [],
                                  requestFunctionFilePath:
                                    syntheticalConfig.requestFunctionFilePath
                                      ? path.resolve(
                                          this.options.cwd,
                                          syntheticalConfig.requestFunctionFilePath,
                                        )
                                      : path.join(
                                          path.dirname(outputFilePath),
                                          'request.ts',
                                        ),
                                  requestHookMakerFilePath:
                                    syntheticalConfig.reactHooks &&
                                    syntheticalConfig.reactHooks.enabled
                                      ? syntheticalConfig.reactHooks
                                          .requestHookMakerFilePath
                                        ? path.resolve(
                                            this.options.cwd,
                                            syntheticalConfig.reactHooks
                                              .requestHookMakerFilePath,
                                          )
                                        : path.join(
                                            path.dirname(outputFilePath),
                                            'makeRequestHook.ts',
                                          )
                                      : '',
                                }
                              }
                              return {
                                outputFilePath: outputFilePath,
                                code: categoryCode,
                                weights: last(
                                  sortByWeights(
                                    groupedInterfaceCodes[outputFilePath],
                                  ),
                                )!.weights,
                              }
                            },
                          )
                        }),
                      )
                    ).flat()

                    for (const groupedCodes of values(
                      groupBy(codes, item => item.outputFilePath),
                    )) {
                      sortByWeights(groupedCodes)
                      outputFileList[groupedCodes[0].outputFilePath].content.push(
                        ...groupedCodes.map(item => item.code),
                      )
                    }
                  },
                ),
              )
            }),
          )
        }),
      )
    } catch (error) {
      await globalContainer.hook('onError', { error })
      throw error
    }

    await globalContainer.hook('onComplete', {
      config: this.rootConfig,
      outputFileList,
    })

    return outputFileList
  }

  async write(outputFileList: OutputFileList): Promise<void[]> {
    const templateBaseDir = this.getTemplateBaseDir()
    const logger = this.options.logger ?? console

    return Promise.all(
      Object.keys(outputFileList).map(async outputFilePath => {
        let {
          // eslint-disable-next-line prefer-const
          content,
          requestFunctionFilePath,
          requestHookMakerFilePath,
          // eslint-disable-next-line prefer-const
          syntheticalConfig,
        } = outputFileList[outputFilePath]

        const pluginContainer = new PluginContainer(
          syntheticalConfig.plugins ?? [],
          {
            config: syntheticalConfig,
            cwd: this.options.cwd,
            logger,
          },
        )

        const rawRequestFunctionFilePath = requestFunctionFilePath
        const rawRequestHookMakerFilePath = requestHookMakerFilePath

        // 支持 .jsx? 后缀
        outputFilePath = outputFilePath.replace(/\.js(x)?$/, '.ts$1')
        requestFunctionFilePath = requestFunctionFilePath.replace(
          /\.js(x)?$/,
          '.ts$1',
        )
        requestHookMakerFilePath = requestHookMakerFilePath.replace(
          /\.js(x)?$/,
          '.ts$1',
        )

        const templateContext = {
          config: syntheticalConfig,
          outputFilePath,
          requestFunctionFilePath,
          requestHookMakerFilePath,
          changeCase,
          getNormalizedRelativePath,
        }

        if (!syntheticalConfig.typesOnly) {
          if (!(await fs.pathExists(rawRequestFunctionFilePath))) {
            const requestTemplate =
              syntheticalConfig.templates?.requestFunction ??
              DEFAULT_REQUEST_FUNCTION_TEMPLATE
            const requestContent = await renderTemplate(
              requestTemplate,
              templateContext,
              templateBaseDir,
              syntheticalConfig.templates,
            )
            await fs.outputFile(requestFunctionFilePath, requestContent)
          }
          if (
            syntheticalConfig.reactHooks &&
            syntheticalConfig.reactHooks.enabled &&
            !(await fs.pathExists(rawRequestHookMakerFilePath))
          ) {
            const hookTemplate =
              syntheticalConfig.templates?.requestHookMaker ??
              DEFAULT_REQUEST_HOOK_TEMPLATE
            const hookContent = await renderTemplate(
              hookTemplate,
              templateContext,
              templateBaseDir,
              syntheticalConfig.templates,
            )
            await fs.outputFile(requestHookMakerFilePath, hookContent)
          }
        }

        await pluginContainer.hook('onGenerateFile', {
          outputFilePath,
          content,
          syntheticalConfig,
        })

        const fileBannerTemplate =
          syntheticalConfig.templates?.fileBanner ?? DEFAULT_FILE_BANNER_TEMPLATE
        const fileBanner = await renderTemplate(
          fileBannerTemplate,
          templateContext,
          templateBaseDir,
          syntheticalConfig.templates,
        )

        // 始终写入主文件
        const rawOutputContent = dedent`
          ${fileBanner}

          ${
            syntheticalConfig.typesOnly
              ? dedent`
                // @ts-ignore
                type FileData = File

                ${content.join('\n\n').trim()}
              `
              : dedent`
                // @ts-ignore
                // prettier-ignore
                import { QueryStringArrayFormat, Method, RequestBodyType, ResponseBodyType, FileData, prepare } from '@yapi-to-ts/runtime'
                // @ts-ignore
                // prettier-ignore
                import type { RequestConfig, RequestFunctionRestArgs } from '@yapi-to-ts/runtime'
                // @ts-ignore
                import request from ${JSON.stringify(
                  getNormalizedRelativePath(
                    outputFilePath,
                    requestFunctionFilePath,
                  ),
                )}
                ${
                  !syntheticalConfig.reactHooks ||
                  !syntheticalConfig.reactHooks.enabled
                    ? ''
                    : dedent`
                      // @ts-ignore
                      import makeRequestHook from ${JSON.stringify(
                        getNormalizedRelativePath(
                          outputFilePath,
                          requestHookMakerFilePath,
                        ),
                      )}
                    `
                }

                type UserRequestRestArgs = RequestFunctionRestArgs<typeof request>

                // Request: 目前 React Hooks 功能有用到
                export type Request<TRequestData, TRequestConfig extends RequestConfig, TRequestResult> = (
                  TRequestConfig['requestDataOptional'] extends true
                    ? (requestData?: TRequestData, ...args: RequestFunctionRestArgs<typeof request>) => TRequestResult
                    : (requestData: TRequestData, ...args: RequestFunctionRestArgs<typeof request>) => TRequestResult
                ) & {
                  requestConfig: TRequestConfig
                }

                ${content.join('\n\n').trim()}
              `
          }
        `

        let outputContent = rawOutputContent
        if (syntheticalConfig.format?.prettier !== false) {
          // ref: https://prettier.io/docs/en/options.html
          const prettier = await getPrettier(this.options.cwd)
          // 此处需用 await 以兼容 Prettier 3
          const prettyOutputContent = await prettier.format(rawOutputContent, {
            ...(await getCachedPrettierOptions()),
            ...(syntheticalConfig.format?.prettierOptions ?? {}),
            filepath: outputFilePath,
          })
          outputContent = `${dedent`
            /* prettier-ignore-start */
            ${prettyOutputContent}
            /* prettier-ignore-end */
          `}
`
        }

        const writeContext = {
          outputFilePath,
          content: outputContent,
          syntheticalConfig,
        }
        await pluginContainer.hook('onBeforeWrite', writeContext)
        await fs.outputFile(outputFilePath, writeContext.content)
        await pluginContainer.hook('onAfterWrite', writeContext)

        // 如果要生成 JavaScript 代码，
        // 则先对主文件进行 tsc 编译，主文件引用到的其他文件也会被编译，
        // 然后，删除原始的 .tsx? 文件。
        if (syntheticalConfig.target === 'javascript') {
          await this.tsc(outputFilePath)
          await Promise.all([
            fs.remove(requestFunctionFilePath).catch(noop),
            fs.remove(requestHookMakerFilePath).catch(noop),
            fs.remove(outputFilePath).catch(noop),
          ])
        }
      }),
    )
  }

  async tsc(file: string): Promise<void> {
    return new Promise<void>(resolve => {
      // add this to fix bug that not-generator-file-on-window
      const command = `${
        os.platform() === 'win32' ? 'node ' : ''
      }${JSON.stringify(require.resolve(`typescript/bin/tsc`))}`

      exec(
        `${command} --target ES2019 --module ESNext --jsx preserve --declaration --esModuleInterop ${JSON.stringify(
          file,
        )}`,
        {
          cwd: this.options.cwd,
          env: process.env,
        },
        () => resolve(),
      )
    })
  }

  async fetchApi<T = any>(url: string, query: Record<string, any>): Promise<T> {
    const res = await httpGet<{
      errcode: any
      errmsg: any
      data: any
    }>(url, query)
    /* istanbul ignore next */
    if (res && res.errcode) {
      throwError(
        `${res.errmsg} [请求地址: ${url}] [请求参数: ${new URLSearchParams(
          query,
        ).toString()}]`,
      )
    }
    return res.data || res
  }

  fetchProject: (args: SyntheticalConfig) => Promise<Project> = memoize(
    async ({ serverUrl, token }: SyntheticalConfig) => {
      const projectInfo = await this.fetchApi<Project>(
        `${serverUrl}/api/project/get`,
        {
          token: token!,
        },
      )
      const basePath = `/${projectInfo.basepath || '/'}`
        .replace(/\/+$/, '')
        .replace(/^\/+/, '/')
      projectInfo.basepath = basePath
      // 实现项目在 YApi 上的地址
      projectInfo._url = `${serverUrl}/project/${projectInfo._id}/interface/api`
      return projectInfo
    },
    ({ serverUrl, token }: SyntheticalConfig) => `${serverUrl}|${token}`,
  )

  fetchExport: (args: SyntheticalConfig) => Promise<CategoryList> = memoize(
    async ({ serverUrl, token }: SyntheticalConfig) => {
      const projectInfo = await this.fetchProject({ serverUrl, token })
      const categoryList = await this.fetchApi<CategoryList>(
        `${serverUrl}/api/plugin/export`,
        {
          type: 'json',
          status: 'all',
          isWiki: 'false',
          token: token!,
        },
      )
      return categoryList.map(cat => {
        const projectId = cat.list?.[0]?.project_id || 0
        const catId = cat.list?.[0]?.catid || 0
        // 实现分类在 YApi 上的地址
        cat._url = `${serverUrl}/project/${projectId}/interface/api/cat_${catId}`
        cat.list = (cat.list || []).map(item => {
          const interfaceId = item._id
          // 实现接口在 YApi 上的地址
          item._url = `${serverUrl}/project/${projectId}/interface/api/${interfaceId}`
          item.path = `${projectInfo.basepath}${item.path}`
          return item
        })
        return cat
      })
    },
    ({ serverUrl, token }: SyntheticalConfig) => `${serverUrl}|${token}`,
  )

  /** 获取分类的接口列表 */
  async fetchInterfaceList({
    serverUrl,
    token,
    id,
  }: SyntheticalConfig): Promise<InterfaceList> {
    const category = (
      (await this.fetchExport({ serverUrl, token })) || []
    ).find(cat => {
      if (isEmpty(cat) || isEmpty(cat.list)) return false
      const rawCatId =
        (cat as any)._id ?? (cat as any).catid ?? cat.list?.[0]?.catid
      const catId = Number(rawCatId)
      return Number.isFinite(catId) && catId === Number(id)
    })

    if (category) {
      category.list.forEach(interfaceInfo => {
        // 实现 _category 字段
        interfaceInfo._category = omit(category, ['list'])
      })
    }

    return category ? category.list : []
  }

  /** 获取项目信息 */
  async fetchProjectInfo(syntheticalConfig: SyntheticalConfig): Promise<Project> {
    const projectInfo = await this.fetchProject(syntheticalConfig)
    const projectCats = await this.fetchApi<CategoryList>(
      `${syntheticalConfig.serverUrl}/api/interface/getCatMenu`,
      {
        token: syntheticalConfig.token!,
        project_id: projectInfo._id,
      },
    )
    return {
      ...projectInfo,
      cats: projectCats,
      getMockUrl: () =>
        `${syntheticalConfig.serverUrl}/mock/${projectInfo._id}`,
      getDevUrl: (devEnvName: string) => {
        const env = projectInfo.env.find(e => e.name === devEnvName)
        return (env && env.domain) /* istanbul ignore next */ || ''
      },
      getProdUrl: (prodEnvName: string) => {
        const env = projectInfo.env.find(e => e.name === prodEnvName)
        return (env && env.domain) /* istanbul ignore next */ || ''
      },
    }
  }

  /** 生成接口代码 */
  async generateInterfaceCode(
    syntheticalConfig: SyntheticalConfig,
    interfaceInfo: Interface,
    categoryUID: string,
    nameRegistry?: Set<string>,
  ): Promise<string> {
    const extendedInterfaceInfo: ExtendedInterface = {
      ...interfaceInfo,
      parsedPath: path.parse(interfaceInfo.path),
    }
    const requestFunctionName = isFunction(
      syntheticalConfig.getRequestFunctionName,
    )
      ? await syntheticalConfig.getRequestFunctionName(
          extendedInterfaceInfo,
          changeCase,
        )
      : getDefaultRequestFunctionName(extendedInterfaceInfo.path, changeCase)
    const safeRequestFunctionName = sanitizeIdentifier(requestFunctionName)
    const uniqueRequestFunctionName = nameRegistry
      ? ensureUniqueIdentifier(safeRequestFunctionName, nameRegistry)
      : safeRequestFunctionName
    const requestConfigName = changeCase.camelCase(
      `${uniqueRequestFunctionName}RequestConfig`,
    )
    const requestConfigTypeName = changeCase.pascalCase(requestConfigName)
    const requestDataTypeName = isFunction(
      syntheticalConfig.getRequestDataTypeName,
    )
      ? await syntheticalConfig.getRequestDataTypeName(
          extendedInterfaceInfo,
          changeCase,
        )
      : changeCase.pascalCase(`${uniqueRequestFunctionName}Request`)
    const responseDataTypeName = isFunction(
      syntheticalConfig.getResponseDataTypeName,
    )
      ? await syntheticalConfig.getResponseDataTypeName(
          extendedInterfaceInfo,
          changeCase,
        )
      : changeCase.pascalCase(`${uniqueRequestFunctionName}Response`)
    const requestDataJsonSchema = getRequestDataJsonSchema(
      extendedInterfaceInfo,
      syntheticalConfig.customTypeMapping || {},
    )
    const requestDataType = await jsonSchemaToType(
      requestDataJsonSchema,
      requestDataTypeName,
    )
    const responseDataJsonSchema = getResponseDataJsonSchema(
      extendedInterfaceInfo,
      syntheticalConfig.customTypeMapping || {},
      syntheticalConfig.dataKey,
    )
    const responseDataType = await jsonSchemaToType(
      responseDataJsonSchema,
      responseDataTypeName,
    )
    const isRequestDataOptional = /(\{\}|any)$/s.test(requestDataType)
    const requestHookName =
      syntheticalConfig.reactHooks && syntheticalConfig.reactHooks.enabled
        ? isFunction(syntheticalConfig.reactHooks.getRequestHookName)
          ? /* istanbul ignore next */
            await syntheticalConfig.reactHooks.getRequestHookName(
              extendedInterfaceInfo,
              changeCase,
            )
          : `use${changeCase.pascalCase(uniqueRequestFunctionName)}`
        : ''

    // 支持路径参数
    const paramNames = (
      extendedInterfaceInfo.req_params /* istanbul ignore next */ || []
    ).map(item => item.name)
    const paramNamesLiteral = JSON.stringify(paramNames)
    const paramNameType =
      paramNames.length === 0 ? 'string' : `'${paramNames.join("' | '")}'`

    // 支持查询参数
    const queryNames = (
      extendedInterfaceInfo.req_query /* istanbul ignore next */ || []
    ).map(item => item.name)
    const queryNamesLiteral = JSON.stringify(queryNames)
    const queryNameType =
      queryNames.length === 0 ? 'string' : `'${queryNames.join("' | '")}'`

    // 接口注释
    const genComment = (genTitle: (title: string) => string) => {
      const {
        enabled: isEnabled = true,
        title: hasTitle = true,
        category: hasCategory = true,
        tag: hasTag = true,
        requestHeader: hasRequestHeader = true,
        updateTime: hasUpdateTime = true,
        link: hasLink = true,
        extraTags,
      } = {
        ...syntheticalConfig.comment,
        // Swagger 时总是禁用标签、更新时间、链接
        ...(syntheticalConfig.serverType === 'swagger'
          ? {
              tag: false,
              updateTime: false,
              link: false,
            }
          : {}),
      } as CommentConfig
      if (!isEnabled) {
        return ''
      }
      // 转义标题中的 /
      const escapedTitle = String(extendedInterfaceInfo.title).replace(
        /\//g,
        '\\/',
      )
      const description = hasLink
        ? `[${escapedTitle}↗](${extendedInterfaceInfo._url})`
        : escapedTitle
      const summary: Array<
        | false
        | {
            label: string
            value: string | string[]
          }
      > = [
        hasCategory && {
          label: '分类',
          value: hasLink
            ? `[${extendedInterfaceInfo._category.name}↗](${extendedInterfaceInfo._category._url})`
            : extendedInterfaceInfo._category.name,
        },
        hasTag && {
          label: '标签',
          value: extendedInterfaceInfo.tag.map(tag => `\`${tag}\``),
        },
        hasRequestHeader && {
          label: '请求头',
          value: `\`${extendedInterfaceInfo.method.toUpperCase()} ${
            extendedInterfaceInfo.path
          }\``,
        },
        hasUpdateTime && {
          label: '更新时间',
          value: process.env.JEST_WORKER_ID // 测试时使用 unix 时间戳
            ? String(extendedInterfaceInfo.up_time)
            : /* istanbul ignore next */
              `\`${dayjs(extendedInterfaceInfo.up_time * 1000).format(
                'YYYY-MM-DD HH:mm:ss',
              )}\``,
        },
      ]
      if (typeof extraTags === 'function') {
        const tags = extraTags(extendedInterfaceInfo)
        for (const tag of tags) {
          ;(tag.position === 'start' ? summary.unshift : summary.push).call(
            summary,
            {
              label: tag.name,
              value: tag.value,
            },
          )
        }
      }
      const titleComment = hasTitle
        ? dedent`
            * ${genTitle(description)}
            *
          `
        : ''
      const extraComment: string = summary
        .filter(item => typeof item !== 'boolean' && !isEmpty(item.value))
        .map(item => {
          const _item: Exclude<(typeof summary)[0], boolean> = item as any
          return `* @${_item.label} ${castArray(_item.value).join(', ')}`
        })
        .join('\n')
      return dedent`
        /**
         ${[titleComment, extraComment].filter(Boolean).join('\n')}
         */
      `
    }

    // 请求参数额外信息
    const requestFunctionExtraInfo =
      typeof syntheticalConfig.setRequestFunctionExtraInfo === 'function'
        ? await syntheticalConfig.setRequestFunctionExtraInfo(
            extendedInterfaceInfo,
            changeCase,
          )
        : {}

    return dedent`
      ${genComment(title => `接口 ${title} 的 **请求类型**`)}
      ${requestDataType.trim()}

      ${genComment(title => `接口 ${title} 的 **返回类型**`)}
      ${responseDataType.trim()}

      ${
        syntheticalConfig.typesOnly
          ? ''
          : dedent`
            ${genComment(title => `接口 ${title} 的 **请求配置的类型**`)}
            type ${requestConfigTypeName} = Readonly<RequestConfig<
              ${JSON.stringify(syntheticalConfig.mockUrl)},
              ${JSON.stringify(syntheticalConfig.devUrl)},
              ${JSON.stringify(syntheticalConfig.prodUrl)},
              ${JSON.stringify(extendedInterfaceInfo.path)},
              ${JSON.stringify(syntheticalConfig.dataKey) || 'undefined'},
              ${paramNameType},
              ${queryNameType},
              ${JSON.stringify(isRequestDataOptional)}
            >>

            ${genComment(title => `接口 ${title} 的 **请求配置**`)}
            const ${requestConfigName}: ${requestConfigTypeName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} {
              mockUrl: mockUrl${categoryUID},
              devUrl: devUrl${categoryUID},
              prodUrl: prodUrl${categoryUID},
              path: ${JSON.stringify(extendedInterfaceInfo.path)},
              method: Method.${extendedInterfaceInfo.method},
              requestHeaders: ${JSON.stringify(
                (extendedInterfaceInfo.req_headers || [])
                  .filter(item => item.name.toLowerCase() !== 'content-type')
                  .reduce<Record<string, string>>((res, item) => {
                    res[item.name] = item.value
                    return res
                  }, {}),
              )},
              requestBodyType: RequestBodyType.${
                extendedInterfaceInfo.method === Method.GET
                  ? RequestBodyType.query
                  : extendedInterfaceInfo.req_body_type /* istanbul ignore next */ ||
                    RequestBodyType.none
              },
              responseBodyType: ResponseBodyType.${
                extendedInterfaceInfo.res_body_type
              },
              dataKey: dataKey${categoryUID},
              paramNames: ${paramNamesLiteral},
              queryNames: ${queryNamesLiteral},
              requestDataOptional: ${JSON.stringify(isRequestDataOptional)},
              requestDataJsonSchema: ${JSON.stringify(
                syntheticalConfig.jsonSchema?.enabled &&
                  syntheticalConfig.jsonSchema?.requestData !== false
                  ? requestDataJsonSchema
                  : {},
              )},
              responseDataJsonSchema: ${JSON.stringify(
                syntheticalConfig.jsonSchema?.enabled &&
                  syntheticalConfig.jsonSchema?.responseData !== false
                  ? responseDataJsonSchema
                  : {},
              )},
              requestFunctionName: ${JSON.stringify(uniqueRequestFunctionName)},
              queryStringArrayFormat: QueryStringArrayFormat.${
                syntheticalConfig.queryStringArrayFormat ||
                QueryStringArrayFormat.brackets
              },
              extraInfo: ${JSON.stringify(requestFunctionExtraInfo)},
            }

            ${genComment(title => `接口 ${title} 的 **请求函数**`)}
            export const ${uniqueRequestFunctionName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} (
              requestData${
                isRequestDataOptional ? '?' : ''
              }: ${requestDataTypeName},
              ...args: UserRequestRestArgs
            ) => {
              return request<${responseDataTypeName}>(
                prepare(${requestConfigName}, requestData),
                ...args,
              )
            }

            ${uniqueRequestFunctionName}.requestConfig = ${requestConfigName}

            ${
              !syntheticalConfig.reactHooks ||
              !syntheticalConfig.reactHooks.enabled
                ? ''
                : dedent`
                  ${genComment(title => `接口 ${title} 的 **React Hook**`)}
                  export const ${requestHookName} = ${COMPRESSOR_TREE_SHAKING_ANNOTATION} makeRequestHook<${requestDataTypeName}, ${requestConfigTypeName}, ReturnType<typeof ${uniqueRequestFunctionName}>>(${uniqueRequestFunctionName})
                `
            }
          `
      }
    `
  }

  async destroy(): Promise<any[]> {
    return Promise.all(this.disposes.map(async dispose => dispose()))
  }
}
