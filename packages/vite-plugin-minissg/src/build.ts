import { resolve } from 'node:path'
import { format } from 'node:util'
import type { Plugin, Rollup, UserConfig, InlineConfig } from 'vite'
import { build } from 'vite'
import type { ResolvedOptions } from './options'
import { Site } from './site'
import { ModuleName, run } from './module'
import type { Module, Tree, Page, PageBody } from './module'
import { scriptsHtml, injectHtmlHead } from './html'
import type { LibModule } from './loader'
import { Virtual, loaderPlugin, clientNodeInfo } from './loader'
import { isNotNull, js, mapReduce, traverseGraph, addSet, touch } from './utils'

type Load<X> = () => Promise<X>

const load = <X extends NonNullable<object>>(name: string): Load<X> => {
  let r: X | undefined
  return async () => r ?? (await import(name).then((x: X) => (r = x)))
}

// prettier-ignore
const loader = <X>(lib: Load<LibModule>, id: string, load: Load<X>): Load<X> =>
  async () => await lib().then(m => m.add(id)).then(load)

const loadEntry = (
  outDir: string,
  lib: Load<LibModule>,
  bundle: Readonly<Rollup.OutputBundle>,
  entryModules: ReadonlyMap<string, Rollup.ResolvedId | null>
): Tree => {
  const chunkMap = new Map<string, Rollup.OutputChunk>()
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk' || chunk.facadeModuleId == null) continue
    chunkMap.set(chunk.facadeModuleId, chunk)
  }
  const module = new Map<string, Module>(
    Array.from(entryModules, ([k, r]) => {
      if (r == null || r.external !== false) return [k, { default: null }]
      const chunk = chunkMap.get(r.id)
      if (chunk == null) return [k, { default: null }]
      const fileName = resolve(outDir, chunk.fileName)
      return [k, { entries: loader(lib, r.id, load(fileName)) }]
    })
  )
  return { moduleName: ModuleName.root, module, lib }
}

const emitPages = async (
  chunks: ReadonlyMap<string, Iterable<string>>,
  pages: ReadonlyMap<string, Page>
): Promise<Iterable<readonly [string, { head: string; body: PageBody }]>> =>
  await Promise.all(
    Array.from(pages).map(async ([outputName, page]) => {
      const { head, body } = await page()
      const set = new Set<string>()
      for (const id of head) addSet(set, chunks.get(id))
      if (set.size > 0) set.add(Virtual.Keep(outputName)) // avoid deduplication
      return [outputName, { head: scriptsHtml(set, true), body }] as const
    })
  )

const emitFiles = async (
  this_: Rollup.PluginContext,
  site: Site,
  bundle: Rollup.OutputBundle,
  pages: ReadonlyMap<string, { body: PageBody }>
): Promise<void> => {
  await mapReduce({
    sources: pages,
    destination: undefined,
    map: async ([outputName, { body }]) => {
      const assetName = '\0' + Virtual.Head(outputName)
      const head = bundle[assetName]
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete bundle[assetName]
      let source = await body()
      if (source == null) return
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
}

const generateInput = async (
  this_: Rollup.PluginContext,
  site: Site,
  entryModules: ReadonlyMap<string, Rollup.ResolvedId | null>
): Promise<{ entries: string[]; spoilers: Map<string, string[]> }> => {
  const assetGenerators = await traverseGraph({
    nodes: Array.from(entryModules.values(), i => i?.id).filter(isNotNull),
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
  const spoilers = new Map<string, string[]>()
  for (const [id, assets] of assetGenerators) {
    const info = this_.getModuleInfo(id)
    if (info == null || assets.size === 0) continue
    if (info.isEntry) entries.push(Virtual.Exact(id))
    if (assets.has(id)) continue
    const imports = [...info.importedIds, ...info.dynamicallyImportedIds]
    spoilers.set(id, imports.filter(isAssetGenerator))
  }
  if (entries.length === 0) entries.push(Virtual.Keep('')) // avoid empty input
  return { entries, spoilers }
}

export const buildPlugin = (
  options: ResolvedOptions,
  bodys?: ReadonlyMap<string, { body: PageBody }>
): Plugin => {
  let baseConfig: UserConfig
  let site: Site
  let onClose: (() => Promise<void>) | undefined
  let serverChunks = new Map<string, Set<string>>()
  let entryModules = new Map<string, Rollup.ResolvedId | null>()
  let entryCount = 0
  let libFileId: string | undefined

  return {
    name: 'minissg:build',
    enforce: 'post',
    apply: 'build',

    config: {
      order: 'pre',
      handler(config) {
        baseConfig = config
        return {
          build: {
            // the first pass is for SSR
            ...(bodys == null ? { ssr: true } : null),
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
      entryModules = await mapReduce({
        sources: site.entries(),
        destination: new Map<string, Rollup.ResolvedId | null>(),
        map: async ([name, id]) => {
          const preserveSignature = 'strict' as const
          this.emitFile({ type: 'chunk', id, preserveSignature })
          const r = await this.resolve(id, undefined, { isEntry: true })
          if (r?.external === false) entryCount++
          return [name, r] as const
        },
        reduce: (i, z) => z.set(...i)
      })
      if (bodys == null) {
        libFileId = this.emitFile({ type: 'chunk', id: Virtual.Lib })
        entryCount++
      }
    },

    async moduleParsed({ isEntry }) {
      if (!isEntry || --entryCount !== 0) return
      // load all server-side codes before loading any client-side code
      serverChunks = await traverseGraph({
        nodes: Array.from(entryModules.values(), i => i?.id).filter(isNotNull),
        nodeInfo: async id => {
          if (this.getModuleInfo(id)?.isExternal === true) return {}
          const info = await this.load({ id, resolveDependencies: true })
          if (info.isExternal) return {}
          const next = info.importedIds
          const entries = info.dynamicallyImportedIds
          return clientNodeInfo({ next, entries }, id, site)
        }
      })
      if (bodys == null) return
      for (const outputName of bodys.keys()) {
        const id = Virtual.Head(outputName)
        // NOTE: this makes entryCount negative
        this.emitFile({ type: 'chunk', id, preserveSignature: false })
      }
    },

    async generateBundle(outputOptions, bundle) {
      if (bodys != null) {
        await emitFiles(this, site, bundle, bodys)
        return
      }
      const dir = outputOptions.dir ?? site.config.build.outDir
      const outDir = resolve(site.config.root, dir)
      if (libFileId == null) throw Error('Lib module not found')
      const lib = load<LibModule>(resolve(outDir, this.getFileName(libFileId)))
      const tree = loadEntry(outDir, lib, bundle, entryModules)
      const input = await generateInput(this, site, entryModules)
      onClose = async function (this: void) {
        onClose = undefined // for early memory release
        try {
          const pages = await emitPages(serverChunks, await run(site, tree))
          const lib = await tree.lib()
          await build(configure(site, baseConfig, lib, new Map(pages), input))
        } catch (e) {
          throw e instanceof Error
            ? touch(e)
            : touch(Error(format('uncaught thrown value: %o', e), { cause: e }))
        }
      }
    },

    closeBundle: {
      order: 'post', // defer vite.build as much as possible
      sequential: true,
      async handler() {
        if (onClose == null) return
        if (site.config.logger.hasWarned) {
          this.error('[minissg] found some errors or warnings in the first run')
        }
        await onClose()
      }
    }
  }
}

const spoilPlugin = (src: ReadonlyMap<string, readonly string[]>): Plugin => ({
  name: 'minissg:spoiler',
  enforce: 'post',
  transform: {
    order: 'post', // this must happen at very last
    handler(_, id) {
      const imports = src.get(id)
      if (imports == null) return null
      const code = imports.map(i => js`import ${Virtual.Exact(i)}`)
      code.push('export const __MINISSG_SPOILER__ = true')
      return { code: code.join('\n'), map: { mappings: '' } }
    }
  }
})

const configure = (
  site: Site,
  baseConfig: UserConfig,
  lib: LibModule,
  pages: ReadonlyMap<string, { head: string; body: PageBody }>,
  input: { entries: string[]; spoilers: ReadonlyMap<string, readonly string[]> }
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
    loaderPlugin(site.options, { heads: pages, data: lib.data }),
    buildPlugin(site.options, pages),
    site.options.config.plugins,
    site.options.plugins(),
    spoilPlugin(input.spoilers) // this must be at very last
  ],
  configFile: false
})
