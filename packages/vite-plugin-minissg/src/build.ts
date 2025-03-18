import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { format } from 'node:util'
import type { Plugin, Rollup, UserConfig, InlineConfig } from 'vite'
import { build } from 'vite'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { type Module, type Context, ModuleName } from './module'
import { type Page, type Body, run } from './run'
import { injectHtmlHead } from './html'
import type { LibModule } from './loader'
import { Lib, Exact, Head, loaderPlugin, clientNodeInfo } from './loader'
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
): Promise<Iterable<readonly [string, { head: string[]; body: Body }]>> =>
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
  pages: ReadonlyMap<string, { body: Body }>
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
      site.config.logger.error(`error occurred in emitting ${outputName}`)
      throw error
    }
  })

const generateInput = async (
  this_: Rollup.PluginContext,
  site: Site,
  entryModules: ReadonlyMap<string, Rollup.ResolvedId | null>
): Promise<{ entries: string[]; erasure: Map<string, string[]> }> => {
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
  const entries: string[] = []
  const erasure = new Map<string, string[]>([['\0' + Lib, []]]) // Lib as dummy
  for (const [id, assets] of assetGenerators) {
    const info = this_.getModuleInfo(id)
    if (info?.isEntry === true && assets.size > 0) entries.push(Exact(id))
    if (info == null || assets.has(id) || assets.size === 0) continue
    const imports = [...info.importedIds, ...info.dynamicallyImportedIds]
    erasure.set(id, imports.filter(isAssetGenerator))
    site.debug.build?.('will load %o again for %d assets', id, assets.size)
  }
  if (entries.length === 0) entries.push(Lib) // avoid empty input with dummy
  return { entries, erasure }
}

export const buildPlugin = (
  options: ResolvedOptions,
  bodys?: ReadonlyMap<string, { readonly body: Body }>
): Plugin => {
  let baseConfig: UserConfig
  let site: Site
  let onClose: (() => Promise<void>) | undefined
  let staticImports = new Map<string, Set<string>>()
  let entryModules = new Map<string, Rollup.ResolvedId | null>()
  let entryCount = 0
  let libEmitId: string | undefined

  return {
    name: 'minissg:build',
    enforce: 'post',
    apply: 'build',

    config: {
      order: 'pre',
      handler(config) {
        baseConfig = config
        const build = config.build
        return {
          build: {
            // the first pass is for SSR
            ...(bodys == null ? { ssr: true } : null),
            // server-side code runs on the server side
            ...(bodys == null ? { target: build?.target ?? 'esnext' } : null),
            // copyPublicDir will be done in the second pass
            ...(bodys == null ? { copyPublicDir: false } : null),
            // SSR chunks are never gzipped
            ...(bodys == null ? { reportCompressedSize: false } : null)
          }
        }
      }
    },

    configResolved(config) {
      site = new Site(config, options)
    },

    async buildStart() {
      entryCount = 0
      entryModules = await util.mapReduce({
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
    },

    async moduleParsed({ isEntry }) {
      if (!isEntry || --entryCount !== 0) return
      // load all server-side codes before loading any client-side code
      staticImports = await util.traverseGraph({
        nodes: Array.from(entryModules, i => i[1]?.id).filter(util.isNotNull),
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
      if (bodys == null) {
        libEmitId = this.emitFile({ type: 'chunk', id: Lib })
      } else {
        for (const outputName of bodys.keys()) {
          const id = Head(outputName, 'html')
          // NOTE: this makes entryCount negative
          this.emitFile({ type: 'chunk', id, preserveSignature: false })
        }
      }
    },

    async generateBundle(outputOptions, bundle) {
      if (bodys != null) {
        await emitFiles(this, site, bundle, bodys)
        return
      }
      const dir = outputOptions.dir ?? site.config.build.outDir
      const outDir = resolve(site.config.root, dir)
      if (libEmitId == null) throw Error('Lib module not found')
      const libFileName = fileURL(outDir, this.getFileName(libEmitId))
      const lib = util.lazy((): PromiseLike<LibModule> => import(libFileName))
      const root = setupRoot(outDir, lib, bundle, entryModules)
      const input = await generateInput(this, site, entryModules)
      onClose = async function (this: void) {
        onClose = undefined // for early memory release
        try {
          const files = await run(root, await lib, site)
          const pages = new Map(await emitPages(staticImports, files))
          await build(configure(site, baseConfig, await lib, pages, input))
        } catch (e) {
          if (e instanceof Error) throw util.touch(e)
          const msg = format('uncaught thrown value: %o', e)
          throw util.touch(Error(msg, { cause: e }))
        }
      }
    },

    closeBundle: {
      order: 'post', // defer vite.build as much as possible
      sequential: true,
      async handler() {
        const debug = site.debug.build
        debug?.('%s-side run complete', bodys == null ? 'server' : 'client')
        if (onClose == null) return
        if (site.config.logger.hasWarned) {
          this.error('[minissg] found some errors or warnings')
        }
        await onClose()
      }
    }
  }
}

const erasePlugin = (
  { build: debug }: Site['debug'],
  erasure: ReadonlyMap<string, readonly string[]>
): Plugin => ({
  name: 'minissg:erase',
  enforce: 'post',
  transform: {
    order: 'post', // this must happen at very last
    handler(_, id) {
      const imports = erasure.get(id)
      if (imports == null) return null
      debug?.('erase server-side code %o', id)
      const code = imports.map(i => util.js`import ${Exact(i)};`)
      code.push('export const __MINISSG_ERASED__ = true;')
      return { code: code.join('\n'), map: { mappings: '' } }
    }
  }
})

const configure = (
  site: Site,
  baseConfig: UserConfig,
  lib: LibModule,
  pages: ReadonlyMap<string, { head: readonly string[]; body: Body }>,
  input: { entries: string[]; erasure: ReadonlyMap<string, readonly string[]> }
): InlineConfig => ({
  ...baseConfig,
  root: site.config.root,
  base: site.config.base,
  mode: site.config.mode,
  ...site.options.config,
  build: {
    ...baseConfig.build,
    emptyOutDir: site.options.clean,
    ...site.options.config.build,
    rollupOptions: {
      ...baseConfig.build?.rollupOptions,
      input: input.entries,
      ...site.options.config.build?.rollupOptions
    }
  },
  plugins: [
    loaderPlugin(site.options, { pages, data: lib.data }),
    buildPlugin(site.options, pages),
    site.options.config.plugins,
    site.options.plugins(),
    erasePlugin(site.debug, input.erasure) // this must be at very last
  ],
  configFile: false
})
