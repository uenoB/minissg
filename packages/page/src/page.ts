import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'
import { type Tuples, type Items, iterateTuples, listItems } from './items'
import { type Delay, delay } from './delay'
import { PathSteps } from './filename'
import { type Asset, Directory } from './directory'
import { type PageAllocator, type RelPath, Tree, tree_ } from './tree'

export interface PathInfo {
  stem: string
  variant: string
  relURL: string
}

const makeRelPath = (fileName: string, pathInfo: PathInfo): RelPath => ({
  fileName: PathSteps.fromRelativeFileName(fileName),
  moduleName: PathSteps.fromRelativeModuleName(pathInfo.relURL),
  stem: PathSteps.fromRelativeModuleName(pathInfo.stem),
  variant: PathSteps.fromRelativeModuleName(pathInfo.variant)
})

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

const inheritMethod = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  Key extends 'parsePath' | 'paginatePath' | 'render'
>(
  key: Key,
  defaultFn: Base[Key]
) =>
  function (this: Base, ...args: Parameters<Base[Key]>): ReturnType<Base[Key]> {
    let t: Tree<ModuleType, Base> | undefined
    for (let t = this[tree_].parent; t != null; t = t.parent) {
      if (t.self[key] !== this[key]) break
    }
    const f = t?.self[key] ?? defaultFn
    return Reflect.apply(f, this, args) as ReturnType<Base[Key]>
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
  dir: Directory<Tree<ModuleType, Base>>,
  load: (() => Awaitable<{ default: string }>) | string,
  steps: PathSteps
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
  dir.fileNameMap.addRoute(steps, { self: asset })
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

const init_: unique symbol = Symbol('init')

export abstract class PageArg<ModuleType, Base extends Page<ModuleType, Base>> {
  abstract [init_](self: Page<ModuleType, Base>): void
}

type PageConstructor<
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
> = new (arg: PageArg<ModuleType, Base>, ...args: Args) => This

const allocPage =
  <
    ModuleType,
    Base extends Page<ModuleType, Base>,
    This extends Base,
    Args extends unknown[]
  >(
    ThisFn: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<NewArg<ModuleType, Base>>,
    args: Args
  ): PageAllocator<ModuleType, Base, This> =>
  init => {
    class Init extends PageArg<ModuleType, Base> {
      override [init_](page: Base): void {
        safeDefineProperty(page, tree_, { value: init(page) })
        if (arg.parsePath != null) page.parsePath = arg.parsePath
        if (arg.paginatePath != null) page.paginatePath = arg.paginatePath
        if (arg.render != null) page.render = arg.render
      }
    }
    return new ThisFn(new Init(), ...args)
  }

const createSubpage = <ModuleType, Base extends Page<ModuleType, Base>>(
  parent: Tree<ModuleType, Base>,
  dir: Directory<Tree<ModuleType, Base>>,
  content: () => Awaitable<ModuleType>,
  relPath: Readonly<RelPath>
): Base => {
  const arg = { alloc: parent.alloc, content, relPath }
  const tree = parent.alloc(page => new Tree(undefined, page, arg))[tree_]
  dir.fileNameMap.addRoute(relPath.fileName, tree)
  dir.moduleNameMap.addRoute(relPath.moduleName, tree)
  dir.stemMap.addRoute(relPath.stem, tree)
  return tree.self
}

const moduleDirectory = async <ModuleType, Base extends Page<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  arg: Readonly<ModuleArg<ModuleType, Base>>
): Promise<Directory<Tree<ModuleType, Base>>> => {
  const page = tree.self
  const dir = new Directory<Tree<ModuleType, Base>>()
  const substPath = (path: string): Awaitable<string> =>
    arg.substPath == null ? path : Reflect.apply(arg.substPath, page, [path])
  if (arg.pages != null) {
    for await (const [rawPath, load] of iterateTuples(arg.pages, page)) {
      const info = page.parsePath(PathSteps.normalize(await substPath(rawPath)))
      createSubpage(tree, dir, load, makeRelPath(rawPath, info))
    }
  }
  if (arg.assets != null) {
    for await (const [rawPath, rawLoad] of iterateTuples(arg.assets, page)) {
      const load = rawLoad ?? (await substPath(rawPath))
      createAsset(tree, dir, load, PathSteps.fromRelativeFileName(rawPath))
    }
  }
  return dir
}

const paginateDirectory = async <
  Item,
  ModuleType,
  Base extends Page<ModuleType, Base>
>(
  tree: Tree<ModuleType, Base>,
  arg: Readonly<PaginateArg<Item, ModuleType, Base>>
): Promise<Directory<Tree<ModuleType, Base>>> => {
  const parent = tree.self
  const dir = new Directory<Tree<ModuleType, Base>>()
  const pageSize = arg.pageSize ?? 10
  if (pageSize <= 0) return dir
  const allItems = await listItems(arg.items, parent)
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
    const pathInfo = parent.paginatePath(pageIndex)
    const relPath = makeRelPath('', pathInfo)
    const subpage = createSubpage(tree, dir, load, relPath)
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
    const alloc = allocPage(this, arg, args)
    return alloc(page => {
      const content: Delay<Directory<Tree<ModuleType, Base>>> = delay(
        async () => await moduleDirectory(tree, arg)
      )
      const tree = new Tree(undefined, page, { url: arg.url, alloc, content })
      return tree
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
    const alloc = allocPage(this, arg, args)
    return alloc(page => {
      const content: Delay<Directory<Tree<ModuleType, Base>>> = delay(
        async () => await paginateDirectory(tree, arg)
      )
      const tree = new Tree(undefined, page, { url: arg.url, alloc, content })
      return tree
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
    return this[tree_].fileName.path
  }

  get variant(): string {
    return this[tree_].variant.path
  }

  get moduleName(): minissg.ModuleName {
    return this[tree_].moduleName
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

  async entries(context: Readonly<minissg.Context>): Promise<minissg.Module> {
    const page = this[tree_].instantiate(context)?.self
    if (page != null) return page
    const mod = await this[tree_].load()
    if (mod == null) return this[tree_]
    if (typeof mod === 'object' && mod != null) {
      if ('entries' in mod && typeof mod.entries === 'function') {
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

  async subpages(): Promise<Base[]> {
    return (await this[tree_].entries()).map(([, page]) => page)
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
  value: inheritMethod('parsePath', defaultParsePath)
})
safeDefineProperty(Page.prototype, 'paginatePath', {
  configurable: true,
  writable: true,
  value: inheritMethod('paginatePath', defaultPaginatePath)
})
safeDefineProperty(Page.prototype, 'render', {
  configurable: true,
  writable: true,
  value: inheritMethod('render', defaultRender)
})
safeDefineProperty(Page.prototype, 'type', {
  configurable: true,
  writable: true,
  value: 'page'
})
