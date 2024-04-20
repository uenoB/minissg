import { type Awaitable, lazy } from '../../vite-plugin-minissg/src/util'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { PathSteps, concatName, concatFileName } from './filename'
import type { FileName, RelPath } from './filename'
import { find } from './find'
import type { Asset, AssetNode } from './asset'
import type { TreeAbst } from './tree_abst'
import type { PublicTreeNode, Tree, Dir } from './tree'
import { TreeContext } from './tree'
import { type MainModule, hasMinissgMain, isMinissgMainModule } from './minissg'
import type { Public } from './util'
import { debugTimer } from './debug'

export class TreeNode<Base, This extends Base = Base, Load = unknown> {
  readonly moduleName: minissg.ModuleName
  readonly stem: minissg.ModuleName
  readonly variant: minissg.ModuleName
  readonly fileName: FileName
  readonly url: Readonly<URL> | undefined
  readonly parent: PublicTreeNode<Base> | undefined
  readonly root: PublicTreeNode<Base>
  readonly module: This & Tree<Base>
  readonly context: Public<TreeContext<Base, This, Load>>
  content:
    | ((module: This) => Awaitable<Load | MainModule>)
    | PromiseLike<Dir<Base>>
    | undefined

  constructor(
    abst: TreeAbst<Base, This, Load>,
    parent: PublicTreeNode<Base> | undefined,
    relPath: Readonly<RelPath> | null
  ) {
    const root = parent?.root?.url ?? abst.rootURL
    this.moduleName = concatName(parent?.moduleName, relPath?.moduleName)
    this.stem = concatName(parent?.stem, relPath?.stem)
    this.variant = concatName(parent?.variant, relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, relPath?.fileName)
    this.url =
      root != null
        ? Object.freeze(new URL(this.moduleName.path, root))
        : undefined
    this.parent = parent
    this.root = parent?.root ?? this
    this.content = abst.content
    this.module = abst.context.createObject()
    this.context = abst.context
    TreeContext.setTree(this.module, this)
  }

  async initialize(): Promise<void> {
    const ret = await TreeContext.run(
      this,
      async () => await this.module.initialize()
    )
    if (this.content == null && ret != null) this.content = () => ret
  }

  async findByModuleName(path: string): Promise<Base | undefined> {
    const key = PathSteps.normalize(PathSteps.join(this.moduleName.path, path))
    return await find<'moduleNameMap', PublicTreeNode<Base>, never>(
      'moduleNameMap',
      this.root,
      PathSteps.fromRelativeModuleName(key).path
    )
  }

  async findByFileName(path: string): Promise<Base | Asset | undefined> {
    const key = PathSteps.normalize(PathSteps.join(this.fileName.path, path))
    return await find<'fileNameMap', PublicTreeNode<Base>, AssetNode>(
      'fileNameMap',
      this.root,
      PathSteps.fromRelativeFileName(key).path
    )
  }

  async findByStem(path: string): Promise<Set<Base>> {
    const key = PathSteps.normalize(PathSteps.join(this.stem.path, path))
    const steps = PathSteps.fromRelativeModuleName(key).path
    const set = new Set<Base>()
    await find<'stemMap', PublicTreeNode<Base>, never>(
      'stemMap',
      this.root,
      steps,
      node => {
        set.add(node.module)
        return undefined
      }
    )
    return set
  }

  async findByTreePath(
    path: ReadonlyArray<string | number>
  ): Promise<Base | undefined> {
    let nodes: Array<PublicTreeNode<Base>> = [this]
    for (const step of path) {
      const node = nodes[0]
      if (node == null) return undefined
      if (nodes.length > 1) {
        if (typeof step !== 'number') return undefined
        const selected = nodes[step]
        if (selected == null) return undefined
        nodes = [selected]
      } else if (typeof step === 'string') {
        if (typeof node.content !== 'object') return undefined
        const routes = Array.from((await node.content).moduleNameMap.routes())
        nodes = []
        for (const { abst, relPath } of routes) {
          if ((relPath?.moduleName ?? '') === step) {
            nodes.push(await abst.instantiate(node, relPath))
          }
        }
      } else if (step === 0) {
        const selected = await node.findChild()
        if (!selected.tree) return undefined
        nodes = [selected.node]
      } else {
        return undefined
      }
    }
    const node = nodes[0]
    return node != null && nodes.length === 1 ? node.module : undefined
  }

  async loadThis(): Promise<Load | MainModule | undefined> {
    const content = this.content
    if (typeof content !== 'function') return undefined
    return await TreeContext.run(this, () => content(this.module))
  }

  async findChild(): Promise<
    | { tree: true; node: PublicTreeNode<Base> }
    | { tree: false; loaded: unknown }
  > {
    const loaded = await this.loadThis()
    if (!isMinissgMainModule(loaded)) return { tree: false, loaded }
    const moduleName = this.moduleName
    let module: MainModule = loaded
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let context: minissg.Context = this
    for (;;) {
      const abst = this.context.getTreeAbst(module)
      if (abst != null) {
        return { tree: true, node: await abst.instantiate(this, null) }
      }
      context = Object.freeze({ moduleName, module, parent: context })
      const ret = await module.main(context)
      if (!hasMinissgMain(ret)) return { tree: false, loaded }
      module = ret
    }
  }

  load<X>(): PromiseLike<{ loaded: X } | undefined> {
    type Result = { loaded: X } | undefined
    type Cont = (r: Result) => Awaitable<Result>
    const content = this.content
    if (typeof content !== 'object') {
      return this.findChild().then(r =>
        r.tree ? r.node.load<X>() : (r as Result)
      )
    } else {
      const slash = this.moduleName.path.endsWith('/')
      return content.then((index): PromiseLike<Result> => {
        const epsilons = index.moduleNameMap?.value ?? []
        const cont = epsilons.reduce<Cont>(
          (cont, { next }) => {
            if (!slash && (next.relPath?.moduleName ?? '') !== '') return cont
            return (r): Awaitable<Result> =>
              r ??
              next.abst.instantiate(this, next.relPath).then(inst => {
                return inst.load<X>().then(cont)
              })
          },
          r => r
        )
        return Promise.resolve(undefined).then(cont)
      })
    }
  }

  async children(): Promise<Array<[string, Base & Tree<Base>]>> {
    if (typeof this.content !== 'object') return []
    const routes = (await this.content).moduleNameMap.routes()
    const promises = Array.from(
      routes,
      async ({ abst, relPath }): Promise<[string, Base & Tree<Base>]> => {
        const moduleName = relPath?.moduleName ?? ''
        return [moduleName, (await abst.instantiate(this, relPath)).module]
      }
    )
    return await Promise.all(promises)
  }

  deref(): PromiseLike<PublicTreeNode<Base, This>> {
    return Promise.resolve(this)
  }

  async main(context: Readonly<minissg.Context>): Promise<minissg.Module> {
    if (context.moduleName.path !== this.moduleName.path) {
      throw Error(`module name mismatch: ${context.moduleName.path}`)
    }
    const loaded = await this.loadThis()
    if (loaded == null) return await this.children()
    if (isMinissgMainModule(loaded)) return loaded
    type R = Promise<minissg.Content>
    const render1 = async (): R => await this.module.render(loaded)
    const render2 = async (): R => await TreeContext.run(this, render1)
    const render = async (): R =>
      await debugTimer(render2, (debug, dt, when) => {
        const path = `/${context.moduleName.path}`
        if (when === 'start') {
          debug('start rendering %s', path)
        } else if (when === 'middle') {
          debug('now rendering %s (+%s sec)', path, dt.toFixed(3))
        } else {
          debug('rendering %s finished (%s sec)', path, dt.toFixed(3))
        }
      })
    return { default: lazy(render) }
  }
}
