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

export const isAbsURL = (url: string): boolean => {
  try {
    void new URL(url)
    return true
  } catch {
    return false
  }
}

export type Descriptor<X> = { configurable?: boolean; enumerable?: boolean } & (
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
): boolean => {
  const d = Object.assign(Object.create(null), descriptor) as typeof descriptor
  return Reflect.defineProperty(obj, key, d)
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
