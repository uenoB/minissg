import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { lazy } from '../../vite-plugin-minissg/src/util'
import { type Pairs, type List, iteratePairs, listItems } from './items'
import { constProp } from './util'
import { type Delay, delay } from './delay'
import { type RelPath, PathSteps, concatFileName } from './filename'
import { type Asset, type AssetModule, AssetAbst } from './asset'
import type { Loaded, MainModule, Dir, TreeNode, Inst } from './tree'
import { Tree, TreeAbstImpl } from './tree'

const dummyRelPath: Readonly<RelPath> = {
  moduleName: '',
  stem: '',
  variant: '',
  fileName: ''
}

export interface Paginate<Item = unknown, This = Page> {
  pages: ReadonlyArray<Paginate<Item, This>>
  page: This
  pageIndex: number // starts from 0
  itemIndex: number // starts from 0
  items: readonly Item[] // up to `pageSize` items
  numAllItems: number
}

type ParsePath = Omit<Readonly<Partial<RelPath>>, 'fileName'>

interface NewArg<Base, This, Impl> {
  url?: Readonly<URL> | string | Null
  parsePath?: ((this: This, path: string) => ParsePath) | Null
  paginatePath?: ((this: This, index: number) => Readonly<RelPath>) | Null
  initialize?: ((this: Inst<Base, This>) => Awaitable<void>) | Null
  render?:
    | ((this: Inst<Base, This>, module: Impl) => Awaitable<minissg.Content>)
    | Null
}

type PairKey = string | RelPath
type Load<This, Impl> = (page: This) => Loaded<Impl>
type LoadAsset = () => Awaitable<AssetModule>

interface ModuleArg<Base, This, Impl> extends NewArg<Base, This, Impl> {
  pages?: Pairs<PairKey, Load<This, Impl> | MainModule, This> | Null
  substitutePath?: ((this: This, path: string) => Awaitable<string>) | Null
  assets?: Pairs<string, LoadAsset | string | Null, This> | Null
}

interface PaginateArg<Item, Base, This, Impl> extends NewArg<Base, This, Impl> {
  items: List<Item, This>
  load: (this: This, paginate: Paginate<Item, This>) => Loaded<Impl>
  pageSize?: number | Null
}

interface PageConstructor<Base, This, Args extends unknown[]> {
  Base: abstract new (...args: never) => Base
  new (...args: Args): This
}

class PageFactory<
  Base extends Page<unknown, Base>,
  This extends Base,
  Impl,
  Args extends unknown[]
> {
  readonly basis: This
  readonly abst: TreeAbstImpl<Base, This, Impl>

  constructor(
    This: PageConstructor<Base, This, Args>,
    arg: NewArg<Base, This, Impl>,
    args: Args,
    content: TreeAbstImpl<Base, This, Impl>['content']
  ) {
    this.basis = new This(...args)
    if (arg.parsePath != null) {
      constProp(this.basis, 'parsePath', arg.parsePath)
    }
    if (arg.paginatePath != null) {
      constProp(this.basis, 'paginatePath', arg.paginatePath)
    }
    if (arg.render != null) {
      constProp(this.basis, 'render', arg.render)
    }
    if (arg.initialize != null) {
      constProp(this.basis, 'initialize', arg.initialize)
    }
    const init = {
      rootURL: arg.url != null ? new URL(arg.url) : undefined,
      fileName: TreeAbstImpl.currentFileName(),
      basis: this.basis,
      content,
      Base: This.Base
    }
    this.abst = TreeAbstImpl.decorate<Base, This, Impl>(init)
  }

  createSubpage(
    dir: Dir<Base>,
    content: TreeAbstImpl<Base, This, Impl>['content'],
    relPath: Readonly<RelPath>
  ): TreeAbstImpl<Base, This, Impl> {
    const arg = {
      rootURL: this.abst.rootURL,
      fileName: concatFileName(this.abst.fileName, relPath?.fileName),
      basis: this.basis,
      content,
      Base: this.abst.Base
    }
    const abst = TreeAbstImpl.decorate(arg)
    dir.addRoute(abst, relPath)
    return abst
  }

  async createModuleDirectory(
    arg: Readonly<ModuleArg<Base, This, Impl>>
  ): Promise<Dir<Base>> {
    const dir = TreeAbstImpl.createDirectory<Base>()
    const substPath = (path: string): Awaitable<string> =>
      arg.substitutePath != null
        ? Reflect.apply(arg.substitutePath, this.basis, [path])
        : path
    if (arg.pages != null) {
      for await (const [path, load] of iteratePairs(arg.pages, this.basis)) {
        let relPath: Readonly<RelPath>
        if (typeof path !== 'string') {
          relPath = path
        } else {
          const srcPath = PathSteps.normalize(await substPath(path))
          const parsed = this.basis.parsePath(srcPath)
          relPath = {
            moduleName: parsed.moduleName ?? '',
            stem: parsed.stem ?? '',
            variant: parsed.variant ?? '',
            fileName: PathSteps.normalize(path)
          }
        }
        const abst = this.abst.getTreeAbst(load)
        if (abst != null) {
          dir.addRoute(abst, relPath)
        } else if (typeof load === 'function') {
          this.createSubpage(dir, load, relPath)
        } else {
          this.createSubpage(dir, () => load, relPath)
        }
      }
    }
    if (arg.assets != null) {
      for await (const [path, load] of iteratePairs(arg.assets, this.basis)) {
        const loader = load ?? (await substPath(path))
        const abst = new AssetAbst<TreeNode<Base>>(loader)
        const pair = { abst, relPath: dummyRelPath }
        dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(path), pair)
      }
    }
    return dir
  }

  async createPaginateDirectory<Item>(
    arg: Readonly<PaginateArg<Item, Base, This, Impl>>
  ): Promise<Dir<Base>> {
    const dir = TreeAbstImpl.createDirectory<Base>()
    const rawPageSize = arg.pageSize ?? 10
    const pageSize = rawPageSize >= 1 ? rawPageSize : 1
    const load = arg.load
    const allItems = await listItems(arg.items, this.abst.basis)
    const numAllItems = allItems.length
    const numPages = Math.ceil(numAllItems / pageSize)
    const pages: Array<Paginate<Item, This>> = []
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const itemIndex = pageIndex * pageSize
      const items = allItems.slice(itemIndex, itemIndex + pageSize)
      const relPath = this.abst.basis.paginatePath(pageIndex)
      const page = undefined as unknown as This // dummy
      const pagi = { pages, page, pageIndex, items, itemIndex, numAllItems }
      const content = (): Loaded<Impl> => Reflect.apply(load, pagi.page, [pagi])
      pagi.page = this.createSubpage(dir, content, relPath).basis
      pages.push(pagi)
    }
    return dir
  }
}

interface PageRec extends Page<unknown, PageRec> {}

export class Page<
  Impl = unknown,
  Base extends Page<unknown, Base> = PageRec
> extends Tree<Base, Base, Impl> {
  static Base: abstract new (...args: never) => PageRec = this

  static module<
    Impl,
    Base extends Page<unknown, Base> = PageRec,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    // I'm not sure why but `Page<...> & ...` makes type inference better.
    this: PageConstructor<Base, Page<Impl, Base> & This, Args>,
    arg: Readonly<ModuleArg<Base, Page<Impl, Base> & This, Impl>> = {},
    ...args: Args
  ): This {
    type F = PageFactory<Base, Page<Impl, Base> & This, Impl, Args>
    const dir = lazy(async () => await factory.createModuleDirectory(arg))
    const factory: F = new PageFactory(this, arg, args, dir)
    return factory.abst.basis
  }

  static paginate<
    Item,
    Impl,
    Base extends Page<unknown, Base> = PageRec,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<Base, Page<Impl, Base> & This, Args>,
    arg: Readonly<PaginateArg<Item, Base, Page<Impl, Base> & This, Impl>>,
    ...args: Args
  ): This {
    type F = PageFactory<Base, Page<Impl, Base> & This, Impl, Args>
    const dir = lazy(async () => await factory.createPaginateDirectory(arg))
    const factory: F = new PageFactory(this, arg, args, dir)
    return factory.abst.basis
  }

  parsePath(fileName: string): ParsePath {
    const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(fileName)
    const variant = (m?.[1] ?? '').replace(/\./g, '/')
    const stemBase = fileName.slice(0, m?.index ?? fileName.length)
    const stem = stemBase === '' ? stemBase : stemBase + '/'
    const name = /(?:^|\/|\.[^./]*)$/.test(stemBase) ? stemBase : stem
    const moduleName = variant === '' ? name : variant + '/' + name
    return { moduleName, stem, variant }
  }

  paginatePath(index: number): Readonly<RelPath> {
    const moduleName = index === 0 ? './' : `${index + 1}/`
    const fileName = `${index + 1}`
    return { moduleName, stem: moduleName, variant: '', fileName }
  }

  declare readonly type: 'page'

  static {
    constProp(this.prototype, 'type', 'page')
  }

  static delay = delay
}

type AssetTy = Asset
type DelayTy<X> = Delay<X>
type RelPathTy = RelPath
type InstTy<Base, This = Base> = Inst<Base, This>
type PaginateTy = Paginate
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Page {
  export type Asset = AssetTy
  export type Delay<X> = DelayTy<X>
  export type RelPath = RelPathTy
  export type Inst<Base, This = Base> = InstTy<Base, This>
  export type Paginate = PaginateTy
}
