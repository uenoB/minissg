import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { format } from 'node:util'
import type { Environment, Plugin, Rollup } from 'vite'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Module, ModuleName } from './module'
import { type Page, run } from './run'
import { injectHtmlHead } from './html'
import type { LibModule, ServerPage, ServerResult } from './loader'
import { Root, Root0, Lib, Head, clientNodeInfo } from './loader'
import { addSet, mapReduce, traverseGraph } from './util'

const fileURL = (...a: string[]): string => pathToFileURL(resolve(...a)).href

const emitPages = async (
  staticImports: ReadonlyMap<string, Iterable<string>>,
  files: ReadonlyMap<string, Page>
): Promise<Iterable<readonly [string, ServerPage]>> =>
  await Promise.all(
    Array.from(files, async ([outputName, page]) => {
      const { loaded, body } = await page
      const head = new Set<string>()
      for (const id of loaded) addSet(head, staticImports.get(id))
      return [outputName, { head: Array.from(head), body }] as const
    })
  )

const emitFiles = async (
  this_: Rollup.PluginContext,
  site: Site,
  bundle: Rollup.OutputBundle,
  pages: ReadonlyMap<string, Pick<ServerPage, 'body'>>
): Promise<null> =>
  await mapReduce({
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
  site: Site
): Promise<Map<string, string[]>> => {
  const assetGenerators = await traverseGraph({
    nodes: [Root0],
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
  const erasure = new Map<string, string[]>([[Root0, inputs]])
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
  readonly ssr?: {
    readonly rootEmitId: string
    readonly libEmitId: string
    readonly staticImports: ReadonlyMap<string, ReadonlySet<string>>
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
      const env = { build: { rollupOptions: { input: [Root] } } }
      return { environments: { ssr: env, client: env } }
    },

    async moduleParsed({ id }) {
      if (id !== Root0) return
      const site = new Site(this.environment)
      // load all server-side codes before loading any client-side code
      const staticImports = await traverseGraph({
        nodes: [id],
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
      const emitChunk = (id: string): string =>
        this.emitFile({ type: 'chunk', id, preserveSignature: 'strict' })
      const rootEmitId = emitChunk(Root) // to avoid empty chunk warning
      if (!site.isClient()) {
        const libEmitId = emitChunk(Lib)
        const ssr = { rootEmitId, libEmitId, staticImports }
        stateMap.set(this.environment, { site, ssr })
      } else {
        if (server.result == null) this.error('ssr result not available')
        for (const outputName of server.result.pages.keys()) {
          emitChunk(Head(outputName, 'html'))
        }
        stateMap.set(this.environment, { site })
      }
    },

    async generateBundle(outputOptions, bundle) {
      const { site, ssr } = stateMap.get(this.environment) ?? {}
      if (site == null) return
      if (ssr == null) {
        if (server.result == null) this.error('ssr result not available')
        await emitFiles(this, site, bundle, server.result.pages)
      } else {
        const dir = outputOptions.dir ?? site.env.config.build.outDir
        const outDir = resolve(site.env.config.root, dir)
        const rootFileName = fileURL(outDir, this.getFileName(ssr.rootEmitId))
        const libFileName = fileURL(outDir, this.getFileName(ssr.libEmitId))
        const erasure = await generateErasure(this, site)
        ssr.onClose = async function (this: void) {
          ssr.onClose = undefined // for early memory release
          try {
            const { root } = (await import(rootFileName)) as { root: Module }
            const lib = (await import(libFileName)) as LibModule
            const context = { moduleName: ModuleName.root, module: root }
            const files = await run(Object.freeze(context), lib, site)
            const pages = new Map(await emitPages(ssr.staticImports, files))
            server.result = { pages, data: lib.data, erasure }
          } catch (e) {
            if (e instanceof Error) throw e
            const msg = format('uncaught thrown value: %o', e)
            throw Error(msg, { cause: e })
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
