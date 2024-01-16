import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { dirPath, normalizePath, safeDefineProperty } from './util'
import { type Tuples, type Items, iterateTuples, listItems } from './items'
import { type Delay, delay } from './delay'
import { type Asset, Directory } from './directory'
import { Tree, tree_ } from './tree'

export interface PathInfo {
  stem: string
  variant: string
  relURL: string
}

export const init_: unique symbol = Symbol('init')

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

const assetURL = async <ModuleType, Base extends Page<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  load: () => Awaitable<{ default: string }>
): Promise<string> => {
  const path = (await tree.memo.memoize(load)).default
  return new URL(path, tree.root.url.origin).href
}

const createAsset = <ModuleType, Base extends Page<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  dir: Directory<Base, Tree<ModuleType, Base>>,
  load: (() => Awaitable<{ default: string }>) | string,
  filePath: string
): Asset => {
  let asset: Asset
  if (typeof load === 'string') {
    const url = new URL(load, tree.root.url).href
    asset = { type: 'asset', url: delay.dummy(url), pathname: assetPathname }
  } else {
    asset = {
      type: 'asset',
      get url(): Delay<string> {
        return tree.memo.memoize(assetURL, tree, load)
      },
      pathname: assetPathname
    }
  }
  dir.fileNameMap.addRoute(filePath, { self: asset })
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

const initPage = <ModuleType, Base extends Page<ModuleType, Base>>(
  page: Base,
  arg: NewArg<ModuleType, Base>
): void => {
  const tree = new Tree<ModuleType, Base>(page, arg)
  safeDefineProperty(page, tree_, { value: tree, writable: true })
  const parent = tree.parent?.self
  if (!Object.hasOwn(page, 'parsePath')) {
    const f = arg.parsePath ?? parent?.parsePath ?? defaultParsePath
    if (page.parsePath !== f) page.parsePath = f
  }
  if (!Object.hasOwn(page, 'paginatePath')) {
    const f = arg.paginatePath ?? parent?.paginatePath ?? defaultPaginatePath
    if (page.paginatePath !== f) page.paginatePath = f
  }
  if (!Object.hasOwn(page, 'render')) {
    const f = arg.render ?? parent?.render ?? defaultRender
    if (page.render !== f) page.render = f
  }
}

export abstract class PageArg<ModuleType, Base extends Page<ModuleType, Base>> {
  abstract [init_](self: Page<ModuleType, Base>): void
}

type PageConstructor<
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
> = new (arg: PageArg<ModuleType, Base>, ...args: Args) => This

const newPage = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  arg: NewArg<ModuleType, Base>,
  args: Args,
  init?: ((page: Base) => void) | undefined
): This => {
  class Init extends PageArg<ModuleType, Base> {
    override [init_](page: Base): void {
      initPage(page, arg)
      if (init != null) init(page)
    }
  }
  return new ThisFn(new Init(), ...args)
}

const createSubpage = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  page: This,
  dir: Directory<Base, Tree<ModuleType, Base>>,
  load: () => Awaitable<ModuleType>,
  filePath: string | null,
  { relURL, stem, variant }: Readonly<PathInfo>,
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  args: Args
): This => {
  const pred = page[tree_]
  const parent = pred.parent?.self
  const moduleName = pred.moduleName.join(relURL)
  const context = { parent, moduleName, module: page, path: relURL }
  const arg: NewArg<ModuleType, Base> = { context: Object.freeze(context) }
  return newPage(ThisFn, arg, args, page => {
    const tree = page[tree_]
    tree.content = load
    tree.stem = tree.stem.join(stem)
    tree.variant = tree.variant.join(variant)
    tree.url = new URL(tree.moduleName.path, tree.root.url)
    if (filePath != null) tree.fileName = dirPath(pred.fileName) + filePath
    const relName = tree.moduleName.path.slice(pred.moduleName.path.length)
    const relStem = tree.stem.path.slice(pred.stem.path.length)
    dir.fileNameMap.addRoute(filePath ?? '', tree)
    dir.moduleNameMap.addRoute(relName, tree)
    dir.stemMap.addRoute(relStem, tree)
    dir.pages.push([relURL, page])
  })
}

const moduleDirectory = async <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  page: This,
  arg: ModuleArg<ModuleType, Base>,
  args: Args
): Promise<Directory<Base, Tree<ModuleType, Base>>> => {
  const dir = new Directory<Base, Tree<ModuleType, Base>>()
  const substPath = (path: string): Awaitable<string> =>
    arg.substPath == null ? path : Reflect.apply(arg.substPath, page, [path])
  if (arg.pages != null) {
    for await (const [rawPath, load] of iterateTuples(arg.pages, page)) {
      const pathInfo = page.parsePath(normalizePath(await substPath(rawPath)))
      const filePath = rawPath === '' ? null : normalizePath(rawPath)
      createSubpage(page, dir, load, filePath, pathInfo, ThisFn, args)
    }
  }
  if (arg.assets != null) {
    for await (const [rawPath, rawLoad] of iterateTuples(arg.assets, page)) {
      const load = rawLoad ?? (await substPath(rawPath))
      createAsset(page[tree_], dir, load, normalizePath(rawPath))
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
  page: This,
  arg: PaginateArg<Item, ModuleType, Base>,
  args: Args
): Promise<Directory<Base, Tree<ModuleType, Base>>> => {
  const dir = new Directory<Base, Tree<ModuleType, Base>>()
  const pageSize = arg.pageSize ?? 10
  if (pageSize <= 0) return dir
  const allItems = await listItems(arg.items, page)
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
    const pathInfo = page.paginatePath(pageIndex)
    const subpage = createSubpage(page, dir, load, null, pathInfo, ThisFn, args)
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
  declare readonly [tree_]: Tree<ModuleType, Base>

  constructor(arg: PageArg<ModuleType, Base>) {
    arg[init_](this)
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
    return newPage(this, arg, args, page => {
      page[tree_].content = moduleDirectory(this, page, arg, args)
    })
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
    return newPage(this, arg, args, page => {
      page[tree_].content = paginateDirectory(this, page, arg, args)
    })
  }

  // the following methods are only for the users.
  // they can be overriden by the user and therefore cannot be used in
  // the implementation of this class.

  memoize<Args extends readonly unknown[], Ret>(
    func: (...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    return this[tree_].memo.memoize(func, ...args)
  }

  get url(): Delay<string> {
    return delay.dummy(this[tree_].url.href)
  }

  pathname(query?: string | Null): string {
    return pathname(this[tree_].url, query)
  }

  get fileName(): string {
    return this[tree_].fileName
  }

  get variant(): string {
    return this[tree_].variant.path
  }

  get moduleName(): minissg.ModuleName {
    return this[tree_].moduleName
  }

  get module(): this {
    return this
  }

  get parent(): Base | undefined {
    return this[tree_].parent?.self
  }

  get root(): Base {
    return this[tree_].root.self
  }

  load(): Delay<ModuleType> | undefined {
    return this[tree_].load()
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    return this[tree_].findByModuleName(path)
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return this[tree_].findByFileName(path)
  }

  find(path: string): Delay<Base | Asset | undefined> {
    return this[tree_].find(path)
  }

  variants(): Delay<Set<Base>> {
    return this[tree_].variants()
  }

  async entries(
    context?: Readonly<minissg.Context> | Null
  ): Promise<minissg.Module> {
    if (this[tree_].parent == null && context != null) {
      const url = this[tree_].url
      initPage<ModuleType, Base>(this[tree_].self, { context, url })
    }
    const mod = await this[tree_].load()
    if (mod == null) return await this[tree_].entries()
    if (typeof mod === 'object' && mod != null) {
      if (Symbol.iterator in mod || 'entries' in mod) {
        return mod as minissg.Module
      }
    }
    return {
      default: delay(
        async () =>
          await this[tree_].memo.run(
            async () => await this[tree_].self.render(mod)
          )
      )
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Base> {
    for (const [, page] of await this[tree_].entries()) yield page
  }

  declare parsePath: (this: Base, path: string) => Readonly<PathInfo>
  declare paginatePath: (this: Base, index: number) => Readonly<PathInfo>
  declare render: (this: Base, module: ModuleType) => Awaitable<minissg.Content>
  declare readonly type: 'page'
}

safeDefineProperty(Page.prototype, 'parsePath', {
  configurable: true,
  writable: true,
  value: defaultParsePath
})
safeDefineProperty(Page.prototype, 'paginatePath', {
  configurable: true,
  writable: true,
  value: defaultPaginatePath
})
safeDefineProperty(Page.prototype, 'render', {
  configurable: true,
  writable: true,
  value: defaultRender
})
safeDefineProperty(Page.prototype, 'type', {
  configurable: true,
  writable: true,
  value: 'page'
})
