import { format } from 'node:util'
import type { IncomingMessage } from 'node:http'
import type { Site } from './site'
import { type Awaitable, type Null, lazy, mapReduce, isNotNull } from './util'
import type { LibModule } from './loader'

const typeCheck = (x: unknown, name: () => string, expect: string): void => {
  const ty = x === null ? 'null' : typeof x
  if (ty !== expect) throw Error(`${name()} is not ${expect} but ${ty}`)
}

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

export type Content = string | ArrayBufferLike | ArrayBufferView | Blob | Null

const loadContent = (
  src: NonNullable<Content>
): Awaitable<string | Uint8Array> => {
  if (typeof src === 'string' || src instanceof Uint8Array) return src
  return new Blob([src]).arrayBuffer().then(buf => new Uint8Array(buf))
}

interface Request {
  requestName: ModuleName
  incoming: Readonly<IncomingMessage>
}

export interface Context {
  request?: Readonly<Request> | undefined // `undefined` means get all
  moduleName: ModuleName
  module: Module
  path?: string | undefined
  parent?: Readonly<Context> | undefined
}

const pathOf = (c: Context): string => {
  const toSelector = (i: string | undefined): string =>
    i == null ? '.entries()' : `[${JSON.stringify(i)}]`
  const selectors: string[] = []
  for (; c.parent != null; c = c.parent) selectors.push(toSelector(c.path))
  return 'root' + selectors.reverse().join('')
}

export type Entries = (context: Readonly<Context>) => Awaitable<Module>

export type Module =
  | Iterable<readonly [string, Awaitable<Module>]>
  | { entries: Entries }
  | { entries?: never; default: Awaitable<Content> }
  | { entries?: never; default?: never; [k: string]: Awaitable<Module> }

export type PageBody = PromiseLike<string | Uint8Array> | Null
export type Page = PromiseLike<{ loaded: Iterable<string>; body: PageBody }>

export const run = async (
  site: Site,
  { run }: LibModule,
  root: Context
): Promise<Map<string, Page>> =>
  await mapReduce({
    sources: [{ context: root, loaded: new Set<string>() }],
    destination: new Map<string, Page>(),
    fork: async ({ context: con, loaded }) => {
      typeCheck(con.module, () => pathOf(con), 'object')
      let routes
      if (Symbol.iterator in con.module) {
        routes = con.module
      } else if (typeof con.module.entries === 'function') {
        const mod = con.module
        const module = await run(loaded, () => mod.entries(con))
        const context = { ...con, module, path: undefined, parent: con }
        return [{ context: Object.freeze(context), loaded }]
      } else if ('default' in con.module) {
        return null
      } else {
        routes = Object.entries(con.module)
      }
      const children = Array.from(routes, async ([path, mod], i) => {
        typeCheck(path, () => `${pathOf(con)}[${i}][0]`, 'string')
        const moduleName = Object.freeze(con.moduleName.join(path))
        if (con.request?.requestName.isIn(moduleName) === false) return null
        const newLoaded = new Set(loaded)
        const module = await run(newLoaded, async () => await mod)
        const context = { ...con, moduleName, module, path, parent: con }
        return { context: Object.freeze(context), loaded: newLoaded }
      })
      const subtrees = (await Promise.all(children)).filter(isNotNull)
      return subtrees.length > 0 || children.length > 0 ? subtrees : null
    },
    map: x => x,
    reduce: ({ context: con, loaded }, z) => {
      const module = con.module as Extract<Module, { default: unknown }>
      const page: Page = lazy(async () => {
        const t = await run(loaded, async () => await module.default)
        return { loaded, body: t == null ? t : lazy(() => loadContent(t)) }
      })
      const fileName = con.moduleName.fileName()
      if (z.has(fileName)) {
        site.config.logger.warn(`duplicate file ${fileName} by ${pathOf(con)}`)
      } else {
        z.set(fileName, page)
      }
    },
    catch: (e, { context: con }) => {
      site.config.logger.error(`error occurred in visiting ${pathOf(con)}`)
      if (e instanceof Error) throw e
      throw Error(format('uncaught non-error throw: %o', e), { cause: e })
    }
  })
