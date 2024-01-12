export type BivarianceFunc<This, Args extends readonly unknown[], Ret> = {
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  bivarianceHack(this: This, ...args: Args): Ret
}['bivarianceHack']

export type Never<X> = { [K in keyof X]+?: never }

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

interface SomeMap<K, V> {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => unknown
}

export const dig = <X, Y, Z>(map: SomeMap<X, Map<Y, Z>>, key: X): Map<Y, Z> => {
  const m = map.get(key)
  if (m != null) return m
  const n = new Map<Y, Z>()
  map.set(key, n)
  return n
}
