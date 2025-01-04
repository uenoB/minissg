import { Delay } from '@minissg/async'
import type { Content, Context, Module } from 'vite-plugin-minissg'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import type { RelPath } from './filename'
import type { Asset } from './asset'
import { isMinissgMainModule } from './minissg'
import type { PublicTree } from './tree'
import { TreeContext } from './tree_context'

export abstract class PageBase<Base, This extends Base = Base, Load = unknown> {
  #tree: PublicTree<Base, This, Load> | undefined

  static {
    TreeContext.getTree = page => page.#tree
    TreeContext.setTree = (page, tree) => (page.#tree = tree)
  }

  get moduleName(): Delay<string> {
    if (this.#tree == null) throw Error('moduleName is unavailable')
    return this.#tree.instance.get().wrap(i => i.moduleName.path)
  }

  get stem(): Delay<string> {
    if (this.#tree == null) throw Error('stem is unavailable')
    return this.#tree.instance.get().wrap(i => i.stem.path)
  }

  get variant(): Delay<string> {
    if (this.#tree == null) throw Error('variant is unavailable')
    return this.#tree.instance.get().wrap(i => i.variant.path)
  }

  get fileName(): Delay<string> {
    if (this.#tree == null) throw Error('fileName is unavailable')
    return this.#tree.instance.get().wrap(i => i.fileName.path)
  }

  get url(): Delay<Readonly<URL>> {
    if (this.#tree == null) throw Error('url is unavailable')
    return this.#tree.instance.get().wrap(i => i.url())
  }

  get parent(): Delay<Base | undefined> {
    if (this.#tree == null) throw Error('parent is unavailable')
    return this.#tree.instance.get().wrap(i => i.parent?.self.page)
  }

  get root(): Delay<Base> {
    if (this.#tree == null) throw Error('root is unavailable')
    return this.#tree.instance.get().wrap(i => (i.root?.self ?? i.self).page)
  }

  loadThis(): Delay<Load | undefined> {
    if (this.#tree == null) return Delay.resolve(undefined)
    return this.#tree.loadThis().wrap(loaded => {
      return isMinissgMainModule(loaded) ? undefined : loaded
    })
  }

  load(): Delay<unknown> {
    return this.#tree?.load().wrap(x => x?.loaded) ?? Delay.resolve(undefined)
  }

  children(): Delay<Array<[RelPath, Base]>> {
    return this.#tree?.children() ?? Delay.resolve([])
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    return this.#tree?.findByModuleName(path) ?? Delay.resolve(undefined)
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return this.#tree?.findByFileName(path) ?? Delay.resolve(undefined)
  }

  find(path: string): Delay<Base | Asset | undefined> {
    return this.findByModuleName(path).wrap(x => x ?? this.findByFileName(path))
  }

  findByStem(path: string): Delay<Set<Base>> {
    return this.#tree?.findByStem(path) ?? Delay.resolve(new Set())
  }

  // for debug
  async findByTreePath(
    path: ReadonlyArray<string | number>
  ): Promise<Base | undefined> {
    return await this.#tree?.findByTreePath(path)
  }

  variants(): Delay<Set<Base>> {
    return this.stem.wrap(s => this.#tree?.findByStem('/' + s) ?? new Set())
  }

  main(context: Readonly<Context>): Awaitable<Module> {
    if (this.#tree == null) throw Error('main is unavailable')
    return this.#tree.main(context)
  }

  render(module: Load): Awaitable<Content> {
    const mod: unknown = module
    if (mod == null) return mod
    if (typeof mod === 'string') return mod
    if (mod instanceof Uint8Array) return mod
    if (typeof mod !== 'object') return `[${typeof mod}]`
    if ('default' in mod) return mod.default as Content
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return Reflect.apply(Object.prototype.toString, mod, [])
  }
}
