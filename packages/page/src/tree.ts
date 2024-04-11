import { AsyncLocalStorage } from 'node:async_hooks'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { type Awaitable, lazy } from '../../vite-plugin-minissg/src/util'
import { debugTimer } from './debug'
import * as u from './util'
import { type Delay, delay } from './delay'
import { Memo } from './memo'
import { PathSteps, FileName, concatName, concatFileName } from './filename'
import type { RelPath } from './filename'
import { type Next, Indices, find } from './find'
import type { Asset, AssetNode, AssetAbst } from './asset'
import { Ref } from './ref'

export type MainModule = Readonly<{ main: minissg.Main }>
export type Loaded<Impl> = Awaitable<Impl | MainModule>

export const hasMinissgMain = (x: object): x is MainModule =>
  !(Symbol.iterator in x) && 'main' in x && typeof x.main === 'function'
export const isMinissgMainModule = (x: unknown): x is MainModule =>
  typeof x === 'object' && x != null && hasMinissgMain(x)

type TreeImpl<Base, This extends Base, Impl> =
  | TreeNodeImpl<Base, This, Impl>
  | TreeAbstImpl<Base, This, Impl>

const currentNode = new AsyncLocalStorage<TreeNode<unknown>>()
const internal = new WeakMap<object, TreeNode<unknown> | TreeAbst<unknown>>()

const setTree = <Base, This extends Base, Impl>(
  tree: TreeImpl<Base, This, Impl>,
  obj: Base & object
): unknown => internal.set(obj, tree)

const getTree = (
  obj: object
): TreeNode<unknown> | TreeAbst<unknown> | undefined => internal.get(obj)

const isTreeNodeOf = <Base>(
  x: TreeNode<unknown>,
  Base_: abstract new (...a: never) => Base
): x is TreeNode<Base> => x.module instanceof Base_

const isTreeAbstOf = <Base>(
  x: TreeAbst<unknown>,
  Base_: abstract new (...a: never) => Base
): x is TreeAbst<Base> => x.basis instanceof Base_

const getTreeImpl = <Base, This extends Base, Impl>(
  obj: Tree<Base, This, Impl>
): TreeImpl<Base, This, Impl> | undefined =>
  internal.get(obj) as TreeImpl<Base, This, Impl> | undefined

const getTreeNodeImpl = <Base, This extends Base, Impl>(
  x: Tree<Base, This, Impl>
): TreeNodeImpl<Base, This, Impl> => {
  const tree = getTreeImpl(x)
  return tree?.memo != null ? tree : u.unavailable()
}

const findByModuleName = async <Base>(
  self: TreeNode<Base>,
  path: string
): Promise<Inst<Base> | undefined> => {
  const key = PathSteps.normalize(PathSteps.join(self.moduleName.path, path))
  return await find<'moduleNameMap', typeof self, never>(
    'moduleNameMap',
    self.root,
    PathSteps.fromRelativeModuleName(key).path
  )
}

const findByFileName = async <Base>(
  self: TreeNode<Base>,
  path: string
): Promise<Inst<Base> | Asset | undefined> => {
  const key = PathSteps.normalize(PathSteps.join(self.fileName.path, path))
  return await find<'fileNameMap', typeof self, AssetNode>(
    'fileNameMap',
    self.root,
    PathSteps.fromRelativeFileName(key).path
  )
}

const findByBoth = async <Base>(
  self: TreeNode<Base>,
  path: string
): Promise<Inst<Base> | Asset | undefined> => {
  if (u.isAbsURL(path)) return undefined
  return (
    (await self.memo.memoize(findByModuleName, self, path)) ??
    (await self.memo.memoize(findByFileName, self, path))
  )
}

const findByStem = async <Base>(
  self: TreeNode<Base>,
  path: string
): Promise<Set<Inst<Base>>> => {
  const key = PathSteps.normalize(PathSteps.join(self.stem.path, path))
  const steps = PathSteps.fromRelativeModuleName(key).path
  const set = new Set<Inst<Base>>()
  await find<'stemMap', typeof self, never>('stemMap', self.root, steps, node =>
    set.add(node.module)
  )
  return set
}

const findByPath = async <Base>(
  self: TreeNode<Base>,
  path: ReadonlyArray<string | number>
): Promise<Inst<Base> | undefined> => {
  let nodes = [self]
  for (const step of path) {
    const node = nodes[0]
    if (node == null) return undefined
    if (nodes.length > 1) {
      if (typeof step !== 'number') return undefined
      const selected = nodes[step]
      if (selected == null) return undefined
      nodes = [selected]
    } else if (typeof step === 'string') {
      if (typeof node.content === 'function') return undefined
      const routes = Array.from((await node.content).moduleNameMap.routes())
      nodes = []
      for (const { abst, relPath } of routes) {
        if (relPath.moduleName === step) {
          nodes.push(await abst.instantiate(node, relPath))
        }
      }
    } else if (step === 0) {
      const selected = await node.findChild()
      if (selected == null) return undefined
      nodes = [selected]
    } else {
      return undefined
    }
  }
  const node = nodes[0]
  return node != null && nodes.length === 1 ? node.module : undefined
}

const subnodes = async function* <Base>(
  self: TreeNode<Base>
): AsyncIterableIterator<TreeNode<Base>> {
  const content = typeof self.content === 'function' ? null : self.content
  const index = (await content)?.moduleNameMap
  if (index == null || index.isEmpty()) {
    const child = await self.findChild()
    if (child != null) yield child
    return
  }
  const dir = self.moduleName.path === '' || self.moduleName.path.endsWith('/')
  for (const { trie } of Array.from(index.walk(dir ? [''] : [])).reverse()) {
    for (const { next, epsilon } of trie.value ?? []) {
      if (!epsilon || (next.relPath?.moduleName ?? '') === '') {
        yield await next.abst.instantiate(self, next.relPath)
      }
    }
  }
}

const subpages = async <Base>(
  self: TreeNode<Base>
): Promise<Set<Inst<Base>>> => {
  const set = new Set<Inst<Base>>()
  for await (const node of subnodes(self)) set.add(node.module)
  return set
}

const findChild = async <Base, This extends Base, Impl>(
  self: TreeNodeImpl<Base, This, Impl>
): Promise<TreeNode<Base> | undefined> => {
  let mod: unknown = await currentNode.run(self, async () =>
    typeof self.content === 'function'
      ? await self.memo.memoize(self.content, self.module)
      : await self.module.main(self)
  )
  const moduleName = self.moduleName
  let context: minissg.Context = self
  while (typeof mod === 'object' && mod != null) {
    const abst = self._abst.getTreeAbst(mod)
    if (abst != null) return await abst.instantiate(self, null)
    if (!hasMinissgMain(mod)) break
    context = Object.freeze({ moduleName, module: mod, parent: context })
    mod = await mod.main(context)
  }
  return undefined
}

const load = async <Base, This extends Base, Impl>(
  self: TreeNodeImpl<Base, This, Impl>
): Promise<Impl | undefined> => {
  const mod = await currentNode.run(self, async () =>
    typeof self.content === 'function'
      ? await self.memo.memoize(self.content, self.module)
      : undefined
  )
  return isMinissgMainModule(mod) ? undefined : mod
}

const fetch = async <Base>(self: TreeNode<Base>): Promise<unknown> => {
  const ret = await self.load()
  if (typeof ret !== 'undefined') return ret
  for await (const node of subnodes(self)) {
    const ret = await node.memo.memoize(fetch, node)
    if (typeof ret !== 'undefined') return ret
  }
  return undefined
}

const children = async <Base>(
  self: TreeNode<Base> | TreeAbst<Base>
): Promise<Iterable<Next<Base>>> => {
  if (typeof self.content === 'function') return []
  const routes = (await self.content).moduleNameMap.routes()
  return (function* iterator(): Iterable<Next<Base>> {
    for (const { abst, relPath } of routes) yield { abst: abst.basis, relPath }
  })()
}

const entries = async <Base>(self: TreeNode<Base>): Promise<minissg.Module> => {
  if (typeof self.content === 'function') return []
  const routes = (await self.content).moduleNameMap.routes()
  return (function* iterator(): Iterable<[string, Awaitable<minissg.Module>]> {
    for (const { abst, relPath } of routes) {
      const mod = async (): Promise<MainModule> =>
        (await abst.instantiate(self, relPath)).module
      yield [relPath.moduleName ?? '', lazy(mod)]
    }
  })()
}

export type Dir<Base> = Indices<TreeAbst<Base>, AssetAbst<TreeNode<Base>>>

// these are private in each node and therefore safely hidden from other nodes.
type Public<X> = Omit<X, 'content' | 'module' | 'basis' | `_${string}`>

export interface TreeNode<Base>
  extends Public<TreeNodeImpl<Base, Base, unknown>> {
  readonly module: Base & MainModule & InstProps<Base>
  readonly content: ((...a: never) => unknown) | PromiseLike<Dir<Base>>
}

export interface TreeAbst<Base>
  extends Public<TreeAbstImpl<Base, Base, unknown>> {
  readonly basis: Base & MainModule
  readonly content: ((...a: never) => unknown) | PromiseLike<Dir<Base>>
}

interface NodeMethod<Impl> extends MainModule {
  render: (module: Impl) => Awaitable<minissg.Content>
  initialize: () => Awaitable<void>
}

class TreeNodeImpl<Base, This extends Base, Impl> {
  readonly memo: Memo
  readonly moduleName: minissg.ModuleName
  readonly stem: minissg.ModuleName
  readonly variant: minissg.ModuleName
  readonly fileName: FileName
  readonly url: Readonly<URL> | undefined
  readonly parent: TreeNode<Base> | undefined
  readonly root: TreeNode<Base>
  readonly content: ((module: This) => Loaded<Impl>) | PromiseLike<Dir<Base>>
  readonly _abst: TreeAbstImpl<Base, This, Impl>
  readonly module: This & NodeMethod<Impl> & InstProps<Base>

  constructor(
    relPath: Readonly<RelPath> | null,
    arg: Pick<TreeNodeImpl<Base, This, Impl>, '_abst' | 'content' | 'parent'>
  ) {
    const { _abst, content, parent } = arg
    const rootURL = parent?.root?.url ?? _abst.rootURL
    this.memo = parent?.memo ?? new Memo()
    this.moduleName = concatName(parent?.moduleName, relPath?.moduleName)
    this.stem = concatName(parent?.stem, relPath?.stem)
    this.variant = concatName(parent?.variant, relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, relPath?.fileName)
    this.url =
      rootURL != null
        ? Object.freeze(new URL(this.moduleName.path, rootURL))
        : undefined
    this.parent = parent
    this.root = parent?.root ?? this
    this.content = content
    this._abst = _abst
    const inst = u.createObject(_abst.basis)
    setTree(this, inst)
    const props = {
      moduleName: { value: this.moduleName.path },
      stem: { value: this.stem.path },
      variant: { value: this.variant.path },
      url: this.url != null ? { value: this.url } : { get: u.unavailable },
      parent: { value: this.parent?.module },
      root: { value: this.root.module }
    }
    this.module = u.defineProperties(inst, props)
  }

  ref(): Delay<Inst<Base, This>> {
    return delay.resolve(this.module)
  }

  children(): Delay<Iterable<Next<Base>>> {
    return this.memo.memoize(children, this)
  }

  findChild(): Delay<TreeNode<Base> | undefined> {
    return this.memo.memoize(findChild, this)
  }

  load(): Delay<Impl | undefined> {
    return this.memo.memoize(load, this)
  }

  fetch(): Delay<unknown> {
    return this.memo.memoize(fetch, this)
  }

  async main(c: Readonly<minissg.Context>): Promise<minissg.Module> {
    const parent = this._abst.findParent(c, this.module)
    if (parent !== this.parent) throw Error('parent page mismatch')
    if (c.moduleName.path !== this.moduleName.path) throw Error('name mismatch')
    const content = this.content
    if (typeof content !== 'function') return await entries(this)
    const mod = await currentNode.run(this, async () => {
      return await this.memo.memoize(content, this.module)
    })
    if (isMinissgMainModule(mod)) return mod
    type R = Promise<minissg.Content>
    const render1 = async (): R => await this.module.render(mod)
    const render2 = async (): R => await currentNode.run(this, render1)
    const render3 = async (): R => await this.memo.run(render2)
    const render = async (): R =>
      await debugTimer(render3, (debug, dt, when) => {
        const path = `/${c.moduleName.path}`
        if (when === 'start') {
          debug('start rendering %s', path)
        } else if (when === 'middle') {
          debug('now rendering %s (+%s sec)', path, (dt / 1000).toFixed(3))
        } else {
          debug('rendering %s finished (%s sec)', path, (dt / 1000).toFixed(3))
        }
      })
    return { default: lazy(render) }
  }
}

type TreeAbstArg<Base, This extends Base, Impl> = Pick<
  TreeAbstImpl<Base, This, Impl>,
  'rootURL' | 'fileName' | 'basis' | 'content' | 'Base'
>

export class TreeAbstImpl<Base, This extends Base, Impl> {
  readonly rootURL: Readonly<URL> | undefined
  readonly fileName: FileName
  readonly content: ((module: This) => Loaded<Impl>) | PromiseLike<Dir<Base>>
  readonly basis: This & NodeMethod<Impl> & NodeProps
  readonly Base: abstract new (...args: never) => Base
  readonly _ref = new Ref<
    TreeNode<unknown>,
    TreeNode<Base>,
    TreeNodeImpl<Base, This, Impl>
  >()

  constructor(arg: TreeAbstArg<Base, This, Impl>) {
    this.rootURL = arg.rootURL
    this.fileName = arg.fileName
    this.content = arg.content
    this.basis = arg.basis
    this.Base = arg.Base
  }

  children(): Delay<Iterable<Next<Base>>> {
    return delay(children<Base>, this)
  }

  ref(): Delay<Inst<Base, This>> {
    return delay(this._ref.ref(currentNode.getStore()))
  }

  async instantiate(
    parent: TreeNode<Base> | undefined,
    relPath: Readonly<RelPath> | null // null relation
  ): Promise<TreeNode<Base>> {
    const inst = this._ref.instantiate(this, parent, relPath)
    await currentNode.run(inst, async () => {
      await inst.module.initialize()
    })
    return inst
  }

  async main(context: Readonly<minissg.Context>): Promise<minissg.Module> {
    return (await this.instantiate(this.findParent(context), null)).module
  }

  getTreeNode(x: object): TreeNode<Base> | undefined {
    const tree = getTree(x)
    if (typeof tree !== 'object' || tree?.memo == null) return undefined
    return isTreeNodeOf(tree, this.Base) ? tree : undefined
  }

  getTreeAbst(x: object): TreeAbst<Base> | undefined {
    const tree = getTree(x)
    if (typeof tree !== 'object' || tree?.memo != null) return undefined
    return tree != null && isTreeAbstOf(tree, this.Base) ? tree : undefined
  }

  findParent(
    context: Readonly<minissg.Context> | undefined,
    except?: MainModule
  ): TreeNode<Base> | undefined {
    for (let c = context; c != null; c = c.parent) {
      if (c.module !== except && c.module instanceof this.Base) {
        const tree = this.getTreeNode(c.module)
        if (tree != null) return tree
      }
    }
    return undefined
  }

  load(): Delay<Impl | undefined> {
    return delay(async () => {
      if (typeof this.content !== 'function') return undefined
      const mod = await this.content(this.basis)
      return isMinissgMainModule(mod) ? undefined : mod
    })
  }

  fetch(): Delay<unknown> {
    return this.load()
  }

  _createInstance(
    parent: TreeNode<Base> | undefined,
    relPath: Readonly<RelPath> | null
  ): TreeNodeImpl<Base, This, Impl> {
    const arg = { _abst: this, content: this.content, parent }
    const tree = new TreeNodeImpl(relPath, arg)
    return tree
  }

  static decorate<Base, This extends Base & NodeMethod<Impl> & NodeProps, Impl>(
    arg: TreeAbstArg<Base, This, Impl>
  ): TreeAbstImpl<Base, This, Impl> {
    const node: This = Object.create(arg.basis) as typeof arg.basis
    const tree = new TreeAbstImpl({ ...arg, basis: node })
    setTree(tree, node)
    return tree
  }

  static currentFileName(): FileName {
    return currentNode.getStore()?.fileName ?? FileName.root
  }

  static createDirectory<Base>(): Dir<Base> {
    return new Indices<TreeAbst<Base>, AssetAbst<TreeNode<Base>>>()
  }

  declare readonly memo: undefined
}

export type Inst<Base, This = Base> = This & InstProps<Base>
type NodeProps = { [K in keyof InstProps<unknown>]: unknown }

interface InstProps<Base> {
  // these properties are defined only by TreeNodeImpl.
  readonly moduleName: string
  readonly stem: string
  readonly variant: string
  readonly url: Readonly<URL>
  readonly parent: Base | undefined
  readonly root: Base
}

export class Tree<Base, This extends Base, Impl> implements NodeProps {
  declare readonly moduleName: unknown
  declare readonly stem: unknown
  declare readonly variant: unknown
  declare readonly url: unknown
  declare readonly parent: unknown
  declare readonly root: unknown
  static {
    u.defineProperty(this.prototype, 'moduleName', { get: u.unavailable })
    u.defineProperty(this.prototype, 'stem', { get: u.unavailable })
    u.defineProperty(this.prototype, 'variant', { get: u.unavailable })
    u.defineProperty(this.prototype, 'url', { get: u.unavailable })
    u.defineProperty(this.prototype, 'parent', { get: u.unavailable })
    u.defineProperty(this.prototype, 'root', { get: u.unavailable })
  }

  get fileName(): string {
    return getTreeImpl(this)?.fileName.path ?? ''
  }

  get ref(): Delay<Inst<Base, This>> {
    return delay((getTreeImpl(this) ?? u.unavailable()).ref())
  }

  get children(): Delay<Iterable<Next<Base>>> {
    return (getTreeImpl(this) ?? u.unavailable()).children()
  }

  findByModuleName(path: string): Delay<Inst<Base> | undefined> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(findByModuleName, tree, path)
  }

  findByFileName(path: string): Delay<Inst<Base> | Asset | undefined> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(findByFileName, tree, path)
  }

  find(path: string): Delay<Inst<Base> | Asset | undefined> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(findByBoth, tree, path)
  }

  findByStem(stem: string): Delay<Set<Inst<Base>>> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(findByStem, tree, stem)
  }

  findByPath(
    path: ReadonlyArray<string | number>
  ): Delay<Inst<Base> | undefined> {
    return delay(findByPath<Base>, getTreeNodeImpl(this), path)
  }

  variants(): Delay<Set<Inst<Base>>> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(findByStem, tree, '/' + tree.stem.path)
  }

  subpages(): Delay<Set<Inst<Base>>> {
    const tree = getTreeNodeImpl(this)
    return tree.memo.memoize(subpages, tree)
  }

  load(): Delay<Impl | undefined> {
    const tree = getTreeImpl(this) ?? u.unavailable()
    return tree.load() ?? delay.resolve(undefined)
  }

  fetch(): Delay<unknown> {
    const tree = getTreeImpl(this) ?? u.unavailable()
    return tree.fetch() ?? delay.resolve(undefined)
  }

  protected memoize<Args extends readonly unknown[], Ret>(
    func: (this: void, ...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    const memo = getTreeImpl(this)?.memo
    return memo == null ? delay(func, ...args) : memo.memoize(func, ...args)
  }

  main(context: Readonly<minissg.Context>): Awaitable<minissg.Module> {
    return getTreeImpl(this)?.main(context) ?? u.unavailable()
  }

  render(this: Inst<Base, This>, module: Impl): Awaitable<minissg.Content> {
    const mod: unknown = module
    if (mod == null) return mod
    if (typeof mod === 'string') return mod
    if (mod instanceof Uint8Array) return mod
    if (typeof mod !== 'object') return `[${typeof mod}]`
    if ('default' in mod) return mod.default as minissg.Content
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return Reflect.apply(Object.prototype.toString, mod, [])
  }

  initialize(this: Inst<Base, This>): Awaitable<void> {}
}
