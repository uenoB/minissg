import { AsyncLocalStorage } from 'node:async_hooks'
import type * as minissg from '../../vite-plugin-minissg/src/module'
import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { isAbsURL, defineProperty, createObject, objectAssign } from './util'
import { type Delay, delay } from './delay'
import { Memo } from './memo'
import { PathSteps, FileName, concatName, concatFileName } from './filename'
import type { RelPath } from './filename'
import { type Next, Indices, find } from './find'
import type { Asset, AssetNode, AssetLeaf } from './asset'
import { Ref } from './ref'

export type MainModule = Readonly<{ main: minissg.Main }>
export type Loaded<Impl> = Awaitable<Impl | MainModule>

export const hasMinissgMain = (x: object): x is MainModule =>
  !(Symbol.iterator in x) && 'main' in x && typeof x.main === 'function'
export const isMinissgMainModule = (x: unknown): x is MainModule =>
  typeof x === 'object' && x != null && hasMinissgMain(x)

type TreeImpl<Base, This extends Base, Impl> =
  | TreeNodeImpl<Base, This, Impl>
  | TreeLeafImpl<Base, This, Impl>

const currentNode = new AsyncLocalStorage<TreeNode<unknown>>()
const internal = new WeakMap<object, TreeNode<unknown> | TreeLeaf<unknown>>()

const setTree = <Base, This extends Base, Impl>(
  tree: TreeImpl<Base, This, Impl>,
  obj: Base & object
): unknown => internal.set(obj, tree)

const getTree = (
  obj: object
): TreeNode<unknown> | TreeLeaf<unknown> | undefined => internal.get(obj)

const isTreeNodeOf = <Base>(
  x: TreeNode<unknown>,
  Base_: abstract new (...a: never) => Base
): x is TreeNode<Base> => x.module instanceof Base_

const isTreeLeafOf = <Base>(
  x: TreeLeaf<unknown>,
  Base_: abstract new (...a: never) => Base
): x is TreeLeaf<Base> => x.basis instanceof Base_

const getTreeImpl = <Base, This extends Base, Impl>(
  obj: Tree<Base, This, Impl>
): TreeImpl<Base, This, Impl> | undefined =>
  internal.get(obj) as TreeImpl<Base, This, Impl> | undefined

const unavailable = (): never => raise(Error('not available'))

const getTreeNodeImpl = <Base, This extends Base, Impl>(
  x: Tree<Base, This, Impl>
): TreeNodeImpl<Base, This, Impl> => {
  const tree = getTreeImpl(x)
  return tree?.memo != null ? tree : unavailable()
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
  if (isAbsURL(path)) return undefined
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
      for (const { leaf, relPath } of routes) {
        if (relPath.moduleName === step) {
          nodes.push(await leaf.instantiate(node, relPath))
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
        yield await next.leaf.instantiate(self, next.relPath)
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
    const leaf = self._leaf.getTreeLeaf(mod)
    if (leaf != null) return await leaf.instantiate(self, null)
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
  self: TreeNode<Base> | TreeLeaf<Base>
): Promise<Iterable<Next<Base>>> => {
  if (typeof self.content === 'function') return []
  const routes = (await self.content).moduleNameMap.routes()
  return (function* iterator(): Iterable<Next<Base>> {
    for (const { leaf, relPath } of routes) yield { leaf: leaf.basis, relPath }
  })()
}

const entries = async <Base>(self: TreeNode<Base>): Promise<minissg.Module> => {
  if (typeof self.content === 'function') return []
  const routes = (await self.content).moduleNameMap.routes()
  return (function* iterator(): Iterable<[string, Awaitable<minissg.Module>]> {
    for (const { leaf, relPath } of routes) {
      const mod = async (): Promise<MainModule> =>
        (await leaf.instantiate(self, relPath)).module
      yield [relPath.moduleName ?? '', delay(mod)]
    }
  })()
}

export type Dir<Base> = Indices<TreeLeaf<Base>, AssetLeaf<TreeNode<Base>>>

// these are private in each node and therefore safely hidden from other nodes.
type Public<X> = Omit<X, 'content' | 'module' | 'basis' | `_${string}`>

export interface TreeNode<Base>
  extends Public<TreeNodeImpl<Base, Base, unknown>> {
  readonly module: Base & MainModule & InstProps<Base>
  readonly content: ((...a: never) => unknown) | PromiseLike<Dir<Base>>
}

export interface TreeLeaf<Base>
  extends Public<TreeLeafImpl<Base, Base, unknown>> {
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
  readonly url: Readonly<URL>
  readonly parent: TreeNode<Base> | undefined
  readonly root: TreeNode<Base>
  readonly content: ((module: This) => Loaded<Impl>) | PromiseLike<Dir<Base>>
  readonly _leaf: TreeLeafImpl<Base, This, Impl>
  readonly module: This & NodeMethod<Impl> & InstProps<Base>

  constructor(
    relPath: Readonly<RelPath> | null,
    arg: Pick<TreeNodeImpl<Base, This, Impl>, '_leaf' | 'content' | 'parent'>
  ) {
    const { _leaf, content, parent } = arg
    const rootURL = parent?.root?.url ?? _leaf.rootURL ?? 'file:'
    this.memo = parent?.memo ?? new Memo()
    this.moduleName = concatName(parent?.moduleName, relPath?.moduleName)
    this.stem = concatName(parent?.stem, relPath?.stem)
    this.variant = concatName(parent?.variant, relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, relPath?.fileName)
    this.url = Object.freeze(new URL(this.moduleName.path, rootURL))
    this.parent = parent
    this.root = parent?.root ?? this
    this.content = content
    this._leaf = _leaf
    const inst = createObject(_leaf.basis)
    setTree(this, inst)
    const props: InstProps<Base> = {
      moduleName: this.moduleName.path,
      stem: this.stem.path,
      variant: this.variant.path,
      url: delay.dummy(this.url),
      parent: this.parent?.module,
      root: this.root.module
    }
    this.module = objectAssign(inst, props)
  }

  ref(): Delay<Inst<Base, This>> {
    return delay.dummy(this.module)
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
    const parent = this._leaf.findParent(c, this.module)
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
    return { default: delay(render3) }
  }
}

type TreeLeafArg<Base, This extends Base, Impl> = Pick<
  TreeLeafImpl<Base, This, Impl>,
  'rootURL' | 'fileName' | 'basis' | 'content' | 'Base'
>

export class TreeLeafImpl<Base, This extends Base, Impl> {
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

  constructor(arg: TreeLeafArg<Base, This, Impl>) {
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
    return this._ref.ref(currentNode.getStore())
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

  getTreeLeaf(x: object): TreeLeaf<Base> | undefined {
    const tree = getTree(x)
    if (typeof tree !== 'object' || tree?.memo != null) return undefined
    return tree != null && isTreeLeafOf(tree, this.Base) ? tree : undefined
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
    const arg = { _leaf: this, content: this.content, parent }
    const tree = new TreeNodeImpl(relPath, arg)
    return tree
  }

  static decorate<Base, This extends Base & NodeMethod<Impl> & NodeProps, Impl>(
    arg: TreeLeafArg<Base, This, Impl>
  ): TreeLeafImpl<Base, This, Impl> {
    const node: This = Object.create(arg.basis) as typeof arg.basis
    const tree = new TreeLeafImpl({ ...arg, basis: node })
    setTree(tree, node)
    return tree
  }

  static currentFileName(): FileName {
    return currentNode.getStore()?.fileName ?? FileName.root
  }

  static createDirectory<Base>(): Dir<Base> {
    return new Indices<TreeLeaf<Base>, AssetLeaf<TreeNode<Base>>>()
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
  readonly url: Delay<Readonly<URL>>
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
    defineProperty(this.prototype, 'moduleName', { get: unavailable })
    defineProperty(this.prototype, 'stem', { get: unavailable })
    defineProperty(this.prototype, 'variant', { get: unavailable })
    defineProperty(this.prototype, 'url', { get: unavailable })
    defineProperty(this.prototype, 'parent', { get: unavailable })
    defineProperty(this.prototype, 'root', { get: unavailable })
  }

  get fileName(): string {
    return getTreeImpl(this)?.fileName.path ?? ''
  }

  get ref(): Delay<Inst<Base, This>> {
    return (getTreeImpl(this) ?? unavailable()).ref()
  }

  get children(): Delay<Iterable<Next<Base>>> {
    return (getTreeImpl(this) ?? unavailable()).children()
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
    const tree = getTreeImpl(this) ?? unavailable()
    return tree.load() ?? delay.dummy(undefined)
  }

  fetch(): Delay<unknown> {
    const tree = getTreeImpl(this) ?? unavailable()
    return tree.fetch() ?? delay.dummy(undefined)
  }

  protected memoize<Args extends readonly unknown[], Ret>(
    func: (this: void, ...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    const memo = getTreeImpl(this)?.memo
    return memo == null ? delay(func, ...args) : memo.memoize(func, ...args)
  }

  main(context: Readonly<minissg.Context>): Awaitable<minissg.Module> {
    return getTreeImpl(this)?.main(context) ?? unavailable()
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
