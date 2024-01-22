import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'
import { type Pairs, type Items, iteratePairs, listItems } from './items'
import { type Delay, delay } from './delay'
import { type PathInfo, type RelPath, PathSteps, makeRelPath } from './filename'
import { AssetFactory } from './asset'
import type { AssetModule, Asset, AssetImpl } from './asset'
import { Directory, tree_ } from './directory'
import { Tree, TreeFactoryArgImpl } from './tree'
import type { TreeFactoryArg, TreeInstance, TreeFactory } from './tree'

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
  initialize?: ((this: This) => void) | Null
}

interface ModuleArg<ModuleType, Base, This = Base>
  extends NewArg<ModuleType, This> {
  pages?: Pairs<((page: This) => Awaitable<ModuleType>) | Base, This> | Null
  substitutePath?: ((this: This, path: string) => Awaitable<string>) | Null
  assets?: Pairs<(() => Awaitable<AssetModule>) | string | Null, This> | Null
}

interface PaginateArg<Item, ModuleType, This> extends NewArg<ModuleType, This> {
  items: Items<Item, This>
  load: (this: This, paginate: Paginate<Item, This>) => Awaitable<ModuleType>
  pageSize?: number | Null
}

const init_: unique symbol = Symbol('init')

export interface PageArg<ModuleType, Base extends Tree<ModuleType, Base>> {
  readonly [init_]: TreeFactoryArg<ModuleType, Base>
}

interface PageConstructor<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base,
  Args extends unknown[] = never
> {
  new (arg: PageArg<ModuleType, Base>, ...args: Args): This
  Base: abstract new (...args: never) => Base
}

class PageFactory<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base,
  Args extends unknown[]
> {
  readonly factory: TreeFactoryArgImpl<ModuleType, Base, This>
  readonly page: This

  constructor(
    This: PageConstructor<ModuleType, Base, This, Args>,
    arg: NewArg<ModuleType, This>,
    args: Args,
    content: TreeFactoryArgImpl<ModuleType, Base, This>['content'],
    relPath?: TreeFactoryArgImpl<ModuleType, Base, This>['relPath']
  ) {
    const factory = new TreeFactoryArgImpl(relPath, arg.url, This, content)
    this.factory = factory
    const pageArg = Object.create(null) as { [init_]: typeof factory }
    safeDefineProperty(pageArg, init_, { value: factory })
    this.page = new This(pageArg, ...args)
    this.#override('parsePath', arg)
    this.#override('paginatePath', arg)
    this.#override('render', arg)
    this.#override('initialize', arg)
  }

  #override<K extends keyof This>(
    key: K,
    orig: { [P in K]?: This[K] | Null }
  ): void {
    if (orig[key] == null) return
    safeDefineProperty(this.page, key, {
      configurable: true,
      writable: true,
      value: orig[key]
    })
  }

  createSubpage(
    dir: Directory<Base, AssetImpl, This>,
    load: (page: TreeInstance<ModuleType, Base, This>) => Awaitable<ModuleType>,
    relPath: Readonly<RelPath>
  ): TreeFactory<ModuleType, Base, This> {
    const page = this.factory.createFactory(this.page, load, relPath)
    dir.fileNameMap.addRoute(relPath.fileName, page)
    dir.moduleNameMap.addRoute(relPath.moduleName, page)
    dir.stemMap.addRoute(relPath.stem, page)
    return page
  }

  async createModuleDirectory(
    arg: Readonly<ModuleArg<ModuleType, Base, This>>
  ): Promise<Directory<Base, AssetImpl, This>> {
    const dir = new Directory<Base, AssetImpl, This>()
    const substPath = (path: string): Awaitable<string> =>
      arg.substitutePath != null
        ? Reflect.apply(arg.substitutePath, this.page, [path])
        : path
    const constant = (x: unknown) => () => x as ModuleType
    if (arg.pages != null) {
      for await (const [rawPath, load] of iteratePairs(arg.pages, this.page)) {
        const content = typeof load === 'function' ? load : constant(load)
        const path = PathSteps.normalize(await substPath(rawPath))
        const info = this.page.parsePath(path)
        this.createSubpage(dir, content, makeRelPath(rawPath, info))
      }
    }
    if (arg.assets != null) {
      for await (const [rawPath, load] of iteratePairs(arg.assets, this.page)) {
        const loader = load ?? (await substPath(rawPath))
        const asset = new AssetFactory(this.page[tree_], loader)
        dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(rawPath), asset)
      }
    }
    return dir
  }

  async createPaginateDirectory<Item>(
    arg: Readonly<PaginateArg<Item, ModuleType, This>>
  ): Promise<Directory<Base, AssetImpl, This>> {
    type Inst = TreeInstance<ModuleType, Base, This>
    type Subpage = TreeFactory<ModuleType, Base, This>
    const dir = new Directory<Base, AssetImpl, This>()
    const pageSize = arg.pageSize ?? 10
    if (pageSize <= 0) return dir
    const allItems = await listItems(arg.items, this.page)
    const loadFn = arg.load
    const numAllItems = allItems.length
    const numPages = Math.ceil(numAllItems / pageSize)
    const subpages: Array<Paginate<Item, Subpage>> = []
    const instances = new WeakMap<object, Paginate<Item, Inst>>()
    const instantiate = (inst: Inst, i: number): Paginate<Item, Inst> => {
      const cached = instances.get(inst)
      if (cached != null) return cached
      const pages: Array<Paginate<Item, Inst>> = []
      for (const origPagi of subpages) {
        const page = origPagi.page[tree_].instantiate(inst[tree_].parent)
        const pagi = { ...origPagi, pages, page }
        instances.set(page, pagi)
        pages.push(pagi)
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return pages[i]!
    }
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const pages = subpages
      const itemIndex = pageIndex * pageSize
      const items = allItems.slice(itemIndex, itemIndex + pageSize)
      const pathInfo = this.page.paginatePath(pageIndex)
      const filePath = pageIndex === 0 ? '' : `./${pageIndex + 1}`
      const relPath = makeRelPath(filePath, pathInfo)
      const load = (inst: Inst): Awaitable<ModuleType> => {
        const pagi = instantiate(inst, pageIndex)
        return Reflect.apply(loadFn, pagi.page, [pagi])
      }
      const page = this.createSubpage(dir, load, relPath)
      subpages.push({ pages, page, pageIndex, items, itemIndex, numAllItems })
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
  static Base: new (...args: never) => Page<unknown, PageRec<unknown>> = this

  constructor(arg: PageArg<ModuleType, Base>) {
    super(arg[init_])
  }

  static module<
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = never
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<ModuleArg<ModuleType, Base, This>> = {},
    ...args: Args
  ): This {
    type T = PageFactory<ModuleType, Base, This, Args>
    const dir = delay(async () => await factory.createModuleDirectory(arg))
    const factory: T = new PageFactory(this, arg, args, dir)
    return factory.page
  }

  static paginate<
    Item,
    ModuleType = unknown,
    Base extends Page<ModuleType, Base> = PageRec<ModuleType>,
    This extends Base = Base,
    Args extends unknown[] = never
  >(
    this: PageConstructor<ModuleType, Base, This, Args>,
    arg: Readonly<PaginateArg<Item, ModuleType, This>>,
    ...args: Args
  ): This {
    type T = PageFactory<ModuleType, Base, This, Args>
    const dir = delay(async () => await factory.createPaginateDirectory(arg))
    const factory: T = new PageFactory(this, arg, args, dir)
    return factory.page
  }

  memoize<Args extends readonly unknown[], Ret>(
    func: (...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    return this[tree_].memo.memoize(func, ...args)
  }

  get url(): Delay<string> {
    return delay.dummy(this[tree_].url?.href ?? 'file:///')
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

  load(): Delay<ModuleType> | undefined {
    return this[tree_].load()
  }

  subpages(): Delay<Iterable<Base>> {
    return this[tree_].subpages()
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

  override parsePath(path: string): Readonly<PathInfo> {
    const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(path)
    const variant = m?.[1] ?? ''
    const stemBase = path.slice(0, m?.index ?? path.length)
    const stem = stemBase + (/(?:^|\/|\.[^./]*)$/.test(stemBase) ? '' : '/')
    const relURL = variant === '' ? stem : variant + '/' + stem
    return { stem, variant, relURL }
  }

  override paginatePath(index: number): Readonly<PathInfo> {
    return index === 0
      ? { stem: `${index + 1}`, variant: '', relURL: './' }
      : { stem: `${index + 1}`, variant: '', relURL: `${index + 1}/` }
  }

  declare readonly type: 'page'

  static {
    safeDefineProperty(this.prototype, 'type', {
      configurable: true,
      writable: true,
      value: 'page'
    })
  }
}
