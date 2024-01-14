import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { Trie } from './trie'
import { dirPath, normalizePath, isAbsURL, safeDefineProperty } from './util'
import { type Tuples, type Items, iterateTuples, listItems } from './items'
import { type Delay, delay } from './delay'
import { Memo } from './memo'

export interface PathInfo {
  stem: string
  variant: string
  relURL: string
}

interface PastEdge<This> {
  page: This
  final?: boolean | undefined
}

interface Edge<This> extends PastEdge<This> {
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

interface PageIndexEntry<This> {
  fileNameMap: This | Asset
  moduleNameMap: This
  stemMap: This
}

type PageIndexTrie<X> = Trie<string, Array<Edge<X>>>
type MakePageIndex<X> = { [K in keyof X]: PageIndexTrie<X[K]> }
type PageIndex<This> = MakePageIndex<PageIndexEntry<This>>

interface Directory<This> extends PageIndex<This> {
  pages: Array<readonly [string, This]>
}

const createDirectory = <This>(): Directory<This> => ({
  pages: [],
  fileNameMap: new Trie(),
  moduleNameMap: new Trie(),
  stemMap: new Trie()
})

export const pathSteps = (path: string): string[] => {
  const key = path.split('/')
  if (key[0] === '') key.shift()
  return key
}

const addPage = <This>(
  trie: PageIndexTrie<This>,
  path: string[],
  next: Edge<This>
): void => {
  const { key, node } = trie.get(path)
  if (key.length === 0 && node.value != null) {
    node.value.push(next)
  } else {
    node.set(key, [next])
  }
}

const addRoute = <This, Key extends keyof PageIndex<This>>(
  index: PageIndex<This>,
  indexKey: Key,
  path: string,
  page: PageIndexEntry<This>[Key]
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

interface PagePrivate<ModuleType, This> {
  content: (() => Awaitable<ModuleType>) | Promise<Directory<This>> | undefined
  fileName: string
  stem: ModuleName
  variant: ModuleName
  moduleName: ModuleName
  url: Readonly<URL>
  root: This
  parent: This | undefined
  this: This
  memo: Memo
}

interface PageMethods<ModuleType, This> {
  parsePath: (this: This, path: string) => Readonly<PathInfo>
  paginatePath: (this: This, index: number) => Readonly<PathInfo>
  render: (this: This, module: ModuleType) => Awaitable<minissg.Content>
}

interface PageBase<ModuleType, This> extends minissg.Context {
  [priv_]: PagePrivate<ModuleType, This>
}

type PagePrivateAll<ModuleType, Base> = PagePrivate<ModuleType, Base> &
  PageMethods<ModuleType, Base>

const isPrototypeOf = (x: object | null, y: object): boolean =>
  x != null && (x === y || Object.prototype.isPrototypeOf.call(x, y))

const isChildOf = <This extends PageBase<unknown, This>>(
  ThisFn: abstract new (...args: never) => This,
  other: object
): other is This =>
  other instanceof Page &&
  other[priv_].root != null &&
  isPrototypeOf(
    Reflect.getPrototypeOf(other[priv_].root as object),
    ThisFn.prototype as object
  )

const isParentOf = <This extends PageBase<unknown, This>>(
  page: This,
  other: object
): other is This =>
  page[priv_].root != null &&
  isPrototypeOf(Reflect.getPrototypeOf(page[priv_].root), other)

const findParent = <This extends PageBase<unknown, This>>(
  ThisFn: abstract new (...args: never) => This,
  context: minissg.Context | Null
): This | undefined => {
  for (let c = context; c != null; c = c.parent) {
    if (isChildOf(ThisFn, c.module)) return c.module
  }
  return undefined
}

const derefChild = async <This extends PageBase<unknown, This>>(
  page: This | { [priv_]?: never }
): Promise<This | undefined> => {
  if (page[priv_] == null) return undefined
  if (typeof page[priv_].content !== 'function') return undefined
  const content = page[priv_].content
  const moduleName = page[priv_].moduleName
  let module = (await page[priv_].memo.memoize(content)) as minissg.Module
  let context: minissg.Context = page
  while (typeof module === 'object' && module != null) {
    if (isParentOf(page, module)) return module
    if (!('entries' in module && typeof module.entries === 'function')) break
    context = Object.freeze({ moduleName, module, parent: context })
    module = await module.entries(context)
  }
  return undefined
}

const find = <
  This extends PageBase<unknown, This>,
  Key extends keyof PageIndexEntry<This>
>(
  { page, final }: PastEdge<PageIndexEntry<This>[Key]>,
  indexKey: Key,
  path: string[],
  all?: Set<PageIndexEntry<This>[Key]> | undefined
): Awaitable<PageIndexEntry<This>[Key] | undefined> => {
  if (page[priv_] == null) {
    return path.length === 0 && final === true ? page : undefined
  }
  if (typeof page[priv_].content === 'function') {
    return page[priv_].memo.memoize(derefChild<This>, page).then(p => {
      if (p != null) return find({ page: p, final }, indexKey, path, all)
      if (path.length !== 0 || final !== true) return undefined
      if (all != null) all.add(page)
      return all != null ? undefined : page
    })
  }
  return page[priv_].content?.then(
    (index: PageIndex<This> | undefined) =>
      index?.[indexKey]
        .walk(path)
        .reduceRight<PromiseLike<PageIndexEntry<This>[Key] | undefined>>(
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

const findByModuleName = <This extends PageBase<unknown, This>>(
  priv: PagePrivate<unknown, This>,
  path: string
): Awaitable<This | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(priv.moduleName.path + '/' + path)
  const edge = { page: priv.root } as const
  return find<This, 'moduleNameMap'>(edge, 'moduleNameMap', pathSteps(key))
}

const findByFileName = <This extends PageBase<unknown, This>>(
  priv: PagePrivate<unknown, This>,
  path: string
): Awaitable<This | Asset | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(dirPath(priv.fileName) + path)
  const edge = { page: priv.root } as const
  return find<This, 'fileNameMap'>(edge, 'fileNameMap', pathSteps(key))
}

const findByAny = <This extends PageBase<unknown, This>>(
  priv: PagePrivate<unknown, This>,
  path: string
): Awaitable<This | Asset | undefined> => {
  if (isAbsURL(path)) return undefined
  return priv.memo
    .memoize(findByModuleName, priv, path)
    .then(r => r ?? priv.memo.memoize(findByFileName, priv, path))
}

const variants = async <This extends PageBase<unknown, This>>(
  priv: PagePrivate<unknown, This>
): Promise<Set<This>> => {
  const key = pathSteps(priv.stem.path)
  const set = new Set<This>()
  if (priv.root == null) return set
  await find<This, 'stemMap'>({ page: priv.root }, 'stemMap', key, set)
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
    ? { stem: `${index + 1}`, variant: '', relURL: './' }
    : { stem: `${index + 1}`, variant: '', relURL: `${index + 1}/` }

const defaultRender = (mod: unknown): Awaitable<minissg.Content> => {
  if (mod == null || typeof mod === 'string') return mod
  if (typeof mod !== 'object') return `[${typeof mod}]`
  return 'default' in mod ? (mod.default as minissg.Content) : undefined
}

const pathname = (url: string | URL, query: string | Null): string => {
  if (query != null && !/^[?#]/.test(query)) query = '?' + query
  const u = query != null ? new URL(query, url) : new URL(url)
  return u.href.slice(u.origin.length)
}

const assetPathname = function (this: Asset, query?: string | Null): string {
  return pathname(this.url.value, query)
}

const assetURL = async <This extends PageBase<unknown, This>>(
  root: This,
  load: () => Awaitable<{ default: string }>
): Promise<string> => {
  const path = (await root[priv_].memo.memoize(load)).default
  return new URL(path, root[priv_].url.origin).href
}

const createAsset = <This extends PageBase<unknown, This>>(
  page: PageBase<unknown, This>,
  dir: Directory<This>,
  load: (() => Awaitable<{ default: string }>) | string,
  filePath: string
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

type AssetModule = Readonly<{ default: string }>

export interface Paginate<Item = unknown, This = Page> {
  pages: Array<Paginate<Item, This>>
  page: This
  pageIndex: number // starts from 0
  itemIndex: number // starts from 0
  items: Item[] // up to `pageSize` items
  numAllItems: number
}

interface NewArg<ModuleType, This> {
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

interface PaginateArg<Item, ModuleType, This> extends NewArg<ModuleType, This> {
  items: Items<Item, This>
  load: (this: This, paginate: Paginate<Item, This>) => Awaitable<ModuleType>
  pageSize?: number | Null
}

export type PageArg<
  ModuleType = unknown,
  Base = PageRec<ModuleType>
> = Readonly<{
  [priv_]: PagePrivate<ModuleType, Base>
}>

type PageConstructor<ModuleType, Base, This, Args extends unknown[]> = new (
  arg: PageArg<ModuleType, Base>,
  ...args: Args
) => This

const newPage = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  arg: NewArg<ModuleType, Base>,
  args: Args
): This => {
  const parent = findParent<Base>(ThisFn, arg?.context)
  let priv: PagePrivateAll<ModuleType, Base>
  if (parent == null) {
    priv = {
      content: undefined,
      root: undefined as unknown as Base, // dummy
      this: undefined as unknown as Base, // dummy
      parent,
      moduleName: arg.context?.moduleName ?? ModuleName.root,
      fileName: '',
      stem: ModuleName.root,
      variant: ModuleName.root,
      url: new URL('.', arg?.url ?? 'file:'),
      memo: new Memo(),
      parsePath: arg.parsePath ?? defaultParsePath,
      paginatePath: arg.paginatePath ?? defaultPaginatePath,
      render: arg.render ?? defaultRender
    }
  } else {
    priv = Object.create(parent[priv_]) as (typeof parent)[typeof priv_]
    priv.content = undefined
    priv.parent = parent
    priv.moduleName = arg.context?.moduleName ?? ModuleName.root
    if (arg.parsePath != null) priv.parsePath = arg.parsePath
    if (arg.paginatePath != null) priv.paginatePath = arg.paginatePath
    if (arg.render != null) priv.render = arg.render
  }
  const self = new ThisFn({ [priv_]: priv }, ...args)
  priv.root ??= self
  priv.this = self
  return self
}

const createSubpage = <
  ModuleType,
  This extends Page<ModuleType, This>,
  Args extends unknown[]
>(
  self: This,
  dir: Directory<This>,
  load: () => Awaitable<ModuleType>,
  filePath: string | null,
  { relURL, stem, variant }: Readonly<PathInfo>,
  ThisFn: PageConstructor<ModuleType, This, This, Args>,
  args: Args
): This => {
  const priv = self[priv_]
  const parent = priv.parent
  const moduleName = priv.moduleName.join(relURL)
  const context = { parent, moduleName, module: self, path: relURL }
  const page = newPage(ThisFn, { context: Object.freeze(context) }, args)
  page[priv_].content = load
  page[priv_].stem = priv.stem.join(stem)
  page[priv_].variant = priv.variant.join(variant)
  page[priv_].url = new URL(moduleName.path, priv.root[priv_].url)
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
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  self: This,
  arg: ModuleArg<ModuleType, Base>,
  args: Args
): Promise<Directory<Base>> => {
  const dir = createDirectory<Base>()
  const substPath = (path: string): Awaitable<string> =>
    arg.substPath == null ? path : Reflect.apply(arg.substPath, self, [path])
  if (arg.pages != null) {
    for await (const [rawPath, load] of iterateTuples(arg.pages, self)) {
      const pathInfo = self.parsePath(normalizePath(await substPath(rawPath)))
      const filePath = rawPath === '' ? null : normalizePath(rawPath)
      createSubpage(self, dir, load, filePath, pathInfo, ThisFn, args)
    }
  }
  if (arg.assets != null) {
    for await (const [rawPath, rawLoad] of iterateTuples(arg.assets, self)) {
      const load = rawLoad ?? (await substPath(rawPath))
      createAsset(self, dir, load, normalizePath(rawPath))
    }
  }
  return dir
}

const paginateDirectory = async <
  Item,
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  self: This,
  arg: PaginateArg<Item, ModuleType, Base>,
  args: Args
): Promise<Directory<Base>> => {
  const dir = createDirectory<Base>()
  const pageSize = arg.pageSize ?? 10
  if (pageSize <= 0) return dir
  const allItems = await listItems(arg.items, self)
  const loadFn = arg.load
  const numAllItems = allItems.length
  const numPages = Math.ceil(numAllItems / pageSize)
  const pages: Array<Paginate<Item, Base>> = []
  for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
    const itemIndex = pageIndex * pageSize
    const items = allItems.slice(itemIndex, itemIndex + pageSize)
    const page = undefined as unknown as Base // dummy
    const pagi = { pages, page, pageIndex, items, itemIndex, numAllItems }
    const load = (): Awaitable<ModuleType> =>
      Reflect.apply(loadFn, pagi.page, [pagi])
    const pathInfo = self.paginatePath(pageIndex)
    const subpage = createSubpage(self, dir, load, null, pathInfo, ThisFn, args)
    pagi.page = subpage
    pages.push(pagi)
  }
  return dir
}

// workaround for typescript-eslint: without this,
// @typescript-eslint/no-unsafe-assignment causes an infinite recursive call.
type EslintWorkaround<X> = { [K in keyof X]: X[K] }

type PageRec<X> = Page<X, EslintWorkaround<PageRec<X>>>

export class Page<
  ModuleType = unknown,
  Base extends Page<ModuleType, Base> = PageRec<ModuleType>
> {
  declare readonly [priv_]: PagePrivateAll<ModuleType, Base>

  constructor(arg: PageArg<ModuleType, Base>) {
    safeDefineProperty(this, priv_, { value: arg[priv_] })
  }

  static module<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<ModuleArg<ModuleType, Base>>,
    ...args: Args
  ): This {
    const page = newPage(this, arg, args)
    page[priv_].content = moduleDirectory(this, page, arg, args)
    return page
  }

  static paginate<
    Item,
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<PaginateArg<Item, ModuleType, Base>>,
    ...args: Args
  ): This {
    const page = newPage(this, arg, args)
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
    return delay.dummy(this[priv_].url.href)
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

  get parent(): Base | undefined {
    return this[priv_].parent
  }

  get root(): Base {
    return this[priv_].root
  }

  load(): Delay<ModuleType> | undefined {
    const content = this[priv_].content
    if (typeof content !== 'function') return undefined
    return this[priv_].memo.memoize(content)
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    return this[priv_].memo.memoize(findByModuleName, this[priv_], path)
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return this[priv_].memo.memoize(findByFileName, this[priv_], path)
  }

  find(path: string): Delay<Base | Asset | undefined> {
    return this[priv_].memo.memoize(findByAny, this[priv_], path)
  }

  variants(): Delay<Set<Base>> {
    return this[priv_].memo.memoize(variants, this[priv_])
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
          await this[priv_].memo.run(
            async () => await this[priv_].this.render(mod)
          )
      )
    }
  }

  inherit<Key extends keyof Base>(key: Key): Base[Key] | undefined {
    for (let p = this[priv_].parent; p != null; p = p[priv_].parent) {
      if (p[key] !== this[priv_].this[key]) return p[key]
    }
    return undefined
  }

  get parsePath(): PageMethods<ModuleType, Base>['parsePath'] {
    return this[priv_].parsePath
  }

  set parsePath(f: PageMethods<ModuleType, Base>['parsePath']) {
    this[priv_].parsePath = f
  }

  get paginatePath(): PageMethods<ModuleType, Base>['paginatePath'] {
    return this[priv_].paginatePath
  }

  set paginatePath(f: PageMethods<ModuleType, Base>['paginatePath']) {
    this[priv_].paginatePath = f
  }

  get render(): PageMethods<ModuleType, Base>['render'] {
    return this[priv_].render
  }

  set render(f: PageMethods<ModuleType, Base>['render']) {
    this[priv_].render = f
  }

  declare readonly type: 'page'
}

/*
  safeDefineProperty(Page.prototype as Page, 'type', {
  configurable: true,
  writable: true,
  value: 'page'
})
*/
