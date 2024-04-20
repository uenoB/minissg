import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import type { Public } from './util'
import type { FileName, RelPath } from './filename'
import { Ref } from './ref'
import { TreeNode } from './tree_node'
import type { PublicTreeNode, Dir, Tree } from './tree'
import { TreeContext } from './tree'
import type { MainModule } from './minissg'

export class TreeAbst<Base, This extends Base = Base, Load = unknown> {
  readonly rootURL: Readonly<URL> | undefined
  readonly fileName: FileName
  readonly module: This & Tree<Base>
  readonly context: Public<TreeContext<Base, This, Load>>
  readonly #refs = new Ref<PublicTreeNode<Base>, TreeNode<Base, This, Load>>()
  readonly content:
    | ((module: This) => Awaitable<Load | MainModule>)
    | PromiseLike<Dir<Base>>
    | undefined

  constructor(
    arg: Pick<TreeAbst<Base, This, Load>, 'rootURL' | 'content' | 'context'>
  ) {
    this.rootURL = arg.rootURL
    this.fileName = TreeContext.currentFileName()
    this.content = arg.content
    this.context = arg.context
    this.module = arg.context.createObject()
    TreeContext.setTree(this.module, this)
  }

  async instantiate(
    parent: PublicTreeNode<Base> | undefined,
    relPath: Readonly<RelPath> | null // null means empty relPath
  ): Promise<PublicTreeNode<Base, This, Load>> {
    const found = this.#refs.findInstance(parent, relPath)
    if (found != null) return found
    const inst = new TreeNode<Base, This, Load>(this, parent, relPath)
    await inst.initialize()
    this.#refs.registerInstance(inst, parent, relPath)
    return inst
  }

  async children(): Promise<Array<[string, Base & Tree<Base>]>> {
    if (typeof this.content !== 'object') return []
    const routes = (await this.content).moduleNameMap.routes()
    return Array.from(
      routes,
      ({ abst, relPath }): [string, Base & Tree<Base>] => {
        return [relPath?.moduleName ?? '', abst.module]
      }
    )
  }

  async deref(): Promise<PublicTreeNode<Base, This, Load>> {
    const root = TreeContext.currentNode.getStore()?.root
    if (root == null) {
      throw Error('deref() is called from outside of page tree context')
    }
    return await this.#refs.deref(root)
  }

  async loadThis(): Promise<Load | MainModule | undefined> {
    return await (await this.instantiate(undefined, null)).loadThis()
  }

  async load<X = unknown>(): Promise<{ loaded: X } | undefined> {
    return await (await this.instantiate(undefined, null)).load<X>()
  }

  findParent(
    context: Readonly<minissg.Context> | undefined
  ): PublicTreeNode<Base> | undefined {
    for (let c = context; c != null; c = c.parent) {
      const tree = this.context.getTreeNode(c.module)
      if (tree != null) return tree
    }
    return undefined
  }

  async main(context: Readonly<minissg.Context>): Promise<minissg.Module> {
    const parent = this.findParent(context.parent)
    return (await this.instantiate(parent, null)).module
  }

  declare readonly moduleName: undefined
  declare readonly stem: undefined
  declare readonly variant: undefined
  declare readonly url: undefined
  declare readonly parent: undefined
  declare readonly root: undefined
  declare findByModuleName: undefined
  declare findByFileName: undefined
  declare findByStem: undefined
  declare findByTreePath: undefined
}
