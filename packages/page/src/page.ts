import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { Trie } from './trie'
import { dirPath, normalizePath, isAbsURL, safeDefineProperty } from './util'
import type { BivarianceFunc, Never } from './util'
import { type Tuples, type Items, iterateTuples, listItems } from './items'
import { type Delay, delay } from './delay'
import { Memo } from './memo'

type EntriesModule = Extract<minissg.Module, { entries: unknown }>

interface PageContext<SomePage extends Page = Page> extends minissg.Context {
  module: SomePage
}

type AssetModule = Readonly<{ default: string }>

export interface PathInfo {
  stem: string
  variant: string
  relURL: string
}

interface PastEdge<SomePage> {
  page: SomePage
  final?: boolean | undefined
}

interface Edge<SomePage> extends PastEdge<SomePage> {
  final: boolean
  // Edge represents an edge in the nondeterministic finite automaton
  // constituted by PageIndex.
  // `final` means whether or not `page` is a final state.
  // If `final` is true, `page` and its epsillon and final successors
  // are final states.  If `final` is false, they are not final states.
  // Note that, in contrast to standard automata theory, final states are
  // not recognized by themselves but their incoming edges; only if
  // transition comes to a state through an final edge, the state is a final
  // state.
}

export const priv_: unique symbol = Symbol('private')

export interface Asset {
  [priv_]?: never
  type: 'asset'
  url: Delay<string>
  pathname: (path?: string | Null) => string
}

interface PageIndexEntry<SomePage> {
  fileNameMap: SomePage | Asset
  moduleNameMap: SomePage
  stemMap: SomePage
}

type PageIndexTrie<X> = Trie<string, Array<Edge<X>>>
type MakePageIndex<X> = { [K in keyof X]: PageIndexTrie<X[K]> }
type PageIndex<SomePage> = MakePageIndex<PageIndexEntry<SomePage>>

interface Directory<SomePage> extends PageIndex<SomePage> {
  pages: Array<readonly [string, SomePage]>
}

const createDirectory = <SomePage>(): Directory<SomePage> => ({
  pages: [],
  fileNameMap: new Trie(),
  moduleNameMap: new Trie(),
  stemMap: new Trie()
})

export interface PagePrivate<ModuleType, SomePage> {
  content:
    | (() => Awaitable<ModuleType>)
    | Promise<Directory<SomePage>>
    | undefined
  fileName: string
  stem: ModuleName
  variant: ModuleName
  moduleName: ModuleName
  url: string
  parent: SomePage | undefined
  root: SomePage
  memo: Memo
}

interface PageBase<SomePage = unknown> extends minissg.Context {
  [priv_]: PagePrivate<unknown, SomePage>
}

const isSameClass = <SomePage extends NonNullable<object>>(
  page: SomePage,
  other: NonNullable<object>
): other is SomePage => {
  const PageType = page.constructor as new () => never
  const OtherType = other.constructor as () => never
  return other instanceof PageType && page instanceof OtherType
}

const findParent = <SomePage extends NonNullable<object>>(
  page: SomePage,
  context: minissg.Context | Null
): SomePage | undefined => {
  for (let c = context; c != null; c = c.parent) {
    if (isSameClass(page, c.module) && c.module !== page) return c.module
  }
  return undefined
}

const derefPage = async <
  SomePage extends Never<PageBase<SomePage>> | PageBase<SomePage>
>(
  page: SomePage
): Promise<SomePage | undefined> => {
  const priv = page[priv_]
  if (priv == null || typeof priv.content !== 'function') return undefined
  const moduleName = priv.moduleName
  let module = (await priv.memo.memoize(priv.content)) as minissg.Module
  let context: minissg.Context = page
  while (typeof module === 'object' && module != null) {
    if (isSameClass(page, module)) return module
    if (!('entries' in module && typeof module.entries === 'function')) break
    context = Object.freeze({ moduleName, module, parent: context })
    module = await module.entries(context)
  }
  return undefined
}

export const pathSteps = (path: string): string[] => {
  const key = path.split('/')
  if (key[0] === '') key.shift()
  return key
}

const addPage = <SomePage>(
  trie: Trie<string, Array<Edge<SomePage>>>,
  path: string[],
  next: Edge<SomePage>
): void => {
  const { key, node } = trie.get(path)
  if (key.length === 0 && node.value != null) {
    node.value.push(next)
  } else {
    node.set(key, [next])
  }
}

const addRoute = <Key extends keyof PageIndex<object>>(
  index: PageIndex<object>,
  indexKey: Key,
  path: string,
  page: PageIndexEntry<object>[Key]
): void => {
  const trie = index[indexKey]
  const key = pathSteps(path)
  addPage(trie, key, { page, final: true })
  if (!(indexKey === 'fileNameMap' || key[key.length - 1] === '')) return
  // in fileNameMap, `page` may have an edge to different file name in the
  // directory and therefore we need an alternative way to `page` without
  // the file name part of `path` (last component of `key`).
  // in the case where `path` ends with `/` (last component of `key` is
  // an empty string), because `page` may have an additional edge to child
  // pages (for example, `/foo/` may have a link to `/foo/bar`), we need
  // an alternative way to `page` without the last empty string.
  addPage(trie, key.slice(0, key.length - 1), { page, final: false })
}

const find = <
  SomePage extends PageBase<SomePage>,
  Key extends keyof PageIndexEntry<SomePage>
>(
  { page, final }: PastEdge<PageIndexEntry<SomePage>[Key]>,
  indexKey: Key,
  path: string[],
  all?: Set<PageIndexEntry<SomePage>[Key]> | undefined
): Awaitable<PageIndexEntry<SomePage>[Key] | undefined> => {
  if (page[priv_] == null) {
    return path.length === 0 && final === true ? page : undefined
  }
  if (typeof page[priv_].content === 'function') {
    return page[priv_].memo.memoize(derefPage, page).then(p => {
      if (p != null) return find({ page: p, final }, indexKey, path, all)
      if (path.length !== 0 || final !== true) return undefined
      if (all != null) all.add(page)
      return all != null ? undefined : page
    })
  }
  return page[priv_].content?.then(
    (index: PageIndex<SomePage> | undefined) =>
      index?.[indexKey]
        .walk(path)
        .reduceRight<PromiseLike<PageIndexEntry<SomePage>[Key] | undefined>>(
          (z, { key, node }) => {
            for (const next of node.value ?? []) {
              if (path.length !== 0 || final == null || final === next.final) {
                z = z.then(r => r ?? find(next, indexKey, key, all))
              }
            }
            return z
          },
          Promise.resolve(undefined)
        )
  )
}

const findByModuleName = <SomePage extends PageBase<SomePage>>(
  page: SomePage,
  path: string
): Awaitable<SomePage | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(page[priv_].moduleName.path + '/' + path)
  const edge = { page: page[priv_].root } as const
  return find<SomePage, 'moduleNameMap'>(edge, 'moduleNameMap', pathSteps(key))
}

const findByFileName = <SomePage extends PageBase<SomePage>>(
  page: SomePage,
  path: string
): Awaitable<SomePage | Asset | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(dirPath(page[priv_].fileName) + path)
  const edge = { page: page[priv_].root } as const
  return find<SomePage, 'fileNameMap'>(edge, 'fileNameMap', pathSteps(key))
}

const findByAny = <SomePage extends PageBase<SomePage>>(
  page: SomePage,
  path: string
): Awaitable<SomePage | Asset | undefined> => {
  if (isAbsURL(path)) return undefined
  return page[priv_].memo
    .memoize(findByModuleName, page, path)
    .then(r => r ?? page[priv_].memo.memoize(findByFileName, page, path))
}

const variants = async <SomePage extends PageBase<SomePage>>(
  page: SomePage
): Promise<Set<SomePage>> => {
  const key = pathSteps(page[priv_].stem.path)
  const set = new Set<SomePage>()
  await find({ page: page[priv_].root }, 'stemMap', key, set)
  return set
}

const defaultParsePath = (path: string): Readonly<PathInfo> => {
  const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(path)
  const variant = m?.[1] ?? ''
  const stemBase = path.slice(0, m?.index ?? path.length)
  const stem = stemBase + (/(?:^|\/|\.[^./]*)$/.test(stemBase) ? '' : '/')
  const relURL = variant === '' ? stem : variant + '/' + stem
  return { stem, variant, relURL }
}

const defaultPaginatePath = (index: number): Readonly<PathInfo> =>
  index === 0
    ? { stem: '', variant: '', relURL: './' }
    : { stem: '', variant: '', relURL: `${index + 1}/` }

const defaultRender = (mod: unknown): Awaitable<minissg.Content> => {
  if (mod == null || typeof mod === 'string') return mod
  if (typeof mod !== 'object') return `[${typeof mod}]`
  return 'default' in mod ? (mod.default as minissg.Content) : undefined
}

const inherit = <SomePage extends Page, Key extends keyof SomePage>(
  page: SomePage,
  key: Key,
  ...parents: ReadonlyArray<{ [P in Key]?: SomePage[P] | Null } | Null>
): void => {
  for (const parent of parents) {
    const method = parent?.[key]
    if (method != null && page[key] !== method) {
      page[key] = method
      break
    }
  }
}

const pathname = (url: string | URL, query: string | Null): string => {
  if (query != null && !/^[?#]/.test(query)) query = '?' + query
  const u = query != null ? new URL(query, url) : new URL(url)
  return u.href.slice(u.origin.length)
}

const assetPathname = function (this: Asset, query?: string | Null): string {
  return pathname(this.url.value, query)
}

const assetURL = async (
  root: PageBase<unknown>,
  load: () => Awaitable<{ default: string }>
): Promise<string> => {
  const path = (await root[priv_].memo.memoize(load)).default
  return new URL(path, new URL(root[priv_].url).origin).href
}

const createAsset = <SomePage extends PageBase<SomePage>>(
  page: SomePage,
  dir: Directory<SomePage>,
  filePath: string,
  load: (() => Awaitable<{ default: string }>) | string
): Asset => {
  let asset: Asset
  if (typeof load === 'string') {
    const url = new URL(load, page[priv_].root[priv_].url).href
    asset = { type: 'asset', url: delay.dummy(url), pathname: assetPathname }
  } else {
    asset = {
      type: 'asset',
      get url(): Delay<string> {
        return page[priv_].memo.memoize(assetURL, page[priv_].root, load)
      },
      pathname: assetPathname
    }
  }
  addRoute(dir, 'fileNameMap', filePath, asset)
  return asset
}

export interface Paginate<Item = unknown, SomePage = Page> {
  pages: Array<Paginate<Item, SomePage>>
  page: SomePage
  pageIndex: number // starts from 0
  itemIndex: number // starts from 0
  items: Item[] // up to `pageSize` items
  numAllItems: number
}

interface NewArg<ModuleType, This = never> {
  context?: Readonly<minissg.Context> | Null
  url?: URL | string | Null
  render?:
    | ((this: This, module: ModuleType) => Awaitable<minissg.Content>)
    | Null
  parsePath?: ((this: This, path: string) => Readonly<PathInfo>) | Null
  paginatePath?: ((this: This, index: number) => Readonly<PathInfo>) | Null
}

interface ModuleArg<ModuleType, This> extends NewArg<ModuleType, This> {
  pages?: Tuples<() => Awaitable<ModuleType>, This> | Null
  substPath?: ((this: This, path: string) => Awaitable<string>) | Null
  assets?: Tuples<(() => Awaitable<AssetModule>) | string | Null, This> | Null
}

interface PaginateArg<ModuleType, This, X> extends NewArg<ModuleType, This> {
  items: Items<X, This>
  load: (this: This, paginate: Paginate<X, This>) => Awaitable<ModuleType>
  pageSize?: number | Null
}

export type PageArg<ModuleType> = Readonly<NewArg<ModuleType>> | Null

type PageConstructor<ModuleType, This, Args extends readonly unknown[]> = new (
  arg: Readonly<PageArg<ModuleType>>,
  ...args: Args
) => This

const createPage = <
  ModuleType,
  SomePage extends Page<ModuleType>,
  Args extends readonly unknown[]
>(
  This: PageConstructor<ModuleType, SomePage, Args>,
  self: SomePage,
  dir: Directory<SomePage>,
  filePath: string | null,
  { relURL, stem, variant }: Readonly<PathInfo>,
  load: () => Awaitable<ModuleType>,
  args: Args
): SomePage => {
  const priv = self[priv_]
  const parent = priv.parent
  const moduleName = priv.moduleName.join(relURL)
  const context = { parent, moduleName, module: self, path: relURL }
  const page = new This({ context: Object.freeze(context) }, ...args)
  page[priv_].content = load
  page[priv_].stem = priv.stem.join(stem)
  page[priv_].variant = priv.variant.join(variant)
  page[priv_].url = new URL(moduleName.path, priv.root[priv_].url).href
  if (filePath != null) page[priv_].fileName = dirPath(priv.fileName) + filePath
  const relName = moduleName.path.slice(priv.moduleName.path.length)
  const relStem = page[priv_].stem.path.slice(priv.stem.path.length)
  addRoute(dir, 'fileNameMap', filePath ?? '', page)
  addRoute(dir, 'moduleNameMap', relName, page)
  addRoute(dir, 'stemMap', relStem, page)
  dir.pages.push([relURL, page])
  return page
}

const moduleDirectory = async <
  ModuleType,
  SomePage extends Page<ModuleType>,
  Args extends readonly unknown[]
>(
  This: PageConstructor<ModuleType, SomePage, Args>,
  page: SomePage,
  arg: ModuleArg<ModuleType, SomePage> | Null,
  args: Args
): Promise<Directory<SomePage>> => {
  const dir = createDirectory<SomePage>()
  if (arg?.pages != null) {
    for await (const [rawPath, load] of iterateTuples(arg.pages, page)) {
      const srcPath = (await arg?.substPath?.call(page, rawPath)) ?? rawPath
      const pathInfo = page.parsePath(normalizePath(srcPath))
      const filePath = rawPath === '' ? null : normalizePath(rawPath)
      createPage(This, page, dir, filePath, pathInfo, load, args)
    }
  }
  if (arg?.assets != null) {
    for await (const [rawPath, rawLoad] of iterateTuples(arg.assets, page)) {
      const load =
        rawLoad ?? (await arg?.substPath?.call(page, rawPath)) ?? rawPath
      createAsset(page, dir, normalizePath(rawPath), load)
    }
  }
  return dir
}

const paginateDirectory = async <
  Item,
  ModuleType,
  SomePage extends Page<ModuleType>,
  Args extends readonly unknown[]
>(
  This: PageConstructor<ModuleType, SomePage, Args>,
  page: SomePage,
  arg: PaginateArg<ModuleType, SomePage, Item>,
  args: Args
): Promise<Directory<SomePage>> => {
  const dir = createDirectory<SomePage>()
  const pageSize = arg.pageSize ?? 10
  if (pageSize <= 0) return dir
  const allItems = await listItems(arg.items, page)
  const load = arg.load
  const numAllItems = allItems.length
  const numPages = Math.ceil(numAllItems / pageSize)
  const pages: Array<Paginate<Item, SomePage>> = []
  for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
    const itemIndex = pageIndex * pageSize
    const items = allItems.slice(itemIndex, itemIndex + pageSize)
    const pagi = { pages, page, pageIndex, items, itemIndex, numAllItems }
    const load2 = (): Awaitable<ModuleType> => load.call(pagi.page, pagi)
    const pathInfo = page.paginatePath(pageIndex)
    const subpage = createPage(This, page, dir, null, pathInfo, load2, args)
    pagi.page = subpage
    pages.push(pagi)
  }
  return dir
}

export class Page<ModuleType = unknown> implements EntriesModule, PageContext {
  declare readonly [priv_]: PagePrivate<ModuleType, this>

  constructor(arg?: PageArg<ModuleType>) {
    const parent = findParent(this, arg?.context)
    inherit(this, 'parsePath', arg, parent)
    inherit(this, 'render', arg, parent)
    inherit(this, 'paginatePath', arg, parent)
    const root = parent?.[priv_].root
    const priv: PagePrivate<ModuleType, this> = {
      content: undefined,
      fileName: parent?.[priv_].fileName ?? '',
      stem: parent?.[priv_].stem ?? ModuleName.root,
      variant: parent?.[priv_].variant ?? ModuleName.root,
      moduleName: arg?.context?.moduleName ?? ModuleName.root,
      url: parent?.[priv_].url ?? new URL(arg?.url ?? 'file:').href,
      parent,
      root: root ?? this,
      memo: root?.[priv_].memo ?? new Memo()
    }
    safeDefineProperty(this, priv_, { value: priv })
  }

  static module<
    ModuleType = unknown,
    SomePage extends Page<ModuleType> = Page<ModuleType>,
    Args extends readonly unknown[] = []
  >(
    this: PageConstructor<ModuleType, SomePage, Args>,
    arg?: Readonly<ModuleArg<ModuleType, SomePage>> | Null,
    ...args: Args
  ): SomePage {
    const page = new this(arg, ...args)
    page[priv_].content = moduleDirectory(this, page, arg, args)
    return page
  }

  static paginate<
    Item,
    ModuleType = unknown,
    SomePage extends Page<ModuleType> = Page<ModuleType>,
    Args extends readonly unknown[] = []
  >(
    this: PageConstructor<ModuleType, SomePage, Args>,
    arg: Readonly<PaginateArg<ModuleType, SomePage, Item>>,
    ...args: Args
  ): SomePage {
    const page = new this(arg, ...args)
    page[priv_].content = paginateDirectory(this, page, arg, args)
    return page
  }

  // the following methods are only for the users.
  // they can be overriden by the user and therefore cannot be used in
  // the implementation of this class.

  memoize<Args extends readonly unknown[], Ret>(
    func: (...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    return this[priv_].memo.memoize(func, ...args)
  }

  get url(): Delay<string> {
    return delay.dummy(this[priv_].url)
  }

  pathname(query?: string | Null): string {
    return pathname(this[priv_].url, query)
  }

  get fileName(): string {
    return this[priv_].fileName
  }

  get variant(): string {
    return this[priv_].variant.path
  }

  get moduleName(): ModuleName {
    return this[priv_].moduleName
  }

  get module(): this {
    return this
  }

  get parent(): this | undefined {
    return this[priv_].parent
  }

  get root(): this {
    return this[priv_].root
  }

  load(): Delay<ModuleType> | undefined {
    const content = this[priv_].content
    if (typeof content !== 'function') return undefined
    return this[priv_].memo.memoize(content)
  }

  findByModuleName(path: string): Delay<this | undefined> {
    return this[priv_].memo.memoize(findByModuleName, this, path)
  }

  findByFileName(path: string): Delay<this | Asset | undefined> {
    return this[priv_].memo.memoize(findByFileName, this, path)
  }

  find(path: string): Delay<this | Asset | undefined> {
    return this[priv_].memo.memoize(findByAny, this, path)
  }

  variants(): Delay<Set<this>> {
    return this[priv_].memo.memoize(variants, this)
  }

  async entries(): Promise<minissg.Module> {
    const content = this[priv_].content
    if (typeof content !== 'function') return (await content)?.pages ?? []
    const mod = await this[priv_].memo.memoize(content)
    if (typeof mod === 'object' && mod != null) {
      if (Symbol.iterator in mod || 'entries' in mod) {
        return mod as minissg.Module
      }
    }
    return {
      default: delay(
        async () =>
          await this[priv_].memo.run(async () => await this.render(mod))
      )
    }
  }

  findParent<Key extends keyof this>(key?: Key | undefined): this | undefined {
    if (key == null) return this[priv_].parent
    for (let p = this[priv_].parent; p != null; p = p[priv_].parent) {
      if (p[key] !== this[key]) return p
    }
    return undefined
  }

  declare parsePath: BivarianceFunc<this, [string], Readonly<PathInfo>>
  declare paginatePath: BivarianceFunc<this, [number], Readonly<PathInfo>>
  declare render: BivarianceFunc<this, [ModuleType], Awaitable<minissg.Content>>
  declare readonly type: 'page'
}

safeDefineProperty(Page.prototype as Page, 'parsePath', {
  configurable: true,
  writable: true,
  value: defaultParsePath
})

safeDefineProperty(Page.prototype as Page, 'paginatePath', {
  configurable: true,
  writable: true,
  value: defaultPaginatePath
})

safeDefineProperty(Page.prototype as Page, 'render', {
  configurable: true,
  writable: true,
  value: defaultRender
})

safeDefineProperty(Page.prototype as Page, 'type', {
  configurable: true,
  writable: true,
  value: 'page'
})
