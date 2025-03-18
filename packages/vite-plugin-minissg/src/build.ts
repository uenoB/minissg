import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { format } from 'node:util'
import type { Environment, Plugin, Rollup } from 'vite'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Module, type Context, ModuleName } from './module'
import { type Page, run } from './run'
import { injectHtmlHead } from './html'
import type { LibModule, ServerPage, ServerResult } from './loader'
import { Root, Lib, Head, clientNodeInfo } from './loader'
import * as util from './util'

const fileURL = (...a: string[]): string => pathToFileURL(resolve(...a)).href

const setupRoot = (
  outDir: string,
  lib: PromiseLike<LibModule>,
  bundle: Readonly<Rollup.OutputBundle>,
  entryModules: ReadonlyMap<string, Rollup.ResolvedId | null>
): Context => {
  const chunkMap = new Map<string, Rollup.OutputChunk>()
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk' || chunk.facadeModuleId == null) continue
    chunkMap.set(chunk.facadeModuleId, chunk)
  }
  const module = Array.from(entryModules, ([k, r]): [string, Module] => {
    if (r == null || r.external !== false) return [k, { default: null }]
    const chunk = chunkMap.get(r.id)
    if (chunk == null) return [k, { default: null }]
    const fileName = fileURL(outDir, chunk.fileName)
    const module = util.lazy((): PromiseLike<Module> => import(fileName))
    const main = (): PromiseLike<Module> =>
      lib.then(m => m.add(r.id)).then(() => module)
    return [k, { main }]
  })
  return Object.freeze({ moduleName: ModuleName.root, module })
}

const emitPages = async (
  staticImports: ReadonlyMap<string, Iterable<string>>,
  files: ReadonlyMap<string, Page>
): Promise<Iterable<readonly [string, ServerPage]>> =>
  await Promise.all(
    Array.from(files, async ([outputName, page]) => {
      const { loaded, body } = await page
      const head = new Set<string>()
      for (const id of loaded) util.addSet(head, staticImports.get(id))
      return [outputName, { head: Array.from(head), body }] as const
    })
  )

const emitFiles = async (
  this_: Rollup.PluginContext,
  site: Site,
  bundle: Rollup.OutputBundle,
  pages: ReadonlyMap<string, Pick<ServerPage, 'body'>>
): Promise<null> =>
  await util.mapReduce({
    sources: pages,
    destination: null,
    map: async ([outputName, { body }]) => {
      const assetName = '\0' + Head(outputName, 'html')
      const head = bundle[assetName]
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete bundle[assetName]
      if (body == null) return
      site.debug.build?.('emit file %o', outputName)
      let source = await body
      if (outputName.endsWith('.html') && head?.type === 'asset') {
        source = injectHtmlHead(source, head.source)
      }
      this_.emitFile({ type: 'asset', fileName: outputName, source })
    },
    catch: (error, [outputName]) => {
      site.env.logger.error(`error occurred in emitting ${outputName}`)
      throw error
    }
  })

const generateErasure = async (
  this_: Rollup.PluginContext,
  site: Site,
  entryModules: ReadonlyMap<string, Rollup.ResolvedId | null>
): Promise<Map<string, string[]>> => {
  const assetGenerators = await util.traverseGraph({
    nodes: Array.from(entryModules.values(), i => i?.id).filter(util.isNotNull),
    nodeInfo: id => {
      if (site.isAsset(id)) return { values: [id] }
      const info = this_.getModuleInfo(id)
      if (info == null) return {}
      return { next: [...info.importedIds, ...info.dynamicallyImportedIds] }
    }
  })
  const isAssetGenerator = (id: string): boolean => {
    const assets = assetGenerators.get(id)
    return assets != null && assets.size > 0 && !assets.has(id)
  }
  const inputs: string[] = []
  const erasure = new Map<string, string[]>([['\0' + Root, inputs]])
  for (const [id, assets] of assetGenerators) {
    const info = this_.getModuleInfo(id)
    if (info?.isEntry === true && assets.size > 0) inputs.push(id)
    if (info == null || assets.has(id) || assets.size === 0) continue
    const imports = [...info.importedIds, ...info.dynamicallyImportedIds]
    erasure.set(id, imports.filter(isAssetGenerator))
    site.debug.build?.('will load %o again for %d assets', id, assets.size)
  }
  return erasure
}

interface BuildPluginState {
  readonly site: Site
  readonly entry: {
    readonly modules: ReadonlyMap<string, Rollup.ResolvedId | null>
    count: number
  }
  ssr?: {
    readonly libEmitId: string
    staticImports: ReadonlyMap<string, ReadonlySet<string>>
    onClose?: (() => Promise<void>) | undefined
  }
}

export const buildPlugin = (
  pluginOptions: ResolvedOptions,
  server: ServerResult
): Plugin => {
  const stateMap = new WeakMap<Environment, BuildPluginState>()

  return {
    name: 'minissg:build',
    enforce: 'post',
    apply: 'build',
    applyToEnvironment: env => env.name === 'ssr' || env.name === 'client',
    sharedDuringBuild: true,

    config(config) {
      config.builder ??= {} // enable build for all environments
      config.environments ??= {}
      config.environments['ssr'] ??= {} // build ssr at first
      config.environments['ssr'].build ??= {}
      config.environments['ssr'].build.target ??= 'esnext'
      config.environments['ssr'].build.copyPublicDir ??= false
      config.environments['client'] ??= {} // client starts after ssr
      config.environments['client'].build ??= {}
      config.environments['client'].build.emptyOutDir ??= pluginOptions.clean
      config.environments['client'].build.rollupOptions ??= {}
      config.environments['client'].build.rollupOptions.input = Root
    },

    async buildStart() {
      const site = new Site(this.environment)
      let entryCount = 0
      const entryModules = await util.mapReduce({
        sources: site.rollupInput(),
        destination: new Map<string, Rollup.ResolvedId | null>(),
        map: async ([name, id]) => {
          this.emitFile({ type: 'chunk', id, preserveSignature: 'strict' })
          const r = await this.resolve(id, undefined, { isEntry: true })
          if (r?.external === false) entryCount++
          return [name, r] as const
        },
        reduce: (i, z) => z.set(...i)
      })
      const entry = { modules: entryModules, count: entryCount }
      stateMap.set(this.environment, { site, entry })
    },

    async moduleParsed({ isEntry }) {
      if (!isEntry) return
      const state = stateMap.get(this.environment)
      if (state == null || --state.entry.count !== 0) return
      const { site, entry } = state
      // load all server-side codes before loading any client-side code
      const staticImports = await util.traverseGraph({
        nodes: Array.from(entry.modules, i => i[1]?.id).filter(util.isNotNull),
        nodeInfo: async id => {
          if (this.getModuleInfo(id)?.isExternal === true) return {}
          const info = await this.load({ id, resolveDependencies: true })
          if (info.isExternal) return {}
          const next = info.importedIds
          const entries = info.dynamicallyImportedIds
          return clientNodeInfo({ next, entries }, id, site)
        }
      })
      site.debug.build?.('loaded %d server-side modules', staticImports.size)
      if (this.environment.name === 'ssr') {
        const libEmitId = this.emitFile({ type: 'chunk', id: Lib })
        state.ssr = { libEmitId, staticImports }
      } else {
        if (server.result == null) this.error('ssr result not available')
        for (const outputName of server.result.pages.keys()) {
          const id = Head(outputName, 'html')
          // NOTE: this makes entryCount negative
          this.emitFile({ type: 'chunk', id, preserveSignature: false })
        }
      }
    },

    async generateBundle(outputOptions, bundle) {
      const state = stateMap.get(this.environment)
      if (state == null) return
      const { site, entry, ssr } = state
      if (ssr == null) {
        if (server.result == null) this.error('ssr result not available')
        await emitFiles(this, site, bundle, server.result.pages)
      } else {
        const dir = outputOptions.dir ?? site.env.config.build.outDir
        const outDir = resolve(site.env.config.root, dir)
        const libFileName = fileURL(outDir, this.getFileName(ssr.libEmitId))
        const lib = util.lazy((): PromiseLike<LibModule> => import(libFileName))
        const root = setupRoot(outDir, lib, bundle, entry.modules)
        const erasure = await generateErasure(this, site, entry.modules)
        ssr.onClose = async function (this: void) {
          ssr.onClose = undefined // for early memory release
          try {
            const files = await run(root, await lib, site)
            const pages = new Map(await emitPages(ssr.staticImports, files))
            server.result = { pages, data: (await lib).data, erasure }
          } catch (e) {
            if (e instanceof Error) throw util.touch(e)
            const msg = format('uncaught thrown value: %o', e)
            throw util.touch(Error(msg, { cause: e }))
          }
        }
      }
    },

    closeBundle: {
      order: 'post', // defer invoking onClose as much as possible
      sequential: true,
      async handler() {
        const { ssr } = stateMap.get(this.environment) ?? {}
        if (ssr?.onClose == null) return
        if (this.environment.logger.hasWarned) {
          this.error('[minissg] found some errors or warnings')
        }
        await ssr.onClose()
      }
    }
  }
}
