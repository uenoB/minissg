import type { Main } from 'vite-plugin-minissg'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'

export type MainModule = Readonly<{ main: Main }>
export type Loaded<Impl> = Awaitable<Impl | MainModule>

export const hasMinissgMain = (x: object): x is MainModule =>
  !(Symbol.iterator in x) && 'main' in x && typeof x.main === 'function'

export const isMinissgMainModule = (x: unknown): x is MainModule =>
  typeof x === 'object' && x != null && hasMinissgMain(x)
