import { AsyncLocalStorage } from 'node:async_hooks'
import type { Awaitable, Void } from '../../vite-plugin-minissg/src/util'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { FileName } from './filename'
import { Indices } from './find'
import type { Asset, AssetAbst } from './asset'
import type { TreeAbst } from './tree_abst'
import type { TreeNode } from './tree_node'
import { type MainModule, isMinissgMainModule } from './minissg'
import { Delay } from './delay'
import type { Public } from './util'

type PublicTree<T extends { content: unknown }> = Omit<Public<T>, 'content'> & {
  readonly content:
    | Exclude<T['content'], (...args: never) => unknown>
    | ((...args: never) => unknown)
}

export type PublicTreeNode<
  Base,
  This extends Base = Base,
  Load = unknown
> = PublicTree<TreeNode<Base, This, Load>>
export type PublicTreeAbst<
  Base,
  This extends Base = Base,
  Load = unknown
> = PublicTree<TreeAbst<Base, This, Load>>

type SomeTree<Base, This extends Base = Base, Load = unknown> =
  | PublicTreeNode<Base, This, Load>
  | PublicTreeAbst<Base, This, Load>

type TreeInDir<Base> = PublicTreeAbst<Base>
type AssetInDir<Base> = AssetAbst<PublicTreeNode<unknown, Base>>
export type Dir<Base> = Indices<TreeInDir<Base>, AssetInDir<Base>>

export const createDirectory = <Base>(): Dir<Base> =>
  new Indices<TreeInDir<Base>, AssetInDir<Base>>()

export class TreeContext<Base, This extends Base = Base, Load = unknown> {
  readonly createObject: () => This & Tree<Base, Base, Load>
  readonly #Base: abstract new (...args: never) => Base & Tree<Base>

  constructor(
    create: () => This & Tree<Base, Base, Load>,
    Base: abstract new (...args: never) => Base & Tree<Base>
  ) {
    this.createObject = create
    this.#Base = Base
  }

  getTree(obj: object): SomeTree<Base> | undefined {
    return obj instanceof this.#Base ? TreeContext.getTree(obj) : undefined
  }

  getTreeAbst(obj: object): PublicTreeAbst<Base> | undefined {
    const tree = this.getTree(obj)
    return tree != null && tree.moduleName == null ? tree : undefined
  }

  getTreeNode(obj: object): PublicTreeNode<Base> | undefined {
    const tree = this.getTree(obj)
    return tree?.moduleName != null ? tree : undefined
  }

  declare static getTree: <Base, This extends Base, Load>(
    this: void,
    page: Base & Tree<Base, This, Load>
  ) => SomeTree<Base, This, Load> | undefined

  declare static setTree: <Base, This extends Base, Load>(
    this: void,
    page: Base & Tree<Base, This, Load>,
    tree: SomeTree<Base, This, Load>
  ) => SomeTree<Base, This, Load>

  static currentNode = new AsyncLocalStorage<
    PublicTreeNode<unknown> | undefined
  >()

  static run<X>(tree: PublicTreeNode<unknown> | undefined, func: () => X): X {
    return this.currentNode.run(tree, func)
  }

  static currentFileName(): FileName {
    return this.currentNode.getStore()?.fileName ?? FileName.root
  }
}

export abstract class Tree<Base, This extends Base = Base, Load = unknown> {
  #tree: SomeTree<Base, This, Load> | undefined

  getTree(): SomeTree<Base, This, Load> | undefined {
    return this.#tree
  }

  static {
    TreeContext.getTree = page => page.#tree
    TreeContext.setTree = (page, tree) => (page.#tree = tree)
  }

  get moduleName(): string | undefined {
    return this.#tree?.moduleName?.path
  }

  get stem(): string | undefined {
    return this.#tree?.stem?.path
  }

  get variant(): string | undefined {
    return this.#tree?.variant?.path
  }

  get fileName(): string {
    return this.#tree?.fileName.path ?? ''
  }

  get url(): Readonly<URL> | undefined {
    return this.#tree?.url
  }

  get parent(): Base | undefined {
    return this.#tree?.parent?.module
  }

  get root(): Base | undefined {
    return this.#tree?.root?.module
  }

  loadThis(): Delay<Load | undefined> {
    return Delay.resolve(this.#tree?.loadThis()).then(loaded => {
      return isMinissgMainModule(loaded) ? undefined : loaded
    })
  }

  load<X = unknown>(): Delay<X | undefined> {
    return Delay.resolve(this.#tree?.load<X>()).then(r => r?.loaded)
  }

  deref(): Delay<Base> {
    if (this.#tree == null) throw Error('deref() is unavailable')
    return Delay.resolve(this.#tree.deref()).then(node => node.module)
  }

  get children(): Delay<Array<[string, Base]>> {
    return Delay.resolve(this.#tree?.children() ?? [])
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    return Delay.resolve(this.#tree?.findByModuleName?.(path))
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return Delay.resolve(this.#tree?.findByFileName?.(path))
  }

  find(path: string): Delay<Base | Asset | undefined> {
    return this.findByModuleName(path).then(x => x ?? this.findByFileName(path))
  }

  findByStem(path: string): Delay<Set<Base>> {
    return Delay.resolve(this.#tree?.findByStem?.(path) ?? new Set())
  }

  findByTreePath(
    path: ReadonlyArray<string | number>
  ): Delay<Base | undefined> {
    return Delay.resolve(this.#tree?.findByTreePath?.(path))
  }

  variants(): Delay<Set<Base>> {
    return Delay.resolve(this.#tree?.findByStem?.('/' + this.stem) ?? new Set())
  }

  main(context: Readonly<minissg.Context>): Awaitable<minissg.Module> {
    if (this.#tree == null) throw Error('main() is unavailable')
    return this.#tree?.main(context)
  }

  render(module: Load): Awaitable<minissg.Content> {
    const mod: unknown = module
    if (mod == null) return mod
    if (typeof mod === 'string') return mod
    if (mod instanceof Uint8Array) return mod
    if (typeof mod !== 'object') return `[${typeof mod}]`
    if ('default' in mod) return mod.default as minissg.Content
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return Reflect.apply(Object.prototype.toString, mod, [])
  }

  initialize(): Awaitable<MainModule | Void> {}
}
