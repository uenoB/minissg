import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'
import { type Pairs, type Items, iteratePairs, listItems } from './items'
import { type Delay, delay } from './delay'
import { PathSteps } from './filename'
import { type Asset, type AssetModule, Directory } from './directory'
import type { RelPath, Tree, DirectoryTree } from './tree'
import { tree_, TreeFactory, AssetTree } from './tree'

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

export interface Paginate<Item = unknown, This = Page> {
  pages: Array<Paginate<Item, This>>
  page: This
  pageIndex: number // starts from 0
  itemIndex: number // starts from 0
  items: Item[] // up to `pageSize` items
  numAllItems: number
}

interface NewArg<ModuleType, Base> {
  url?: URL | string | Null
  render?:
    | ((this: Base, module: ModuleType) => Awaitable<minissg.Content>)
    | Null
  parsePath?: ((this: Base, path: string) => Readonly<PathInfo>) | Null
  paginatePath?: ((this: Base, index: number) => Readonly<PathInfo>) | Null
  Base?: (new (...args: never) => Base) | Null
}

interface TemplateArg<ModuleType, Base, This> extends NewArg<ModuleType, Base> {
  init: (page: This) => Awaitable<Base>
}

interface ModuleArg<ModuleType, Base, This> extends NewArg<ModuleType, Base> {
  pages?: Pairs<() => Awaitable<ModuleType>, Base> | Null
  substPath?: ((this: This, path: string) => Awaitable<string>) | Null
  assets?: Pairs<(() => Awaitable<AssetModule>) | string | Null, Base> | Null
}

interface PaginateArg<Item, ModuleType, Base, This>
  extends NewArg<ModuleType, Base> {
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

const allocPage = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
>(
  ThisFn: PageConstructor<ModuleType, Base, This, Args>,
  arg: Readonly<NewArg<ModuleType, Base>>,
  args: Args,
  init: (page: This) => Tree<ModuleType, Base>
): This => {
  class Init extends PageArg<ModuleType, Base> {
    override [init_](page: This): void {
      safeDefineProperty(page, tree_, { value: init(page) })
      if (arg.parsePath != null) page.parsePath = arg.parsePath
      if (arg.paginatePath != null) page.paginatePath = arg.paginatePath
      if (arg.render != null) page.render = arg.render
    }
  }
  return new ThisFn(new Init(), ...args)
}

const createSubpage = <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base
>(
  tree: Tree<ModuleType, Base, This>,
  dir: DirectoryTree<ModuleType, Base, This>,
  load: () => Awaitable<ModuleType>,
  relPath: Readonly<RelPath>
): This => {
  const arg = { Base: tree.Base, relPath }
  const page: This = Object.create(tree.self) as typeof tree.self
  const subtree = new TreeFactory(arg, page, load)
  safeDefineProperty(page, tree_, { value: subtree })
  dir.fileNameMap.addRoute(relPath.fileName, subtree)
  dir.moduleNameMap.addRoute(relPath.moduleName, subtree)
  dir.stemMap.addRoute(relPath.stem, subtree)
  return page
}

const moduleDirectory = async <
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base
>(
  tree: Tree<ModuleType, Base, This>,
  arg: Readonly<ModuleArg<ModuleType, Base, This>>
): Promise<DirectoryTree<ModuleType, Base, This>> => {
  const page = tree.self
  const dir: DirectoryTree<ModuleType, Base, This> = new Directory()
  const substPath = (path: string): Awaitable<string> =>
    arg.substPath == null ? path : Reflect.apply(arg.substPath, page, [path])
  if (arg.pages != null) {
    for await (const [rawPath, load] of iteratePairs(arg.pages, page)) {
      const info = page.parsePath(PathSteps.normalize(await substPath(rawPath)))
      createSubpage(tree, dir, load, makeRelPath(rawPath, info))
    }
  }
  if (arg.assets != null) {
    for await (const [rawPath, rawLoad] of iteratePairs(arg.assets, page)) {
      const asset = new AssetTree(tree, rawLoad ?? (await substPath(rawPath)))
      dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(rawPath), asset)
    }
  }
  return dir
}

const paginateDirectory = async <
  Item,
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base = Base
>(
  tree: TreeFactory<ModuleType, Base, This>,
  arg: Readonly<PaginateArg<Item, ModuleType, Base, This>>
): Promise<DirectoryTree<ModuleType, Base, This>> => {
  const parent = tree.self
  const dir: DirectoryTree<ModuleType, Base, This> = new Directory()
  const pageSize = arg.pageSize ?? 10
  if (pageSize <= 0) return dir
  const allItems = await listItems(arg.items, parent)
  const loadFn = arg.load
  const numAllItems = allItems.length
  const numPages = Math.ceil(numAllItems / pageSize)
  const pages: Array<Paginate<Item, This>> = []
  for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
    const itemIndex = pageIndex * pageSize
    const items = allItems.slice(itemIndex, itemIndex + pageSize)
    const page = undefined as unknown as This // dummy
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

  static template<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<TemplateArg<ModuleType, Base, This>>,
    ...args: Args
  ): This {
    return allocPage(this, arg, args, page => {
      const memo = new WeakMap<Base, ModuleType>()
      const init = arg.init
      const load = (inst: This): Awaitable<ModuleType> => {
        const cached = memo.get(inst)
        if (cached != null) return cached
        const module = { entries: () => Reflect.apply(init, page, [inst]) }
        memo.set(inst, module as ModuleType)
        return module as ModuleType
      }
      const treeArg = { Base: arg.Base ?? this, url: arg.url }
      return new TreeFactory<ModuleType, Base, This>(treeArg, page, load)
    })
  }

  static module<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<ModuleArg<ModuleType, Base, This>>,
    ...args: Args
  ): This {
    return allocPage(this, arg, args, page => {
      const dir: Delay<DirectoryTree<ModuleType, Base, This>> = delay(
        async () => await moduleDirectory(tree, arg)
      )
      const treeArg = { Base: arg.Base ?? this, url: arg.url }
      const tree = new TreeFactory<ModuleType, Base, This>(treeArg, page, dir)
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
    arg: Readonly<PaginateArg<Item, ModuleType, Base, This>>,
    ...args: Args
  ): This {
    return allocPage(this, arg, args, page => {
      const dir: Delay<DirectoryTree<ModuleType, Base, This>> = delay(
        async () => await paginateDirectory(tree, arg)
      )
      const treeArg = { Base: this, url: arg.url }
      const tree = new TreeFactory<ModuleType, Base, This>(treeArg, page, dir)
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

  async subpages(): Promise<Array<Page<ModuleType, Base>>> {
    return (await this[tree_].entries()).map(([, page]) => page)
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
