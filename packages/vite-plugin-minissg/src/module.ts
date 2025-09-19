import type { IncomingMessage } from 'node:http'
import type { Awaitable, Null } from './util'

const SCHEME = String.raw`^[a-zA-Z][a-zA-Z0-9+.-]*:`
const DOT2_SEGMENT = String.raw`(?:\/|^)\.\.(?:\/|$)`
const NOT_RELPATH = RegExp(String.raw`${SCHEME}|^\/|\/\/|[?#]|${DOT2_SEGMENT}`)

export class ModuleName {
  readonly path: string

  private constructor(path: string) {
    this.path = path
  }

  static readonly root = Object.freeze(new ModuleName(''))

  fileName(): string {
    return this.path.replace(/(\/|^)$/, '$1index.html')
  }

  join(path: string): ModuleName {
    if (NOT_RELPATH.test(path)) throw Error(`invalid as module name: ${path}`)
    const slash = path === '' || /(?:\/|^)$/.test(this.path) ? '' : '/'
    path = this.path + slash + path.replace(/(^|\/)(?:\.(?:\/|$))+/g, '$1')
    return new ModuleName(path.replace(/(\/|^)\/*index\.html$/, '$1'))
  }

  isIn(other: ModuleName): boolean {
    if (!this.path.startsWith(other.path)) return false
    if (this.path.length === other.path.length) return true
    return /(?:\/|^)$/.test(other.path) || this.path[other.path.length] === '/'
  }
}

export type Content = BlobPart | Null

interface Request {
  requestName: ModuleName
  incoming?: Readonly<IncomingMessage> | undefined
}

export interface Context {
  request?: Readonly<Request> | undefined // `undefined` means get all
  moduleName: ModuleName
  module: Module
  path?: string | undefined
  parent?: Readonly<Context> | undefined
  loaded?: Set<string> | undefined
}

export type Main = (context: Readonly<Context>) => Awaitable<Module>

export type Module =
  | Iterable<readonly [string, Awaitable<Module>]>
  | { main: Main }
  | { main?: never; default: Awaitable<Content> }
  | { main?: never; default?: never; [k: string]: Awaitable<Module> }
