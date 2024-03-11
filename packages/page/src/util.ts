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
): Obj => {
  const d = Object.assign(Object.create(null), descriptor) as typeof descriptor
  Reflect.defineProperty(obj, key, d)
  return obj
}

export const constProp = <Obj extends object, Key extends keyof Obj>(
  obj: Obj,
  key: Key,
  value: Obj[Key]
): Obj =>
  defineProperty(obj, key, { configurable: true, writable: true, value })

export const objectAssign = <X extends object, Y extends object>(
  obj: X,
  src: Y
): X & Y => {
  const dst: X & Y = obj as X & Y
  for (const k in src) defineProperty(dst, k, { value: src[k] })
  return dst
}
