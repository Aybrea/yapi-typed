export type OneOrMore<T> = T | T[]

/** 请求方式 */
export enum Method {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  PATCH = 'PATCH',
}

/** 请求数据类型 */
export enum RequestBodyType {
  query = 'query',
  form = 'form',
  json = 'json',
  text = 'text',
  file = 'file',
  raw = 'raw',
  none = 'none',
}

/** 返回数据类型 */
export enum ResponseBodyType {
  json = 'json',
  text = 'text',
  xml = 'xml',
  raw = 'raw',
}

/** 查询字符串数组格式化方式 */
export enum QueryStringArrayFormat {
  brackets = 'brackets',
  indices = 'indices',
  repeat = 'repeat',
  comma = 'comma',
  json = 'json',
}

// Keep typings light to avoid pulling heavy deps into client bundles
export type JSONSchema4 = any

/**
 * 请求配置。
 */
export interface RequestConfig<
  MockUrl extends string = string,
  DevUrl extends string = string,
  ProdUrl extends string = string,
  Path extends string = string,
  DataKey extends OneOrMore<string> | undefined = OneOrMore<string> | undefined,
  ParamName extends string = string,
  QueryName extends string = string,
  RequestDataOptional extends boolean = boolean,
> {
  /** 接口 Mock 地址，结尾无 `/` */
  mockUrl: MockUrl
  /** 接口测试环境地址，结尾无 `/` */
  devUrl: DevUrl
  /** 接口生产环境地址，结尾无 `/` */
  prodUrl: ProdUrl
  /** 接口路径，以 `/` 开头 */
  path: Path
  /** 请求方法 */
  method: Method
  /** 请求头，除了 Content-Type 的所有头 */
  requestHeaders: Record<string, string>
  /** 请求数据类型 */
  requestBodyType: RequestBodyType
  /** 返回数据类型 */
  responseBodyType: ResponseBodyType
  /** 数据所在键 */
  dataKey: DataKey
  /** 路径参数的名称列表 */
  paramNames: ParamName[]
  /** 查询参数的名称列表 */
  queryNames: QueryName[]
  /** 请求数据是否可选 */
  requestDataOptional: RequestDataOptional
  /** 请求数据的 JSON Schema (仅开启了 JSON Schema 生成时生效) */
  requestDataJsonSchema: JSONSchema4
  /** 返回数据的 JSON Schema (仅开启了 JSON Schema 生成时生效) */
  responseDataJsonSchema: JSONSchema4
  /** 请求函数名称 */
  requestFunctionName: string
  /** 如何格式化查询字符串中的数组值 */
  queryStringArrayFormat: QueryStringArrayFormat
  /** 额外信息 */
  extraInfo: Record<string, any>
}

/**
 * 请求参数。
 */
export interface RequestFunctionParams extends RequestConfig {
  /** 原始数据 */
  rawData: unknown
  /** 请求数据，不含文件数据 */
  data: Record<string, any>
  /** 是否有文件数据 */
  hasFileData: boolean
  /** 请求文件数据 */
  fileData: Record<string, any>
  /** 所有请求数据，包括 data、fileData */
  allData: Record<string, any>
  /** 获取全部请求数据（包含文件）的 FormData 实例 */
  getFormData: () => FormData
}

/** 请求函数的额外参数 */
export type RequestFunctionRestArgs<T extends Function> = T extends (
  payload: any,
  ...args: infer R
) => any
  ? R
  : never

type AppendOptions = Record<string, any>

export class FileData<T = any> {
  private originalFileData: T
  private options: AppendOptions | undefined

  public constructor(originalFileData: T, options?: AppendOptions) {
    this.originalFileData = originalFileData
    this.options = options
  }

  public getOriginalFileData(): T {
    return this.originalFileData
  }

  public getOptions(): AppendOptions | undefined {
    return this.options
  }
}

export function parseRequestData(requestData?: unknown): {
  data: Record<string, unknown>
  fileData: Record<string, unknown>
} {
  const result = {
    data: {} as Record<string, unknown>,
    fileData: {} as Record<string, unknown>,
  }
  if (requestData != null) {
    if (typeof requestData === 'object' && !Array.isArray(requestData)) {
      const obj = requestData as Record<string, unknown>
      Object.keys(obj).forEach((key) => {
        if (obj[key] instanceof FileData) {
          result.fileData[key] = (obj[key] as FileData).getOriginalFileData()
        } else {
          result.data[key] = obj[key]
        }
      })
    } else {
      result.data = requestData as Record<string, unknown>
    }
  }
  return result
}

const queryStringify = (
  key: string,
  value: any,
  arrayFormat: QueryStringArrayFormat,
): string => {
  let str = ''
  if (value != null) {
    if (!Array.isArray(value)) {
      str = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    } else if (arrayFormat === QueryStringArrayFormat.indices) {
      str = value
        .map(
          (v, i) =>
            `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(v)}`,
        )
        .join('&')
    } else if (arrayFormat === QueryStringArrayFormat.repeat) {
      str = value.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&')
    } else if (arrayFormat === QueryStringArrayFormat.comma) {
      str = `${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`
    } else if (arrayFormat === QueryStringArrayFormat.json) {
      str = `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`
    } else {
      str = value
        .map((v) => `${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(v)}`)
        .join('&')
    }
  }
  return str
}

export function prepare(
  requestConfig: RequestConfig,
  requestData: unknown,
): RequestFunctionParams {
  let requestPath: string = requestConfig.path
  const { data, fileData } = parseRequestData(requestData)
  const dataIsObject = data != null && typeof data === 'object' && !Array.isArray(data)
  if (dataIsObject) {
    if (Array.isArray(requestConfig.paramNames) && requestConfig.paramNames.length > 0) {
      Object.keys(data).forEach((key) => {
        if (requestConfig.paramNames.indexOf(key) >= 0) {
          requestPath = requestPath
            .replace(new RegExp(`\\{${key}\\}`, 'g'), String(data[key]))
            .replace(new RegExp(`/:${key}(?=/|$)`, 'g'), `/${String(data[key])}`)
          delete data[key]
        }
      })
    }

    let queryString = ''
    if (Array.isArray(requestConfig.queryNames) && requestConfig.queryNames.length > 0) {
      Object.keys(data).forEach((key) => {
        if (requestConfig.queryNames.indexOf(key) >= 0) {
          if (data[key] != null) {
            queryString += `${queryString ? '&' : ''}${queryStringify(
              key,
              data[key],
              requestConfig.queryStringArrayFormat,
            )}`
          }
          delete data[key]
        }
      })
    }
    if (queryString) {
      requestPath += `${requestPath.indexOf('?') > -1 ? '&' : '?'}${queryString}`
    }
  }

  const allData = {
    ...(dataIsObject ? data : {}),
    ...fileData,
  }

  const getFormData = () => {
    const useNativeFormData = typeof FormData !== 'undefined'
    if (!useNativeFormData) {
      throw new Error('当前环境不支持 FormData')
    }
    const formData = new FormData()
    Object.keys(data).forEach((key) => {
      formData.append(key, data[key] as string)
    })
    const rawObj = requestData as Record<string, unknown>
    Object.keys(fileData).forEach((key) => {
      const options = (rawObj[key] as FileData).getOptions()
      const files = Array.isArray(fileData[key]) ? fileData[key] : [fileData[key]]
      files.forEach((file: Blob) => {
        formData.append(key, file, options?.filename != null ? String(options.filename) : undefined)
      })
    })
    return formData as any
  }

  return {
    ...requestConfig,
    path: requestPath,
    rawData: requestData,
    data: data,
    hasFileData: fileData && Object.keys(fileData).length > 0,
    fileData: fileData,
    allData: allData,
    getFormData: getFormData,
  }
}
