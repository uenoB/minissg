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

const pathOf = (c: Context): string => {
  const toSelector = (i: string | undefined): string =>
    i == null ? '.main()' : format('[%o]', i)
  const selectors: string[] = []
  for (; c.parent != null; c = c.parent) selectors.push(toSelector(c.path))
  return 'root' + selectors.reverse().join('')
}

export type Main = (context: Readonly<Context>) => Awaitable<Module>

export type Module =
  | Iterable<readonly [string, Awaitable<Module>]>
  | { main: Main }
  | { main?: never; default: Awaitable<Content> }
  | { main?: never; default?: never; [k: string]: Awaitable<Module> }

export type Body = PromiseLike<string | Uint8Array> | Null
export type Page = PromiseLike<{ loaded: Iterable<string>; body: Body }>

export const run = async (
  root: Context,
  { run }: Pick<LibModule, 'run'> = { run: (_, f) => f() },
  site?: Site
): Promise<Map<string, Page>> =>
  await mapReduce({
    sources: [{ ...root, loaded: new Set<string>() }],
    destination: new Map<string, Page>(),
    fork: async ctx => {
      typeCheck(ctx.module, () => pathOf(ctx), 'object')
      let routes
      if (Symbol.iterator in ctx.module) {
        routes = ctx.module
      } else if (typeof ctx.module.main === 'function') {
        const mod = ctx.module
        site?.debug.module?.('await %s.main()', pathOf(ctx))
        const module = await run(ctx, () => mod.main(ctx))
        return [{ ...ctx, module, path: undefined, parent: ctx }]
      } else if ('default' in ctx.module) {
        return null
      } else {
        routes = Object.entries(ctx.module)
      }
      const children = Array.from(routes, async ([path, mod], i) => {
        typeCheck(path, () => `${pathOf(ctx)}[${i}][0]`, 'string')
        const moduleName = Object.freeze(ctx.moduleName.join(path))
        if (ctx.request?.requestName.isIn(moduleName) === false) return null
        site?.debug.module?.('await %s[%o]', pathOf(ctx), path)
        const forked = { ...ctx, loaded: new Set(ctx.loaded) }
        const module = await run(forked, async () => await mod)
        return { ...forked, moduleName, module, path, parent: forked }
      })
      return (await Promise.all(children)).filter(isNotNull)
    },
    map: x => x,
    reduce: (ctx, z) => {
      const module = ctx.module as Extract<Module, { default: unknown }>
      const fileName = ctx.moduleName.fileName()
      const page: Page = lazy(async () => {
        try {
          site?.debug.module?.('await %s.default', pathOf(ctx))
          const t = await run(ctx, async () => await module.default)
          const loaded = ctx.loaded
          site?.debug.module?.('imported modules for %o: %O', fileName, loaded)
          return { loaded, body: t == null ? t : lazy(() => loadContent(t)) }
        } catch (e) {
          site?.config.logger.error(`error occurred in generating ${fileName}`)
          if (site == null || e instanceof Error) throw e
          throw Error(format('uncaught non-error throw: %o', e), { cause: e })
        }
      })
      if (z.has(fileName)) {
        site?.config.logger.warn(`duplicate file ${fileName} by ${pathOf(ctx)}`)
      } else {
        z.set(fileName, page)
      }
    },
    catch: (e, ctx) => {
      site?.config.logger.error(`error occurred in visiting ${pathOf(ctx)}`)
      if (site == null || e instanceof Error) throw e
      throw Error(format('uncaught non-error throw: %o', e), { cause: e })
    }
  })
