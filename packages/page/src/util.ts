import type { Entries } from '../../vite-plugin-minissg/src/module'

export const isAbsURL = (url: string): boolean => {
  try {
    void new URL(url)
    return true
  } catch {
    return false
  }
}

export type EntriesModule = Readonly<{ entries: Entries }>

export const hasMinissgEntries = (x: object): x is EntriesModule =>
  !(Symbol.iterator in x) && 'entries' in x && typeof x.entries === 'function'

type Descriptor<X> = { configurable?: boolean; enumerable?: boolean } & (
  | { writable?: boolean; value: X; get?: never; set?: never }
  | { writable: boolean; value?: X; get?: never; set?: never }
  | { writable?: never; value?: never; get: () => X; set?: () => X }
  | { writable?: never; value?: never; get?: () => X; set: () => X }
)

export const safeDefineProperty = <Obj extends object, Key extends keyof Obj>(
  obj: Obj,
  key: Key,
  descriptor: Descriptor<Obj[Key]>
): boolean => {
  const d = Object.assign(Object.create(null), descriptor) as typeof descriptor
  return Reflect.defineProperty(obj, key, d)
}
