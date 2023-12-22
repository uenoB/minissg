import { format } from 'node:util'
import type { IncomingMessage } from 'node:http'
import type { Site } from './site'
import { type Awaitable, type Null, lazy, mapReduce, isNotNull } from './util'
import type { LibModule } from './loader'
import type { ModuleName } from './module-name'
export { ModuleName } from './module-name'

const typeCheck = (x: unknown, name: () => string, expect: string): void => {
  const ty = x === null ? 'null' : typeof x
  if (ty !== expect) throw Error(`${name()} is not ${expect} but ${ty}`)
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
}

const pathOf = (c: Context): string => {
  const toSelector = (i: string | undefined): string =>
    i == null ? '.entries()' : format('[%o]', i)
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

export type Body = PromiseLike<string | Uint8Array> | Null
export type Page = PromiseLike<{ loaded: Iterable<string>; body: Body }>

export const run = async (
  root: Context,
  { run }: Pick<LibModule, 'run'> = { run: (_, f) => f() },
  site?: Site
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
        site?.debug.module?.('await %s.entries()', pathOf(con))
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
        site?.debug.module?.('await %s[%o]', pathOf(con), path)
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
      const fileName = con.moduleName.fileName()
      const page: Page = lazy(async () => {
        try {
          site?.debug.module?.('await %s.default', pathOf(con))
          const t = await run(loaded, async () => await module.default)
          site?.debug.module?.('imported modules for %o: %O', fileName, loaded)
          return { loaded, body: t == null ? t : lazy(() => loadContent(t)) }
        } catch (e) {
          site?.config.logger.error(`error occurred in generating ${fileName}`)
          if (site == null || e instanceof Error) throw e
          throw Error(format('uncaught non-error throw: %o', e), { cause: e })
        }
      })
      if (z.has(fileName)) {
        site?.config.logger.warn(`duplicate file ${fileName} by ${pathOf(con)}`)
      } else {
        z.set(fileName, page)
      }
    },
    catch: (e, { context: con }) => {
      site?.config.logger.error(`error occurred in visiting ${pathOf(con)}`)
      if (site == null || e instanceof Error) throw e
      throw Error(format('uncaught non-error throw: %o', e), { cause: e })
    }
  })
