import type { IncomingMessage } from 'node:http'
import type { Plugin, ViteDevServer, RunnableDevEnvironment } from 'vite'
import { isRunnableDevEnvironment } from 'vite'
import { lookup } from 'mrmime'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Context, type Module, ModuleName, run } from './module'
import { script, injectHtmlHead } from './html'
import { isNotNull, traverseGraph, addSet, touch } from './util'
import { type LibModule, clientNodeInfo, Lib, Exact } from './loader'

interface Req {
  server: ViteDevServer
  env: RunnableDevEnvironment
  site: Site
  root: Context
  req: IncomingMessage
}

interface Res {
  type: string
  body: string | Uint8Array
}

const loadLib = (env: RunnableDevEnvironment): PromiseLike<LibModule> =>
  env.runner.import(Lib)

const setupRoot = (env: RunnableDevEnvironment, site: Site): Context => {
  const module = Array.from(site.entries(), ([key, id]) => {
    const main = async (): Promise<Module> => {
      const r = await env.pluginContainer.resolveId(id)
      if (r == null) return { default: null }
      const module: Module = await env.runner.import(Exact(r.id))
      const node = env.moduleGraph.getModuleById(r.id)
      if (node?.id != null) (await loadLib(env)).add(node.id)
      return module
    }
    return [key, { main }] as const
  })
  return Object.freeze({ moduleName: ModuleName.root, module })
}

const unwrapId = (id: string): string =>
  id.startsWith('/@id/') ? id.slice(5).replace('__x00__', '\0') : id
const wrapId = (id: string): string => `/@id/${id.replace('\0', '__x00__')}`

const getHtmlHead = async (
  env: RunnableDevEnvironment,
  site: Site,
  loaded: Iterable<string>
): Promise<string> => {
  const urls = Array.from(loaded, id => env.moduleGraph.getModuleById(id)?.url)
  const loadedUrls = urls.filter(isNotNull)
  const staticImports = await traverseGraph({
    nodes: loadedUrls,
    nodeInfo: async url => {
      const node = await env.moduleGraph.getModuleByUrl(unwrapId(url))
      const tr = node?.transformResult
      const info = { next: tr?.deps, entries: tr?.dynamicDeps }
      return clientNodeInfo(info, node?.id, site)
    }
  })
  const set = new Set<string>()
  for (const url of loadedUrls) addSet(set, staticImports.get(url))
  return Array.from(set, i => script(wrapId(i))).join('\n')
}

const getPage = async (req: Req, url: string): Promise<Res | undefined> => {
  // url must be a normalized absolute path
  url = url.replace(/\?[^#]*$/, '')
  if (/^(?:[^/]|$)|\/\/|#|\/\.\.?(?:\/|$)/.test(url)) return
  req.site.debug.server?.('request %s', url)
  const requestName = Object.freeze(req.root.moduleName.join('.' + url))
  const requestFileName = requestName.fileName()
  const request = Object.freeze({ requestName, incoming: req.req })
  const root = { ...req.root, request }
  const pages = await run(root, await loadLib(req.env), req.site)
  const page = await pages.get(requestFileName)
  if (page?.body == null) return
  let body = await page.body
  if (requestFileName.endsWith('.html')) {
    let head = await getHtmlHead(req.env, req.site, page.loaded)
    head = await req.server.transformIndexHtml('/' + requestFileName, head)
    body = injectHtmlHead(body, head)
  }
  return { type: lookup(requestFileName) ?? 'application/octet-stream', body }
}

export const serverPlugin = (options: ResolvedOptions): Plugin => ({
  name: 'minissg:server',
  config: () => ({ appType: 'mpa', optimizeDeps: { entries: [] } }),
  configureServer: server => () => {
    const site = new Site(server.config, options)
    const env = server.environments.ssr
    if (!isRunnableDevEnvironment(env)) throw Error('ssr is not runnable')
    const root = setupRoot(env, site)
    server.middlewares.use(function minissgMiddleware(req, res, next) {
      const write = (content: Res & { code?: number }): void => {
        res.writeHead(content.code ?? 404, { 'content-type': content.type })
        res.write(content.body)
        res.end()
        site.debug.server?.('response %d %s', content.code ?? 404, content.type)
      }
      const error = (e: unknown): void => {
        if (e instanceof Error) server.ssrFixStacktrace(touch(e))
        next(e)
      }
      const context = { server, env, site, root, req }
      if (req.method == null || req.url == null) {
        next()
      } else {
        void getPage(context, req.url)
          .then(c => (c != null ? { ...c, code: 200 } : c))
          .then(async c => c ?? (await getPage(context, '/404.html')))
          .then(c => c ?? { type: 'text/plain', body: 'Not Found' })
          .then(write, error)
      }
    })
  },
  hotUpdate({ modules, server }) {
    const isInClient = (id: string): boolean =>
      server.environments.client.moduleGraph.getModuleById(id) != null
    if (this.environment.name !== 'ssr') return
    if (modules.every(mod => mod.id != null && isInClient(mod.id))) return
    server.ws.send({ type: 'full-reload' })
  }
})
