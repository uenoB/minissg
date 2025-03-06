import { Delay, Ivar, Memo } from '@minissg/async'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import type { FileName, RelPath } from './filename'
import { PathSteps, concatName, concatFileName, emptyRelPath } from './filename'
import { Indices, find, findLeaf } from './find'
import type { Asset, AssetTree } from './asset'
import { type MainModule, isMinissgMainModule, hasMinissgMain } from './minissg'
import type { Public } from './util'
import { TreeContext } from './tree_context'
import type { PageBase } from './page_base'
import { debugTimer } from './debug'

type Laziable<X> = X | (() => X)

interface Instance<Base> {
  readonly self: PublicTree<Base>
  readonly moduleName: minissg.ModuleName
  readonly stem: minissg.ModuleName
  readonly variant: minissg.ModuleName
  readonly fileName: FileName
  readonly parent: Instance<Base> | undefined // undefined means root
  readonly root: Instance<Base> | undefined // undefined means self
  readonly url: () => Readonly<URL>
}

const getURL = function <Base>(this: Instance<Base>): Readonly<URL> {
  if (this.root == null) throw Error('rootURL is not given')
  return Object.freeze(new URL(this.moduleName.path, this.root.url()))
}

const getRootURL = (url: Readonly<URL> | undefined): (() => Readonly<URL>) =>
  url == null ? () => raise(Error('rootURL is not given')) : () => url

export type Directory<Base> = Indices<PublicTree<Base>, AssetTree>

export const createDirectory = <Base>(): Directory<Base> =>
  new Indices<PublicTree<Base>, AssetTree>()

export type PublicTree<Base, This extends Base = Base, Load = unknown> = {
  readonly content:
    | Exclude<Tree<Base, This, Load>['content'], (...a: never) => unknown>
    | ((...args: never) => unknown)
} & Omit<Public<Tree<Base, This, Load>>, 'content'>

export class Tree<Base, This extends Base = Base, Load = unknown> {
  readonly instance: Public<Ivar<Instance<Base>>> = new Ivar<Instance<Base>>()
  readonly rootURL: Readonly<URL> | undefined
  readonly page: This & PageBase<Base, This, Load>
  readonly context: TreeContext<Base, This, Load>
  readonly content:
    | ((page: This) => Awaitable<Load | MainModule>)
    | Delay<Directory<Base>>
    | undefined

  constructor(
    arg: Pick<Tree<Base, This, Load>, 'rootURL' | 'content' | 'context'>
  ) {
    this.rootURL = arg.rootURL
    this.page = arg.context.createPage()
    this.context = arg.context
    this.content = arg.content
    TreeContext.setTree(this.page, this)
  }

  instantiate(
    parent: Laziable<Delay<Instance<Base> | undefined>>,
    relPath: Readonly<RelPath> = emptyRelPath
  ): Delay<Instance<Base>> {
    return this.instance.set(async () => {
      const inst = await (typeof parent === 'function' ? parent() : parent)
      const myInst: Instance<Base> = {
        self: this,
        moduleName: concatName(inst?.moduleName, relPath.moduleName),
        stem: concatName(inst?.stem, relPath.stem),
        variant: concatName(inst?.variant, relPath.variant),
        fileName: concatFileName(inst?.fileName, relPath.fileName),
        parent: inst,
        root: inst?.root ?? inst,
        url: inst != null ? getURL : getRootURL(this.rootURL)
      }
      if (typeof this.content === 'object') {
        void this.content.wrap(content => {
          for (const { tree, relPath } of content.fileNameMap.routes()) {
            void tree.instantiate(Delay.resolve(myInst), relPath)
          }
        })
      }
      return myInst
    })
  }

  toContext(): Delay<minissg.Context> {
    return this.instance.get().wrap(inst => {
      const parentContext = inst.parent?.self.toContext()
      return (parentContext ?? Delay.resolve(undefined)).wrap(parent => {
        const module = this.page
        return Object.freeze({ moduleName: inst.moduleName, parent, module })
      })
    })
  }

  children(): Delay<Array<[RelPath, Base & PageBase<Base>]>> {
    if (typeof this.content !== 'object') return Delay.resolve([])
    return this.content.wrap(content => {
      return Array.from(
        content.moduleNameMap.routes(),
        ({ tree, relPath }): [RelPath, Base & PageBase<Base>] => {
          return [relPath, tree.page]
        }
      )
    })
  }

  #loadThis: Memo<Load | MainModule | undefined> | undefined

  loadThis(): Delay<Load | MainModule | undefined> {
    this.#loadThis ??= new Memo()
    return this.#loadThis.set([], async () => {
      const content = this.content
      if (typeof content !== 'function') return undefined
      return await TreeContext.protect(() => content(this.page))
    })
  }

  #findChild: Memo<PublicTree<Base> | undefined> | undefined

  findChild(): Delay<PublicTree<Base> | undefined> {
    this.#findChild ??= new Memo()
    return this.#findChild.set([], async () => {
      const loaded = await this.loadThis()
      if (!isMinissgMainModule(loaded)) return undefined
      const moduleName = await this.instance.get().wrap(x => x.moduleName)
      let module: MainModule = loaded
      let context = await this.toContext()
      for (;;) {
        const tree = this.context.getTree(module)
        if (tree != null) {
          await tree.instantiate(this.instance.get())
          return tree
        }
        context = Object.freeze({ moduleName, module, parent: context })
        const ret = await TreeContext.protect(() => module.main(context))
        if (!hasMinissgMain(ret)) return undefined
        module = ret
      }
    })
  }

  #load: Memo<{ loaded: unknown } | undefined> | undefined

  load(): Delay<{ loaded: unknown } | undefined> {
    this.#load ??= new Memo()
    return this.#load.set([], () =>
      findLeaf<PublicTree<Base>, { loaded: unknown }>(
        this,
        async tree =>
          await tree.loadThis().then(loaded => {
            if (loaded == null || isMinissgMainModule(loaded)) return undefined
            return { loaded }
          })
      )
    )
  }

  #findByModuleName: Memo<Base | undefined> | undefined

  findByModuleName(path: string): Delay<Base | undefined> {
    return this.instance.get().wrap(({ moduleName, root }) => {
      const key = PathSteps.normalize(PathSteps.join(moduleName.path, path))
      this.#findByModuleName ??= new Memo()
      return this.#findByModuleName.set([key], () =>
        find<'moduleNameMap', PublicTree<Base>, never>(
          'moduleNameMap',
          root?.self ?? this,
          PathSteps.fromRelativeModuleName(key).path
        )
      )
    })
  }

  #findByFileName: Memo<Base | Asset | undefined> | undefined

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return this.instance.get().wrap(({ fileName, root }) => {
      const key = PathSteps.normalize(PathSteps.join(fileName.path, path))
      this.#findByFileName ??= new Memo()
      return this.#findByFileName.set([key], () =>
        find<'fileNameMap', PublicTree<Base>, AssetTree>(
          'fileNameMap',
          root?.self ?? this,
          PathSteps.fromRelativeFileName(key).path
        )
      )
    })
  }

  #findByStem: Memo<Set<Base>> | undefined

  findByStem(path: string): Delay<Set<Base>> {
    return this.instance.get().wrap(({ stem, root }) => {
      const key = PathSteps.normalize(PathSteps.join(stem.path, path))
      this.#findByStem ??= new Memo()
      return this.#findByStem.set([key], () => {
        const set = new Set<Base>()
        return find<'stemMap', PublicTree<Base>, never>(
          'stemMap',
          root?.self ?? this,
          PathSteps.fromRelativeModuleName(key).path,
          tree => {
            set.add(tree.page)
            return undefined
          }
        ).then(() => set)
      })
    })
  }

  async findByTreePath(
    path: ReadonlyArray<string | number>
  ): Promise<Base | undefined> {
    let nodes: Array<PublicTree<Base>> = [this]
    for (const step of path) {
      const current = nodes[0]
      if (current == null) return undefined
      if (nodes.length > 1) {
        if (typeof step !== 'number') return undefined
        const selected = nodes[step]
        if (selected == null) return undefined
        nodes = [selected]
      } else if (typeof step === 'string') {
        const content = current.content
        if (typeof content !== 'object') return undefined
        const routes = Array.from((await content).moduleNameMap.routes())
        nodes = []
        for (const { tree, relPath } of routes) {
          if (relPath.moduleName === step) nodes.push(tree)
        }
      } else if (step === 0) {
        const next = await Promise.resolve(current.findChild())
        if (next == null) return undefined
        nodes = [next]
      } else {
        return undefined
      }
    }
    const current = nodes[0]
    return current != null && nodes.length === 1 ? current.page : undefined
  }

  private findParent(
    context: Readonly<minissg.Context> | undefined
  ): Delay<Instance<Base> | undefined> {
    for (let c = context; c != null; c = c.parent) {
      const tree = this.context.getTree(c.module)
      if (tree != null) return tree.instance.get()
    }
    return Delay.resolve(undefined)
  }

  async main(context: Readonly<minissg.Context>): Promise<minissg.Module> {
    const inst = await this.instantiate(() => this.findParent(context.parent))
    if (context.moduleName.path !== inst.moduleName.path) {
      throw Error(`module name mismatch: ${context.moduleName.path}`)
    }
    const content = this.content
    if (typeof content !== 'function') {
      return (await this.children()).map(([relPath, module]) => {
        return [relPath.moduleName, module]
      })
    }
    const loaded = await TreeContext.run(context, () => content(this.page))
    if (isMinissgMainModule(loaded)) return loaded
    const render = Delay.lazy(async () => {
      return await debugTimer(
        TreeContext.run(context, async () => await this.page.render(loaded)),
        (debug, dt, when) => {
          const path = `/${context.moduleName.path}`
          if (when === 'start') {
            debug('start rendering %s', path)
          } else if (when === 'middle') {
            debug('now rendering %s (+%s sec)', path, dt.toFixed(3))
          } else {
            debug('rendering %s finished (%s sec)', path, dt.toFixed(3))
          }
        }
      )
    })
    return { default: render }
  }
}
