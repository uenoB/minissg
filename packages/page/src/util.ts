import type { Entries } from '../../vite-plugin-minissg/src/module'

export type Optional<X> = { [K in keyof X]+?: X[K] | null | undefined }

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

export type Descriptor<X> = { configurable?: boolean; enumerable?: boolean } & (
  | { writable?: boolean; value: X; get?: never; set?: never }
  | { writable: boolean; value?: X; get?: never; set?: never }
  | { writable?: never; value?: never; get: () => X; set?: never }
  | { writable?: never; value?: never; get?: never; set: () => X }
)

export const safeDefineProperty = <
  Key extends string | symbol | number,
  Val,
  Obj extends { [P in Key]?: Val },
  Desc extends Descriptor<Val>
>(
  obj: Obj,
  key: Key,
  descriptor: Desc
): boolean => {
  const d = Object.assign(Object.create(null), descriptor) as typeof descriptor
  return Reflect.defineProperty(obj, key, d)
}
