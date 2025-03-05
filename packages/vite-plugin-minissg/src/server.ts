import type { IncomingMessage } from 'node:http'
import type { Plugin, ViteDevServer, ModuleGraph } from 'vite'
import { lookup } from 'mrmime'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Context, type Module, ModuleName, run } from './module'
import { script, injectHtmlHead } from './html'
import { isNotNull, traverseGraph, addSet, touch } from './util'
import { type LibModule, clientNodeInfo, Lib, Exact } from './loader'

interface Req {
  server: ViteDevServer
  site: Site
  root: Context
  req: IncomingMessage
}

interface Res {
  type: string
  body: string | Uint8Array
}

const loadLib = (server: ViteDevServer): PromiseLike<LibModule> =>
  server.ssrLoadModule(Lib) as Promise<LibModule>

const setupRoot = (server: ViteDevServer, site: Site): Context => {
  const module = Array.from(site.entries(), ([key, id]) => {
    const main = async (): Promise<Module> => {
      const plugin = server.pluginContainer
      const r = await plugin.resolveId(id, undefined, { ssr: true })
      if (r == null) return { default: null }
      const url = Exact(r.id)
      const module = await server.ssrLoadModule(url)
      const node = await server.moduleGraph.getModuleByUrl(url)
      if (node?.id != null) (await loadLib(server)).add(node.id)
      return module
    }
    return [key, { main }] as const
  })
  return Object.freeze({ moduleName: ModuleName.root, module })
}

const getHtmlHead = async (
  graph: ModuleGraph,
  site: Site,
  loaded: Iterable<string>
): Promise<string> => {
  const loadedUrls = Array.from(loaded, id => graph.getModuleById(id)?.url)
  const urls = loadedUrls.filter(isNotNull)
  const staticImports = await traverseGraph({
    nodes: urls,
    nodeInfo: async url => {
      url = url.replace(/^\/@id\//, '').replace('__x00__', '\0') // unwrapId
      const node = await graph.getModuleByUrl(url)
      const tr = node?.ssrTransformResult
      const info = { next: tr?.deps, entries: tr?.dynamicDeps }
      return clientNodeInfo(info, node?.id, site)
    }
  })
  const set = new Set<string>()
  for (const url of urls) addSet(set, staticImports.get(url))
  return Array.from(set, i => script(`/@id/${i}`)).join('\n')
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
  const pages = await run(root, await loadLib(req.server), req.site)
  const page = await pages.get(requestFileName)
  if (page?.body == null) return
  let body = await page.body
  if (requestFileName.endsWith('.html')) {
    let head = await getHtmlHead(req.server.moduleGraph, req.site, page.loaded)
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
    const root = setupRoot(server, site)
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
      const context = { server, site, root, req }
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
