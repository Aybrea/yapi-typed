export type AsyncOrSync<T> = T | Promise<T>

export type OneOrMore<T> = T | T[]

export type Defined<T> = T extends undefined ? never : T

export type LiteralUnion<Literal, Base = string> = Literal | (Base & {})

export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export type AsyncReturnType<T extends (...args: any[]) => any> = Awaited<
  ReturnType<T>
>
