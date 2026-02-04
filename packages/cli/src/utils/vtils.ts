export function castArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

export function isArray(value: any): value is any[] {
  return Array.isArray(value)
}

export function isFunction(value: any): value is (...args: any[]) => any {
  return typeof value === 'function'
}

export function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object'
}

export function isEmpty(value: any): boolean {
  if (value == null) return true
  if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  if (isObject(value)) return Object.keys(value).length === 0
  return false
}

export function last<T>(value: T[]): T | undefined {
  return value.length ? value[value.length - 1] : undefined
}

export function noop(): void {}

export function uniq<T>(value: T[]): T[] {
  return Array.from(new Set(value))
}

export function values<T>(value: Record<string, T>): T[] {
  return Object.values(value)
}

export function groupBy<T, K extends string | number>(
  list: T[],
  getKey: (item: T) => K,
): Record<K, T[]> {
  return list.reduce((acc, item) => {
    const key = getKey(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<K, T[]>)
}

export function forOwn<T extends Record<string, any>>(
  value: T,
  iteratee: (item: T[keyof T], key: keyof T) => void,
): void {
  Object.keys(value).forEach(key => {
    iteratee(value[key]!, key as keyof T)
  })
}

export function each<T>(
  value: T[] | Record<string, T>,
  iteratee: (item: T, key: number | string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => iteratee(item, index))
  } else {
    Object.keys(value).forEach(key => iteratee(value[key]!, key))
  }
}

export function find<T>(
  value: T[] | Record<string, T>,
  predicate: (item: T, key?: number | string) => boolean,
): T | undefined {
  if (Array.isArray(value)) {
    return value.find((item, index) => predicate(item, index))
  }
  const keys = Object.keys(value)
  for (const key of keys) {
    const item = value[key]!
    if (predicate(item, key)) return item
  }
  return undefined
}

export function mapKeys<T extends Record<string, any>>(
  value: T,
  iteratee: (item: T[keyof T], key: keyof T) => string,
): Record<string, T[keyof T]> {
  return Object.keys(value).reduce<Record<string, T[keyof T]>>((acc, key) => {
    const newKey = iteratee(value[key]!, key as keyof T)
    acc[newKey] = value[key]!
    return acc
  }, {})
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  value: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...value } as T
  keys.forEach(key => {
    delete result[key]
  })
  return result as Omit<T, K>
}

export function cloneDeepFast<T>(value: T): T {
  if (!isObject(value)) return value
  if (Array.isArray(value)) {
    return value.map(item => cloneDeepFast(item)) as unknown as T
  }
  const result: Record<string, any> = {}
  Object.keys(value).forEach(key => {
    result[key] = cloneDeepFast((value as Record<string, any>)[key])
  })
  return result as T
}

export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  resolver?: (...args: Parameters<T>) => any,
): T {
  const cache = new Map<any, ReturnType<T>>()
  const memoized = ((...args: Parameters<T>) => {
    const key = resolver ? resolver(...args) : args[0]
    if (cache.has(key)) return cache.get(key) as ReturnType<T>
    const result = fn(...args)
    cache.set(key, result)
    return result
  }) as T
  return memoized
}

export function traverse(
  value: any,
  iteratee: (value: any, key: string | number | undefined, parent: any) => void,
): void {
  const visited = new Set<any>()
  const visit = (current: any, key: string | number | undefined, parent: any) => {
    iteratee(current, key, parent)
    if (!isObject(current) || visited.has(current)) return
    visited.add(current)
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, index, current))
    } else {
      Object.keys(current).forEach(k => visit(current[k], k, current))
    }
  }
  visit(value, undefined, undefined)
}

export async function run<T>(
  fn: () => Promise<T> | T,
): Promise<[unknown, T | undefined]> {
  try {
    return [null, await fn()]
  } catch (error) {
    return [error, undefined]
  }
}

export function indent(
  literals: TemplateStringsArray,
  ...interpolations: Array<string | number>
): string {
  let result = ''
  for (let i = 0; i < interpolations.length; i += 1) {
    const literal = literals[i] ?? ''
    let interpolation = interpolations[i]
    const match = literal.match(/(?:^|[\r\n]+)([^\S\r\n]*)$/)
    if (match && match[1]) {
      interpolation = String(interpolation).replace(
        /([\r\n]+)(?=[^\r\n])/g,
        `$1${match[1]}`,
      )
    }
    result += literal
    result += interpolation
  }
  result += literals[literals.length - 1]
  return result
}

export function dedent(text: string): string
export function dedent(
  literals: TemplateStringsArray,
  ...interpolations: Array<string | number>
): string
export function dedent(
  literals: TemplateStringsArray | string,
  ...interpolations: Array<string | number>
): string {
  const text = Array.isArray(literals)
    ? indent(literals as TemplateStringsArray, ...interpolations)
    : String(literals)
  const lines = text.split(/[\r\n]/g)
  let commonLeadingWhitespace: string | undefined
  let firstLineIndex: number | undefined
  let lastLineIndex: number | undefined
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ''
    if (leadingWhitespace.length !== line.length) {
      lastLineIndex = index
      if (firstLineIndex == null) firstLineIndex = index
      if (
        commonLeadingWhitespace == null ||
        leadingWhitespace.length < commonLeadingWhitespace.length
      ) {
        commonLeadingWhitespace = leadingWhitespace
      }
    }
  }
  if (!commonLeadingWhitespace) return text
  return lines
    .slice(firstLineIndex, (lastLineIndex ?? 0) + 1)
    .map(line => line.substr(commonLeadingWhitespace!.length))
    .join('\n')
}

export type WaitPromise = Promise<void> & { cancel: () => void }

export function wait(ms: number): WaitPromise {
  let timer: ReturnType<typeof setTimeout> | number | undefined
  const promise = new Promise<void>(resolve => {
    timer = setTimeout(resolve, ms)
  }) as WaitPromise
  promise.cancel = () => {
    if (timer) {
      clearTimeout(timer as any)
      timer = undefined
    }
  }
  return promise
}
