export type BivarianceFunc<This, Args extends readonly unknown[], Ret> = {
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  bivarianceHack(this: This, ...args: Args): Ret
}['bivarianceHack']

export const dirName = (path: string): string =>
  path.replace(/(?:^|\/)[^/]+$/, '')

export const dirPath = (path: string): string =>
  path.replace(/(^|\/)[^/]+$/, '$1')

export const normalizePath = (path: string): string => {
  path = path.replace(/(^|\/)(?:\.?(?:\/|$))+/g, '$1')
  for (;;) {
    const s = path.replace(/(^|\/)(?!\.\.(?:\/|$))[^/]+\/\.\.(?:\/|$)/g, '$1')
    if (s === path) return path
    path = s
  }
}

type Descriptor<X> = { configurable?: boolean; enumerable?: boolean } & (
  | { writable?: boolean; value: X; get?: never; set?: never }
  | { writable: boolean; value?: X; get?: never; set?: never }
  | { writable?: never; value?: never; get: () => X; set?: never }
  | { writable?: never; value?: never; get?: never; set: () => X }
)

export const safeDefineProperty = <
  Key extends string | symbol | number,
  Val,
  Obj extends { [P in Key]?: Val }
>(
  obj: Obj,
  key: Key,
  descriptor: Descriptor<Val>
): Obj => {
  const desc = Object.assign(Object.create(null), descriptor) as Descriptor<Val>
  return Object.defineProperty(obj, key, desc)
}
