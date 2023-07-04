import type { IncomingMessage } from 'node:http'
import type { Plugin, ViteDevServer, ModuleGraph } from 'vite'
import { lookup } from 'mrmime'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Tree, type Module, ModuleName, run } from './module'
import { scriptsHtml, injectHtmlHead } from './html'
import { isNotNull, traverseGraph, addSet, touch } from './utils'
import { type LibModule, clientInfo, Virtual } from './loader'

interface Req {
  server: ViteDevServer
  site: Site
  root: Tree
  req: IncomingMessage
  url: string
}

interface Res {
  type: string
  body: string | Uint8Array
}

const loadToplevelModule = (server: ViteDevServer, site: Site): Tree => {
  const lib = server.ssrLoadModule(Virtual.Lib) as Promise<LibModule>
  const module = new Map(
    Array.from(site.entries(), ([key, id]) => {
      const get = async (): Promise<Module> => {
        const plugin = server.pluginContainer
        const r = await plugin.resolveId(id, undefined, { ssr: true })
        if (r == null) return { default: null }
        const url = Virtual.Exact(r.id)
        const module = await server.ssrLoadModule(url)
        const node = await server.moduleGraph.getModuleByUrl(url)
        if (node?.id != null) (await lib).add(node.id)
        return module
      }
      return [key, { get }]
    })
  )
  return { lib: async () => await lib, module, moduleName: ModuleName.root }
}

const getHtmlHead = async (
  graph: ModuleGraph,
  site: Site,
  chunkIds: Iterable<string>
): Promise<string> => {
  const getUrl = (i: string): string | undefined => graph.getModuleById(i)?.url
  const urls = Array.from(chunkIds, getUrl).filter(isNotNull)
  const chunks = await traverseGraph({
    nodes: urls,
    nodeInfo: async url => {
      url = url.replace(/^\/@id\/(__x00__)?/, (_, i) => (i == null ? '' : '\0'))
      const node = await graph.getModuleByUrl(url)
      const tr = node?.ssrTransformResult
      const info = { next: tr?.deps, entries: tr?.dynamicDeps }
      return clientInfo(info, node?.id, site)
    }
  })
  const src = new Set<string>()
  for (const i of urls) addSet(src, chunks.get(i))
  return scriptsHtml(Array.from(src, i => '/' + i))
}

const getPage = async (req: Req): Promise<Res | undefined> => {
  // url must be a normalized absolute path
  const url = req.url.replace(/\?[^#]*$/, '')
  if (/^(?:[^/]|$)|\/\/|[?#]|\/\.\.?(?:\/|$)/.test(url)) return
  const requestName = req.root.moduleName.join(url.slice(1))
  const requestFileName = requestName.fileName()
  const request = { name: requestName, incoming: req.req }
  const tree = { ...req.root, request }
  const pages = await run(req.site, tree)
  const page = pages.get(requestFileName)
  if (page == null) return
  let body = await page.content()
  if (body == null) return
  if (requestFileName.endsWith('.html')) {
    let head = await getHtmlHead(req.server.moduleGraph, req.site, page.head)
    head = await req.server.transformIndexHtml('/' + requestFileName, head)
    body = injectHtmlHead(body, head)
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return { type: lookup(requestFileName) ?? 'application/octet-stream', body }
}

export const serverPlugin = (options: ResolvedOptions): Plugin => ({
  name: 'minissg:server',
  config: () => ({ appType: 'mpa', optimizeDeps: { entries: [] } }),
  configureServer: server => () => {
    const site = new Site(server.config, options)
    const root = loadToplevelModule(server, site)
    server.middlewares.use(function minissg(req, res, next) {
      const write = (content: Res): void => {
        res.writeHead(200, { 'content-type': content.type })
        res.write(content.body)
        res.end()
      }
      const done = (content: Res | undefined): void => {
        content != null ? write(content) : next()
      }
      const error = (e: unknown): void => {
        if (e instanceof Error) server.ssrFixStacktrace(touch(e))
        next(e)
      }
      req.method == null || req.url == null
        ? next()
        : getPage({ server, site, root, url: req.url, req }).then(done, error)
    })
  }
})
