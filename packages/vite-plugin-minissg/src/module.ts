import { format } from 'node:util'
import type { IncomingMessage } from 'node:http'
import type { Site } from './site'
import { type Awaitable, type Null, mapReduce, isNotNull } from './utils'
import type { LibModule } from './loader'

const typeCheck = (x: unknown, name: string, expect: string): void => {
  const ty = x === null ? 'null' : typeof x
  if (ty !== expect) throw Error(`${name} is not ${expect} but ${ty}`)
}

const iterable = <X>(items: Iterable<X>): Iterable<X> => ({
  [Symbol.iterator]: () => items[Symbol.iterator]()
})

const isIterable = <X extends object>(
  x: X
): x is Extract<X, Iterable<unknown>> =>
  Symbol.iterator in x && typeof x[Symbol.iterator] === 'function'

const SCHEME = String.raw`^[a-zA-Z][a-zA-Z0-9+.-]*:`
const DOT2_SEGMENT = String.raw`(?:\/|^)\.\.(?:\/|$)`
const NOT_RELPATH = RegExp(String.raw`${SCHEME}|^\/|\/\/|[?#]|${DOT2_SEGMENT}`)

export class ModuleName {
  readonly path: string

  private constructor(path: string) {
    this.path = path
  }

  static readonly root = new ModuleName('')

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

export type Content = string | ArrayBufferLike | ArrayBufferView | Blob | Null

export const loadContent = async (
  src: Content
): Promise<string | Uint8Array | Null> =>
  src == null || typeof src === 'string' || src instanceof Uint8Array
    ? src
    : new Uint8Array(await new Blob([src]).arrayBuffer())

interface Request {
  requestName: ModuleName
  incoming: IncomingMessage
}

export interface EntriesArg {
  moduleName: ModuleName
  ancestors: Iterable<Module>
  request: Request | undefined
}
export type Entries = (arg: EntriesArg) => Awaitable<Module>

export type Module =
  | Iterable<[string, Awaitable<Module>]>
  | { entries: Entries }
  | { entries?: never; default: Awaitable<Content> }
  | { entries?: never; default?: never; [k: string]: Awaitable<Module> }

export type Tree = Readonly<{
  moduleName: ModuleName
  request?: Readonly<Request> // `undefined` means get all
  module: Awaitable<Module>
  lib: () => Awaitable<LibModule>
}>

export type PageBody = () => Promise<string | Uint8Array | Null>
export type Page = () => Promise<{ loaded: Iterable<string>; body: PageBody }>

export interface Run extends Tree {
  loaded: Set<string>
  ancestors: Module[]
  path: string
}

export const run = async (site: Site, root: Tree): Promise<Map<string, Page>> =>
  await mapReduce<Run, Run, Map<string, Page>>({
    sources: [{ ...root, loaded: new Set(), ancestors: [], path: 'root' }],
    destination: new Map<string, Page>(),
    fork: async ({ module, ...tree }: Run) => {
      const { run } = await tree.lib()
      const mod = await run(tree.loaded, async () => await module)
      typeCheck(mod, tree.path, 'object')
      const ancestors = [mod, ...tree.ancestors]
      let routes
      if (isIterable(mod)) {
        routes = mod
      } else if (typeof mod.entries === 'function') {
        const request = tree.request
        const moduleName = tree.moduleName
        const arg = { request, moduleName, ancestors: iterable(tree.ancestors) }
        const module = await run(tree.loaded, () => mod.entries(arg))
        return [{ ...tree, module, ancestors, path: `${tree.path}.entries()` }]
      } else if ('default' in mod) {
        return null
      } else {
        routes = Object.entries(mod)
      }
      const children = Array.from(routes, ([key, module], i): Run | null => {
        typeCheck(key, `${tree.path}[${i}][0]`, 'string')
        const moduleName = tree.moduleName.join(key)
        if (tree.request?.requestName.isIn(moduleName) === false) return null
        const loaded = new Set(tree.loaded)
        const path = `${tree.path}["${key}"]`
        return { ...tree, module, loaded, ancestors, moduleName, path }
      })
      const subtrees = children.filter(isNotNull)
      return subtrees.length > 0 || children.length > 0 ? subtrees : null
    },
    map: x => x,
    reduce: async ({ moduleName, module, loaded, lib, path }: Run, z) => {
      const { run } = await lib()
      const mod = await module // module must be already fulfilled
      const src = 'default' in mod ? mod.default : null
      const page: Page = async () => {
        const body = await run(loaded, async () => await src)
        return { loaded, body: async () => await loadContent(body) }
      }
      const fileName = moduleName.fileName()
      if (z.has(fileName)) {
        site.config.logger.warn(`duplicate file ${fileName} by ${path}`)
      } else {
        z.set(fileName, page)
      }
    },
    catch: (e, { path }: Run) => {
      site.config.logger.error(`error occurred in visiting ${path}`)
      if (e instanceof Error) throw e
      throw Error(format('uncaught non-error throw: %o', e), { cause: e })
    }
  })
