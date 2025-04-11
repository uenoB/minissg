import type { Environment, Plugin, Rollup } from 'vite'
import { init, parse } from 'es-module-lexer'
import MagicString from 'magic-string'
import { script, link } from './html'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { Query } from './query'
import { type Null, type JsonObj, type NodeInfo, js, freshId } from './util'

const encode64 = (s: string): string => Buffer.from(s).toString('base64url')
const decode64 = (s: string): string => Buffer.from(s, 'base64url').toString()

const CLIENT = Query.Class('client')
const DOCTYPE = Query.Class('doctype')
const HYDRATE = Query.Class('hydrate')
const RENDER = Query.Class('render')
const RENDERER = Query.Class('renderer')
const COPY = Query.Class('MINISSG-COPY')

type Side = 'client' | 'server'
const coerceSide = (s: string | boolean): Side =>
  s === 'server' || s === true ? 'server' : 'client'

type Tuple<F, X, N extends number, T extends X[]> = T extends { length: N }
  ? [F, ...T, ...X[]]
  : Tuple<F, X, N, [X, ...T]>
type Virtual<F, N extends number> = Tuple<F, string, N, []>

const virtualName = (id: string, ext = '.js'): string =>
  id.replace(/^.*\/|[.?#].*$/gs, '') + ext
const VIRTUAL_RE = /^\0?\/?virtual:minissg\/@\/([\w,-]*)\//
const virtual = (args: string[], id: string = `${args[0]}.js`): string =>
  `virtual:minissg/@/${args.map(encode64).join(',')}${id.replace(/^\/*/, '/')}`
const getVirtual = (id: string): string[] | undefined => {
  const m = VIRTUAL_RE.exec(id)
  return m?.[1] != null ? m[1].split(',').map(decode64) : undefined
}
const isVirtual = <Name extends string, N extends number>(
  v: string[] | undefined,
  name: Name,
  args: N
): v is Virtual<Name, N> => v != null && v[0] === name && v.length > args

export const Root = virtual(['Root'], 'index.js')
export const Root0 = '\0' + Root
export const Lib = virtual(['Lib'], 'lib.js')
export const Head = (outputName: string, ext: 'html' | 'css' | 'js'): string =>
  virtual(['Head', outputName, ext], virtualName(outputName, `.${ext}`))
const Client = (side: string, id: string): string =>
  virtual(['Client', side, id], virtualName(id))
const Doctype = (id: string, arg: string): string =>
  virtual(['Doctype', id, arg], virtualName(id))
const Hydrate = (side: string, id: string, arg: string): string =>
  virtual(['Hydrate', side, id, arg], side === 'server' ? id : virtualName(id))
const Renderer = (side: string, key: number, arg: string): string =>
  virtual(['Renderer', side, String(key), arg])
const Render = (id: string, arg: string): string =>
  virtual(['Render', id, arg], virtualName(id))
export const Exact = (id: string, resolve = false, ext = '.js'): string =>
  virtual(['Exact', id, resolve ? 'resolve' : ''], virtualName(id, ext))

export const clientNodeInfo = <Node>(
  info: NodeInfo<Node, string>,
  id: string | null | undefined,
  site: Site
): NodeInfo<Node, string> => {
  if (id == null) return {}
  const v = getVirtual(id)
  if (isVirtual(v, 'Client', 2)) return { values: [Exact(v[2], true)] }
  if (isVirtual(v, 'Hydrate', 3)) return { values: [Hydrate('', v[2], v[3])] }
  // add `.css` suffix to avoid polyfill insertion by Vite
  if (site.isAsset(id)) return { values: [Exact(id, false, '.css')] }
  return info
}

const setupRoot = async (
  this_: Rollup.PluginContext,
  pluginOptions: ResolvedOptions
): Promise<string> => {
  const elems = Array.from(pluginOptions.input, async ([name, id]) => {
    const r = await this_.resolve(id, undefined, { skipSelf: false })
    if (r == null) this_.error(`Could not resolve "${id}"`)
    const i = r.external === false ? Exact(r.id) : r.id
    return js`[${name}, makeThen(() => import(${i}))]`
  })
  const ary = (await Promise.all(elems)).join(', ')
  return js`import { makeThen } from ${Lib}; ` + `export const root = [${ary}]`
}

export interface ServerPage {
  readonly head: readonly string[]
  readonly body: PromiseLike<string | Uint8Array> | Null
}

export interface ServerResult {
  result?: {
    readonly pages: ReadonlyMap<string, ServerPage>
    readonly data: ReadonlyMap<string, JsonObj>
    readonly erasure: ReadonlyMap<string, readonly string[]>
  }
}

interface LoaderPluginState {
  readonly site: Site
  readonly sideMap: Map<string, Side>
}

export const loaderPlugin = (
  pluginOptions: ResolvedOptions,
  server: ServerResult
): { pre: Plugin; post: Plugin } => {
  const stateMap = new WeakMap<Environment, LoaderPluginState>()
  const getState = (env: Environment): LoaderPluginState => {
    let state = stateMap.get(env)
    if (state != null) return state
    state = { site: new Site(env), sideMap: new Map() }
    stateMap.set(env, state)
    return state
  }

  const pre: Plugin = {
    name: 'minissg:loader',
    enforce: 'pre',
    applyToEnvironment: env => env.name === 'ssr' || env.name === 'client',
    sharedDuringBuild: true,

    resolveId: {
      order: 'pre',
      async handler(id, importer, options) {
        const { site, sideMap } = getState(this.environment)
        const from = importer == null ? undefined : sideMap.get(importer)
        const side = coerceSide(from ?? (id === Root || !site.isClient()))
        let v = getVirtual(id)
        const resolveQuery = <R extends { id: string }>(r: R): R => {
          let q
          if ((q = DOCTYPE.match(r.id)) != null) {
            return { ...r, id: Doctype(q.remove(), q.value) }
          } else if ((q = RENDERER.match(r.id)) != null) {
            const m = pluginOptions.render.match(r.id)
            const found = m?.value.render?.[side] != null
            const key = found ? m.key : -1
            return { ...r, id: Renderer(side, key, found ? q.value : r.id) }
          } else if ((q = CLIENT.match(r.id)) != null) {
            return { ...r, id: Client(side, q.remove()) }
          } else if ((q = RENDER.match(r.id)) != null) {
            return { ...r, id: Render(q.remove(), q.value) }
          } else if ((q = HYDRATE.match(r.id)) != null) {
            return { ...r, id: Hydrate(side, q.remove(), q.value) }
          }
          return r
        }
        let r: Rollup.PartialResolvedId | null = { id }
        if (isVirtual(v, 'Exact', 2)) {
          r = v[2] === 'resolve' ? resolveQuery({ id: v[1] }) : { id: v[1] }
        } else if (v == null) {
          r = await this.resolve(id, importer, { ...options, skipSelf: true })
          if (r == null || Boolean(r.external) || r.id.includes('\0')) return r
          r = resolveQuery(r)
        }
        if (!r.id.startsWith('\0') && (v = getVirtual(r.id)) != null) {
          if (v[0] === 'Head' && v[2] === 'html') {
            // html file must be identified by its absolute path in config.root
            r = { ...r, id: site.projectRoot + '\0' + r.id }
          } else if (v[0] === 'Head') {
            r = { ...r, id: '\0' + id.replace(/\.[^.]*$/, '.js') }
          } else if (!(v[0] === 'Hydrate' && v[1] === 'server')) {
            // server-side hydration code needs to be processed by other plugins
            r = { ...r, id: '\0' + r.id }
          }
        }
        const curr = site.isAsset(r.id) ? 'client' : side
        const prev = sideMap.get(r.id)
        if (prev != null && prev !== curr) r = { ...r, id: COPY.add(r.id) }
        sideMap.set(r.id, curr)
        return r
      }
    },

    load: {
      order: 'pre',
      async handler(id) {
        const { site } = getState(this.environment)
        const v = getVirtual(site.canonical(id))
        if (v != null) site.debug.loader?.('load virtual module %o', v)
        if (isVirtual(v, 'Root', 0)) {
          if (site.isClient()) return 'void 0' // replaced by transform
          return await setupRoot(this, pluginOptions)
        } else if (isVirtual(v, 'Lib', 0)) {
          return libModule
        } else if (isVirtual(v, 'Head', 2)) {
          const head = server.result?.pages.get(v[1])?.head
          if (head == null) return null
          if (v[2] === 'html') {
            return head.every(i => i.endsWith('.css'))
              ? link(Head(v[1], 'css'))
              : script(Head(v[1], 'js'))
          } else {
            return head.map(i => js`import ${i}`).join('\n')
          }
        } else if (isVirtual(v, 'Client', 2)) {
          const key = site.scriptId(v[2])
          if (v[1] === 'server') {
            return js`
              import { data } from ${Lib}
              if (!data.has(${v[2]})) data.set(${v[2]}, { id: ${key} })
              export default data.get(${v[2]})`
          } else {
            return js`
              export default ${server.result?.data.get(v[2]) ?? { id: key }}`
          }
        } else if (isVirtual(v, 'Doctype', 2) && RENDERER.test(v[1])) {
          return js`
            import render from ${Exact(v[1], true)}
            const doctype = x => new Blob(['<!DOCTYPE html>', x])
            export default async x => doctype(await render(x))`
        } else if (isVirtual(v, 'Doctype', 2)) {
          return js`
            import content from ${Exact(v[1], true)}
            import { makeThen } from ${Lib}
            export * from ${Exact(v[1], true)}
            const doctype = x => new Blob(['<!DOCTYPE html>', x])
            export default makeThen(async () => doctype(await content))`
        } else if (isVirtual(v, 'Renderer', 3)) {
          const k = coerceSide(v[1])
          const r = pluginOptions.render.get(Number(v[2]))?.render?.[k]
          if (r == null) throw Error(`${k} renderer not found for ${v[3]}`)
          return await r({ parameter: v[3] })
        } else if (isVirtual(v, 'Render', 2)) {
          return js`
            import render from ${Exact(RENDERER.add(v[1], v[2]), true)}
            import * as m from ${Exact(v[1], true)}
            import { makeThen } from ${Lib}
            export * from ${Exact(v[1], true)}
            export default makeThen(async () => await render(m.default))`
        } else if (isVirtual(v, 'Hydrate', 3)) {
          const k = coerceSide(v[1])
          const h = pluginOptions.render.match(v[2])?.value.hydrate?.[k]
          if (h == null) throw Error(`hydration not available for ${v[2]}`)
          const hid = site.scriptId(v[2])
          const args = { id: hid, moduleId: Exact(v[2], true), parameter: v[3] }
          return { code: await h(args), map: { mappings: '' } }
        }
        return null
      }
    }
  }

  const post: Plugin = {
    name: 'minissg:loader:post',
    enforce: 'post',
    applyToEnvironment: env => env.name === 'ssr' || env.name === 'client',
    sharedDuringBuild: true,

    // transform must be done after others but before vite:import-analysis.
    async transform(code, id) {
      const { site, sideMap } = getState(this.environment)
      if (sideMap.get(id) !== 'server') return
      if (site.isClient()) {
        if (server.result == null) this.error('ssr result not available')
        const imports = server.result.erasure.get(id)
        if (imports == null) return
        site.debug.build?.('erase server-side code %o', id)
        const code = imports.map(i => js`import ${Exact(i)}`)
        code.push('export const __MINISSG_ERASED__ = true')
        return { code: code.join('\n'), map: { mappings: '' } }
      } else {
        await init
        const addId = freshId(code)
        const ms = new MagicString(code)
        for (const { d, n, ss, se } of parse(code)[0]) {
          if (d < 0 || n == null) continue
          const r = await this.resolve(n, id)
          if (r == null || Boolean(r.external)) continue
          const load = `(${addId}${js`(${r.id}),import(${Exact(r.id, true)})`})`
          ms.update(ss, se, load)
        }
        if (!ms.hasChanged()) return null
        ms.appendLeft(0, `import { add as ${addId} } from ${js`${Lib}`};\n`)
        return { code: ms.toString(), map: ms.generateMap({ hires: true }) }
      }
    },

    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const { site, sideMap } = getState(this.environment)
        if (!pluginOptions.clean || !site.isClient()) return
        for (const [chunkName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue
          if (chunk.moduleIds.some(i => sideMap.get(i) !== 'server')) continue
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete bundle[chunkName]
          const { sourcemapFileName } = chunk
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          if (sourcemapFileName != null) delete bundle[sourcemapFileName]
          site.debug.loader?.('delete server-side chunk %o', chunkName)
        }
      }
    }
  }

  return { pre, post }
}

export interface LibModule {
  readonly data: Map<string, JsonObj>
  readonly add: (id: string) => unknown
  readonly run: <R>(c: { loaded: Set<string> }, f: () => R) => R
}

const libModule = `
  import { AsyncLocalStorage } from 'node:async_hooks'
  export const data = /*#__PURE__*/ new Map()
  const currentContext = /*#__PURE__*/ new AsyncLocalStorage()
  export const add = id => currentContext.getStore()?.loaded.add(id)
  export const run = currentContext.run.bind(currentContext)
  export const makeThen = get => {
    const desc = Object.create(null)
    desc.value = (...a) => get().then(...a)
    const obj = Object.create(null)
    Reflect.defineProperty(obj, 'then', desc)
    return obj
  }`
