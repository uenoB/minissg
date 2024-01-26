export const isAbsURL = (url: string): boolean => {
  try {
    void new URL(url)
    return true
  } catch {
    return false
  }
}

export const createObject = <X extends object>(x: X): X => Object.create(x) as X

type Descriptor<X> = { configurable?: boolean; enumerable?: boolean } & (
  | { writable?: boolean; value?: X; get?: never; set?: never }
  | { writable?: never; value?: never; get: () => X; set?: () => X }
  | { writable?: never; value?: never; get?: () => X; set: () => X }
)

export const defineProperty = <Obj extends object, Key extends keyof Obj>(
  obj: Obj,
  key: Key,
  descriptor: Descriptor<Obj[Key]>
): boolean => {
  const d = Object.assign(Object.create(null), descriptor) as typeof descriptor
  return Reflect.defineProperty(obj, key, d)
}

export const constProp = <Obj extends object, Key extends keyof Obj>(
  obj: Obj,
  key: Key,
  value: Obj[Key]
): boolean =>
  defineProperty(obj, key, { configurable: true, writable: true, value })
