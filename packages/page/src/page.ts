/*
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { lazy } from '../../vite-plugin-minissg/src/util'
import { type Pairs, type List, iteratePairs, listItems } from './items'
import { constProp } from './util'
import { type RelPath, PathSteps, concatFileName } from './filename'
import { type Asset, type AssetModule, AssetAbst } from './asset'
import type { Loaded, MainModule, Dir, TreeNode, Inst } from './tree'
import { Tree, TreeAbstImpl } from './tree'
*/

import type { Awaitable, Null, Void } from '../../vite-plugin-minissg/src/util'
import { lazy } from '../../vite-plugin-minissg/src/util'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { type Pairs, type List, iteratePairs, listItems } from './items'
import { type RelPath as RelPathTy, PathSteps } from './filename'
import { type Asset as AssetTy, type AssetModule, AssetAbst } from './asset'
import type { TreeNode } from './tree_node'
import { TreeAbst } from './tree_abst'
import { type Dir, Tree, TreeContext, createDirectory } from './tree'
import { constProp } from './util'
import type { MainModule } from './minissg'

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Page {
  export type Asset = AssetTy
  export type RelPath = RelPathTy
  export type ParsePath = Omit<Partial<RelPath>, 'fileName'>
  export interface Paginate<Item, This> {
    pages: ReadonlyArray<Paginate<Item, This>>
    page: This
    pageIndex: number // starts from 0
    itemIndex: number // starts from 0
    items: readonly Item[] // up to `pageSize` items
    numAllItems: number
  }
}

interface NewArg<Load, This> {
  url?: Readonly<URL> | string | Null
  parsePath?: ((this: This, path: string) => Readonly<Page.ParsePath>) | Null
  paginatePath?: ((this: This, index: number) => Readonly<Page.RelPath>) | Null
  initialize?: ((this: This) => MainModule | Void) | Null
  render?: ((this: This, module: Load) => Awaitable<minissg.Content>) | Null
}

type PairKey = string | Page.RelPath
type Loaded<Load> = Awaitable<Load | MainModule>
type LoadFn<This, Load> = (page: This) => Loaded<Load>
type LoadAsset = () => Awaitable<AssetModule>

interface ModulePagesArg<Load, This> extends NewArg<Load, This> {
  pages: Pairs<PairKey, LoadFn<This, Load> | MainModule, This>
  substitutePath?: ((path: string) => Awaitable<string>) | Null
  assets?: Pairs<string, LoadAsset | string | Null, This> | Null
}

interface ModuleNoPagesArg<Load, This> extends NewArg<Load, This> {
  pages?: Null
}

type ModuleArg<This, Load> =
  | ModulePagesArg<Load, This>
  | ModuleNoPagesArg<Load, This>

interface PaginateArg<Item, Load, This> extends NewArg<Load, This> {
  items: List<Item, This>
  pageSize?: number | Null
  load:
    | ((this: This, paginate: Page.Paginate<Item, This>) => Loaded<Load>)
    | MainModule
}

export interface PageConstructor<
  Load,
  Base,
  This extends Base,
  Args extends unknown[]
> {
  new (...args: Args): This & Tree<Base, This, Load>
  Base: abstract new (...args: never) => Base & Tree<Base>
}

class PageFactory<
  Load,
  Base extends Page<unknown, Base>,
  This extends Base,
  Args extends unknown[]
> {
  readonly abst: TreeAbst<Base, This, Load>

  constructor(
    This: PageConstructor<Load, Base, This, Args>,
    arg: NewArg<Load, This>,
    args: Args,
    content: TreeAbst<Base, This, Load>['content']
  ) {
    const create = (): This & Tree<Base, This, Load> => {
      const module = new This(...args)
      if (arg.parsePath != null) {
        constProp(module, 'parsePath', arg.parsePath)
      }
      if (arg.paginatePath != null) {
        constProp(module, 'paginatePath', arg.paginatePath)
      }
      if (arg.render != null) {
        constProp(module, 'render', arg.render)
      }
      if (arg.initialize != null) {
        constProp(module, 'initialize', arg.initialize)
      }
      return module
    }
    const context = new TreeContext<Base, This, Load>(create, This.Base)
    const rootURL = arg.url != null ? new URL(arg.url) : undefined
    this.abst = new TreeAbst<Base, This, Load>({ rootURL, content, context })
  }

  createSubpage(
    dir: Dir<Base>,
    relPath: Readonly<Page.RelPath>,
    content: TreeAbst<Base, This, Load>['content']
  ): TreeAbst<Base, This, Load> {
    const rootURL = this.abst.rootURL
    const context = this.abst.context
    const abst = new TreeAbst({ rootURL, content, context })
    dir.addRoute(relPath, abst)
    return abst
  }

  async createModuleDirectory(
    arg: Readonly<ModulePagesArg<Load, This>>
  ): Promise<Dir<Base>> {
    const dir = createDirectory<Base>()
    const substitutePath = arg.substitutePath
    const self = this.abst.module
    const substPath: (path: string) => Awaitable<string> =
      substitutePath != null
        ? path => Reflect.apply(substitutePath, self, [path])
        : path => path
    for await (const [path, load] of iteratePairs(arg.pages, self)) {
      let relPath: Readonly<Page.RelPath>
      if (typeof path !== 'string') {
        relPath = path
      } else {
        const srcPath = PathSteps.normalize(await substPath(path))
        const parsed = self.parsePath(srcPath)
        relPath = {
          moduleName: parsed.moduleName ?? '',
          stem: parsed.stem ?? '',
          variant: parsed.variant ?? '',
          fileName: PathSteps.normalize(path)
        }
      }
      const abst = this.abst.context.getTreeAbst(load)
      if (abst != null) {
        dir.addRoute(relPath, abst)
      } else if (typeof load === 'function') {
        this.createSubpage(dir, relPath, load)
      } else {
        this.createSubpage(dir, relPath, () => load)
      }
    }
    if (arg.assets != null) {
      for await (const [path, load] of iteratePairs(arg.assets, self)) {
        const loader = load ?? (await substPath(path))
        const abst = new AssetAbst<TreeNode<Base>>(loader)
        const pair = { abst, relPath: null }
        dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(path), pair)
      }
    }
    return dir
  }

  async createPaginateDirectory<Item>(
    arg: Readonly<PaginateArg<Item, Load, This>>
  ): Promise<Dir<Base>> {
    const dir = createDirectory<Base>()
    const rawPageSize = arg.pageSize ?? 10
    const pageSize = rawPageSize >= 1 ? rawPageSize : 1
    const load = arg.load
    const allItems = await listItems(arg.items, this.abst.module)
    const numAllItems = allItems.length
    const numPages = Math.ceil(numAllItems / pageSize)
    const pages: Array<Page.Paginate<Item, This>> = []
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const itemIndex = pageIndex * pageSize
      const items = allItems.slice(itemIndex, itemIndex + pageSize)
      const relPath = this.abst.module.paginatePath(pageIndex)
      const page = undefined as unknown as This // dummy
      const pagi = { pages, page, pageIndex, items, itemIndex, numAllItems }
      const content =
        typeof load === 'function'
          ? (): Loaded<Load> => Reflect.apply(load, pagi.page, [pagi])
          : () => load
      pagi.page = this.createSubpage(dir, relPath, content).module
      pages.push(pagi)
    }
    return dir
  }
}

interface PageRec extends Page<unknown, PageRec, PageRec> {}

export class Page<
  Load = unknown,
  Base extends Page<unknown, Base> = PageRec,
  This extends Base = Base
> extends Tree<Base, This, Load> {
  static Base: abstract new (...args: never) => PageRec = this

  static module<
    Load,
    Base extends Page<unknown, Base> = PageRec,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    // I'm not sure why but `Page<...> & ...` makes type inference better.
    this: PageConstructor<Load, Base, Page<Load, Base> & This, Args>,
    arg: Readonly<ModuleArg<Page<Load, Base> & This, Load>> = {},
    ...args: Args
  ): This {
    type F = PageFactory<Load, Base, Page<Load, Base> & This, Args>
    const dir =
      arg.pages == null
        ? undefined
        : lazy(async () => await factory.createModuleDirectory(arg))
    const factory: F = new PageFactory(this, arg, args, dir)
    return factory.abst.module
  }

  static paginate<
    Item,
    Load,
    Base extends Page<unknown, Base> = PageRec,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    this: PageConstructor<Load, Base, Page<Load, Base> & This, Args>,
    arg: Readonly<PaginateArg<Item, Load, Page<Load, Base> & This>>,
    ...args: Args
  ): This {
    type F = PageFactory<Load, Base, Page<Load, Base> & This, Args>
    const dir = lazy(async () => await factory.createPaginateDirectory(arg))
    const factory: F = new PageFactory(this, arg, args, dir)
    return factory.abst.module
  }

  parsePath(fileName: string): Readonly<Page.ParsePath> {
    const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(fileName)
    const variant = (m?.[1] ?? '').replace(/\./g, '/')
    const stemBase = fileName.slice(0, m?.index ?? fileName.length)
    const stem = stemBase === '' ? stemBase : stemBase + '/'
    const name = /(?:^|\/|\.[^./]*)$/.test(stemBase) ? stemBase : stem
    const moduleName = variant === '' ? name : variant + '/' + name
    return { moduleName, stem, variant }
  }

  paginatePath(index: number): Readonly<Page.RelPath> {
    const moduleName = index === 0 ? './' : `${index + 1}/`
    const fileName = `${index + 1}`
    return { moduleName, stem: moduleName, variant: '', fileName }
  }

  declare readonly type: 'page'

  static {
    constProp(this.prototype, 'type', 'page')
  }
}
