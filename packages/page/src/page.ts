import { Delay } from '@minissg/async'
import type { Content } from 'vite-plugin-minissg'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { type Pairs, type List, iteratePairs, listItems } from './items'
import type { RelPath as RelPathTy } from './filename'
import { PathSteps, emptyRelPath, copyRelPath } from './filename'
import { type Asset as AssetTy, type AssetModule, AssetTree } from './asset'
import { type Directory, Tree, createDirectory } from './tree'
import { TreeContext } from './tree_context'
import { PageBase } from './page_base'
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

type ParsePath = Readonly<Page.ParsePath>
type RelPath = Readonly<Page.RelPath>

interface CommonArg<Load, This> {
  url?: Readonly<URL> | string | Null
  parsePath?: ((this: This, path: string) => Awaitable<ParsePath>) | Null
  paginatePath?: ((this: This, index: number) => Awaitable<RelPath>) | Null
  render?: ((this: This, loaded: Load) => Awaitable<Content>) | Null
}

type Loaded<Load> = Awaitable<Load | MainModule>
type Loader<This, Load> = (page: This) => Loaded<Load>
type LoadAsset = () => Awaitable<AssetModule>

interface PagesArg<Load, This> extends CommonArg<Load, This> {
  load?: never // distinct from LoadArg
  pages: Pairs<string | RelPath, Loader<This, Load> | MainModule, This>
  substitutePath?: ((path: string) => Awaitable<string>) | Null
  assets?: Pairs<string, LoadAsset | string | Null, This> | Null
}

interface LoadArg<Load, This> extends CommonArg<Load, This> {
  pages?: never // distinct from PagesArg
  load: Loader<This, Load>
}

interface PaginateArg<Item, Load, This> extends CommonArg<Load, This> {
  items: List<Item, This>
  pageSize?: number | Null
  load: (this: This, paginate: Page.Paginate<Item, This>) => Loaded<Load>
}

export interface PageConstructor<
  Load,
  Base,
  This extends Base,
  Args extends unknown[]
> {
  new (...args: Args): This & PageBase<Base, This, Load>
  Base: abstract new (...args: never) => Base & PageBase<Base>
}

class PageFactory<
  Load,
  Base extends Page<unknown, Base>,
  This extends Base,
  Args extends unknown[]
> {
  readonly tree: Tree<Base, This, Load>

  constructor(
    This: PageConstructor<Load, Base, This, Args>,
    arg: CommonArg<Load, This>,
    args: Args,
    content: Tree<Base, This, Load>['content']
  ) {
    const createPage = (): This & PageBase<Base, This, Load> => {
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
      return module
    }
    const context = new TreeContext<Base, This, Load>(createPage, This.Base)
    const rootURL = arg.url != null ? new URL(arg.url) : undefined
    if (rootURL != null) Object.freeze(rootURL)
    this.tree = new Tree<Base, This, Load>({ rootURL, content, context })
  }

  createSubpage(
    dir: Directory<Base>,
    relPath: RelPath,
    content: Tree<Base, This, Load>['content']
  ): Tree<Base, This, Load> {
    const rootURL = this.tree.rootURL
    const context = this.tree.context
    const tree = new Tree({ rootURL, content, context })
    dir.addRoute(relPath, tree)
    return tree
  }

  async createModuleDirectory(
    arg: Readonly<PagesArg<Load, This>>
  ): Promise<Directory<Base>> {
    const dir = createDirectory<Base>()
    const substitutePath = arg.substitutePath
    const self = this.tree.page
    const substPath: (path: string) => Awaitable<string> =
      substitutePath != null
        ? path => Reflect.apply(substitutePath, self, [path])
        : path => path
    for await (const [path, load] of iteratePairs(arg.pages, self)) {
      let relPath: RelPath
      if (typeof path !== 'string') {
        relPath = copyRelPath(path)
      } else {
        const srcPath = PathSteps.normalize(await substPath(path))
        const parsed = await self.parsePath(srcPath)
        relPath = Object.freeze({
          moduleName: parsed.moduleName ?? '',
          stem: parsed.stem ?? '',
          variant: parsed.variant ?? '',
          fileName: PathSteps.normalize(path)
        })
      }
      if (typeof load === 'function') {
        this.createSubpage(dir, relPath, load)
      } else {
        const tree = this.tree.context.getTree(load)
        if (tree != null) {
          dir.addRoute(relPath, tree)
        } else {
          this.createSubpage(dir, relPath, () => load)
        }
      }
    }
    if (arg.assets != null) {
      for await (const [path, load] of iteratePairs(arg.assets, self)) {
        const tree = new AssetTree(load ?? (await substPath(path)))
        const pair = { tree, relPath: emptyRelPath }
        dir.fileNameMap.addRoute(PathSteps.fromRelativeFileName(path), pair)
      }
    }
    return dir
  }

  async createPaginateDirectory<Item>(
    arg: Readonly<PaginateArg<Item, Load, This>>
  ): Promise<Directory<Base>> {
    const dir = createDirectory<Base>()
    const rawPageSize = arg.pageSize ?? 10
    const pageSize = rawPageSize >= 1 ? rawPageSize : 1
    const load = arg.load
    const allItems = await listItems(arg.items, this.tree.page)
    const numAllItems = allItems.length
    const numPages = Math.ceil(numAllItems / pageSize)
    const pages: Array<Page.Paginate<Item, This>> = []
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      const itemIndex = pageIndex * pageSize
      const items = allItems.slice(itemIndex, itemIndex + pageSize)
      const relPath = copyRelPath(await this.tree.page.paginatePath(pageIndex))
      const page = undefined as unknown as This // dummy
      const pagi = { pages, page, pageIndex, items, itemIndex, numAllItems }
      const content = (): Loaded<Load> => Reflect.apply(load, pagi.page, [pagi])
      pagi.page = this.createSubpage(dir, relPath, content).page
      pages.push(pagi)
    }
    return dir
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PageRec extends Page<unknown, PageRec, PageRec> {}

export class Page<
  Load = unknown,
  Base extends Page<unknown, Base> = PageRec,
  This extends Base = Base
> extends PageBase<Base, This, Load> {
  static Base: abstract new (...args: never) => PageRec = this

  static create<
    Load,
    Base extends Page<unknown, Base> = PageRec,
    This extends Base = Base,
    Args extends unknown[] = []
  >(
    // I'm not sure why but `Page<...> & ...` makes type inference better.
    this: PageConstructor<Load, Base, Page<Load, Base> & This, Args>,
    arg:
      | Readonly<PagesArg<Load, Page<Load, Base> & This>>
      | Readonly<LoadArg<Load, Page<Load, Base> & This>>,
    ...args: Args
  ): This {
    type F = PageFactory<Load, Base, Page<Load, Base> & This, Args>
    const content =
      typeof arg.load === 'function'
        ? arg.load
        : Delay.lazy(async () => await factory.createModuleDirectory(arg))
    const factory: F = new PageFactory(this, arg, args, content)
    return factory.tree.page
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
    const content = Delay.lazy(
      async () => await factory.createPaginateDirectory(arg)
    )
    const factory: F = new PageFactory(this, arg, args, content)
    return factory.tree.page
  }

  parsePath(fileName: string): Awaitable<ParsePath> {
    const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(fileName)
    const variant = (m?.[1] ?? '').replace(/\./g, '/')
    const stemBase = fileName.slice(0, m?.index ?? fileName.length)
    const stem = stemBase === '' ? stemBase : stemBase + '/'
    const name = /(?:^|\/|\.[^./]*)$/.test(stemBase) ? stemBase : stem
    const moduleName = variant === '' ? name : variant + '/' + name
    return { moduleName, stem, variant }
  }

  paginatePath(index: number): Awaitable<RelPath> {
    const moduleName = index === 0 ? './' : `${index + 1}/`
    const fileName = `${index + 1}`
    return { moduleName, stem: moduleName, variant: '', fileName }
  }

  declare readonly type: 'page'
  static {
    constProp(this.prototype, 'type', 'page')
  }
}
