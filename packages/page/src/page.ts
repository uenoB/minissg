import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { hasMinissgEntries, safeDefineProperty } from './util'
import { type Pairs, type Items, iteratePairs, listItems } from './items'
import { type Delay, delay } from './delay'
import { type Init, Factory } from './factory'
import { PathSteps } from './filename'
import { type AssetModule, Asset } from './asset'
import { Directory, tree_ } from './directory'
import { type RelPath, Tree, TreeFactory } from './tree'

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
  if (mod instanceof Uint8Array) return mod
  if (typeof mod !== 'object') return `[${typeof mod}]`
  if ('default' in mod) return mod.default as minissg.Content
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return Reflect.apply(Object.prototype.toString, mod, [])
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
    let t: Base[typeof tree_] | undefined
    for (let t = this[tree_].parent; t != null; t = t.parent) {
      if (t.module[key] !== this[key]) break
    }
    const f = t?.module[key] ?? defaultFn
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
  pages?: Pairs<(page: This) => Awaitable<ModuleType>, Base> | Null
  substPath?: ((this: This, path: string) => Awaitable<string>) | Null
  assets?: Pairs<(() => Awaitable<AssetModule>) | string | Null, Base> | Null
}

interface PaginateArg<Item, ModuleType, Base, This>
  extends NewArg<ModuleType, Base> {
  items: Items<Item, This>
  load: (this: This, paginate: Paginate<Item, This>) => Awaitable<ModuleType>
  pageSize?: number | Null
}

export type PageArg<
  ModuleType = unknown,
  Base extends Page<ModuleType, Base> = PageRec<ModuleType>
> = Init<Page<ModuleType, Base>>

class PageFactory<
  ModuleType,
  Base extends Page<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
> extends TreeFactory<ModuleType, Base, This, Args> {
  readonly arg: NewArg<ModuleType, Base>

  constructor(
    factory: TreeFactory<ModuleType, Base, This, Args>['factory'],
    arg: NewArg<ModuleType, Base>,
    content: TreeFactory<ModuleType, Base, This, Args>['content']
  ) {
    super(factory, content)
    this.arg = arg
  }

  override init(page: This): void {
    if (this.arg.parsePath != null) page.parsePath = this.arg.parsePath
    if (this.arg.paginatePath != null) page.paginatePath = this.arg.paginatePath
    if (this.arg.render != null) page.render = this.arg.render
  }

  createSubpage(
    dir: Directory<Base, Asset, This>,
    load: (page: This) => Awaitable<ModuleType>,
    relPath: Readonly<RelPath>
  ): This {
    const factory = new PageFactory(this.factory, this.arg, load)
    const page = factory.create({ relPath })
    dir.fileNameMap.addRoute(relPath.fileName, page)
    dir.moduleNameMap.addRoute(relPath.moduleName, page)
    dir.stemMap.addRoute(relPath.stem, page)
    return page
  }

  async createModuleDirectory(
    self: This,
    arg: Readonly<ModuleArg<ModuleType, Base, This>>
  ): Promise<Directory<Base, Asset, This>> {
    const dir = new Directory<Base, Asset, This>()
    const substPath = (path: string): Awaitable<string> =>
      arg.substPath == null ? path : Reflect.apply(arg.substPath, self, [path])
    if (arg.pages != null) {
      for await (const [rawPath, load] of iteratePairs(arg.pages, self)) {
        const info = self.parsePath(
          PathSteps.normalize(await substPath(rawPath))
        )
        this.createSubpage(dir, load, makeRelPath(rawPath, info))
      }
    }
    if (arg.assets != null) {
      for await (const [rawPath, rawLoad] of iteratePairs(arg.assets, self)) {
        const load = rawLoad ?? (await substPath(rawPath))
        const asset = new Asset(self[tree_], load)
        dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(rawPath), asset)
      }
    }
    return dir
  }

  async createPaginateDirectory<Item>(
    self: This,
    arg: Readonly<PaginateArg<Item, ModuleType, Base, This>>
  ): Promise<Directory<Base, Asset, This>> {
    const dir = new Directory<Base, Asset, This>()
    const pageSize = arg.pageSize ?? 10
    if (pageSize <= 0) return dir
    const allItems = await listItems(arg.items, self)
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
      const pathInfo = self.paginatePath(pageIndex)
      const relPath = makeRelPath('', pathInfo)
      const subpage = this.createSubpage(dir, load, relPath)
      pagi.page = subpage
      pages.push(pagi)
    }
    return dir
  }
}

// workaround for typescript-eslint: without this,
// @typescript-eslint/no-unsafe-assignment causes an infinite recursive call.
type EslintWorkaround<X> = { [K in keyof X]: X[K] }

type PageRec<X> = Page<X, EslintWorkaround<PageRec<X>>>

export class Page<
  ModuleType = unknown,
  Base extends Page<ModuleType, Base> = PageRec<ModuleType>
> extends Tree<ModuleType, Base> {
  static template<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: new (arg: PageArg<ModuleType, Base>, ...args: Args) => This,
    arg: Readonly<TemplateArg<ModuleType, Base, This>>,
    ...args: Args
  ): This {
    const memo = new WeakMap<Base, ModuleType>()
    const init = arg.init
    const load = (inst: This): Awaitable<ModuleType> => {
      const cached = memo.get(inst)
      if (cached != null) return cached
      const entries: minissg.Entries = () => Reflect.apply(init, page, [inst])
      const module = { entries }
      memo.set(inst, module as ModuleType)
      return module as ModuleType
    }
    const factory = new PageFactory(new Factory(this, args), arg, load)
    const page = factory.create({ url: arg.url, Base: arg.Base })
    return page
  }

  static module<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: new (arg: PageArg<ModuleType, Base>, ...args: Args) => This,
    arg: Readonly<ModuleArg<ModuleType, Base, This>>,
    ...args: Args
  ): This {
    const dir: PromiseLike<Directory<Base, Asset, This>> = delay(
      async () => await factory.createModuleDirectory(page, arg)
    )
    const factory = new PageFactory(new Factory(this, args), arg, dir)
    const page = factory.create({ url: arg.url, Base: arg.Base })
    return page
  }

  static paginate<
    Item,
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: new (arg: PageArg<ModuleType, Base>, ...args: Args) => This,
    arg: Readonly<PaginateArg<Item, ModuleType, Base, This>>,
    ...args: Args
  ): This {
    const dir: PromiseLike<Directory<Base, Asset, This>> = delay(
      async () => await factory.createPaginateDirectory(page, arg)
    )
    const factory = new PageFactory(new Factory(this, args), arg, dir)
    const page = factory.create({ url: arg.url, Base: arg.Base })
    return page
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
    return this[tree_].parent?.module
  }

  get root(): Base {
    return this[tree_].root.module
  }

  load(): Delay<ModuleType> | undefined {
    return this[tree_].load()
  }

  async subpages(): Promise<Base[]> {
    return await this[tree_].subpages()
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    const tree = this[tree_]
    return tree.memo.memoize(tree.findByModuleName, tree, path)
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    const tree = this[tree_]
    return tree.memo.memoize(tree.findByFileName, tree, path)
  }

  find(path: string): Delay<Base | Asset | undefined> {
    const tree = this[tree_]
    return tree.memo.memoize(tree.find, tree, path)
  }

  variants(): Delay<Set<Base>> {
    const tree = this[tree_]
    return tree.memo.memoize(tree.variants, tree)
  }

  override async entries(
    context: Readonly<minissg.Context>
  ): Promise<minissg.Module> {
    const page = this[tree_].instantiate(context)
    if (page != null) return page
    const module = await this[tree_].load()
    if (module == null) return await super.entries(context)
    if (typeof module === 'object' && hasMinissgEntries(module)) return module
    return {
      default: delay(
        async () =>
          await this[tree_].memo.run(
            async () => await this[tree_].module.render(module)
          )
      )
    }
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
