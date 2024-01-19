import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { isAbsURL, safeDefineProperty } from './util'
import { type Delay, delay } from './delay'
import { Memo } from './memo'
import { FileName, PathSteps } from './filename'
import { type Directory, type Asset, type AssetModule, find } from './directory'

export const tree_: unique symbol = Symbol('tree')

interface AbstractPage<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>
> {
  readonly [tree_]: Tree<ModuleType, Base>
  readonly entries: minissg.Entries // to be a Module
}

const findParent = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  context: Readonly<minissg.Context> | Null
): Base | undefined => {
  for (let c = context; c != null; c = c.parent) {
    if (tree.self !== c.module && c.module instanceof tree.Base) {
      if (c.module[tree_].instances == null) return c.module
    }
  }
  return undefined
}

const findChild = async <
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>
>(
  tree: Tree<ModuleType, Base>
): Promise<Tree<ModuleType, Base> | undefined> => {
  const moduleName = tree.moduleName
  let module = (await tree.load()) as minissg.Module
  let context: minissg.Context = tree
  while (typeof module === 'object' && module != null) {
    if (module instanceof tree.Base) return module[tree_].instantiate(context)
    if (Symbol.iterator in module) break
    if (!('entries' in module && typeof module.entries === 'function')) break
    context = Object.freeze({ moduleName, module, parent: context })
    module = await module.entries(context)
  }
  return undefined
}

const findByModuleName = async <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Promise<Base | undefined> => {
  const key = path.startsWith('/')
    ? PathSteps.normalize(path.slice(1))
    : PathSteps.normalize(tree.moduleName.path + '/' + path)
  const root = tree.root.instantiate(tree.root) ?? tree.root
  const found = await find<Tree<unknown, Base>, 'moduleNameMap'>(
    { node: root },
    'moduleNameMap',
    PathSteps.fromRelativeModuleName(key).path
  )
  if (found != null || key !== '') return found
  // in moduleNameMap, root is either "" or "."
  return await find<Tree<unknown, Base>, 'moduleNameMap'>(
    { node: root, final: true },
    'moduleNameMap',
    ['']
  )
}

const findByFileName = async <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Promise<Base | Asset | undefined> => {
  const key = path.startsWith('/')
    ? PathSteps.normalize(path.slice(1))
    : PathSteps.normalize(tree.fileName.join(path).path)
  return await find<Tree<unknown, Base>, 'fileNameMap'>(
    { node: tree.root.instantiate(tree.root) ?? tree.root },
    'fileNameMap',
    PathSteps.fromRelativeModuleName(key).path
  )
}

const findByAny = <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Awaitable<Base | Asset | undefined> => {
  if (isAbsURL(path)) return undefined
  return tree.memo
    .memoize(findByModuleName, tree, path)
    .then(r => r ?? tree.memo.memoize(findByFileName, tree, path))
}

const variants = async <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>
): Promise<Set<Base>> => {
  const steps = PathSteps.fromRelativeModuleName(tree.stem.path).path
  const root = tree.root.instantiate(tree.root) ?? tree.root
  const set = new Set<Base>()
  await find({ node: root }, 'stemMap', steps, set)
  return set
}

export interface RelPath {
  fileName: PathSteps
  moduleName: PathSteps
  stem: PathSteps
  variant: PathSteps
}

const concatName = (
  base: ModuleName | Null,
  steps: PathSteps | Null
): ModuleName =>
  (base ?? ModuleName.root).join(steps?.toRelativeModuleName() ?? '')

const concatFileName = (
  base: FileName | Null,
  steps: PathSteps | Null
): FileName => (base ?? FileName.root).join(steps?.toRelativeFileName() ?? '')

const rootKey: object = {}

interface TreeArg<Base> {
  readonly Base: new (...args: never) => Base
  readonly relPath?: Readonly<RelPath> | undefined
  readonly url?: Readonly<URL> | string | Null
}

export type DirectoryTree<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>,
  This extends Base = Base
> = Directory<Tree<ModuleType, Base>, Tree<ModuleType, Base, This>>

export class Tree<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>,
  This extends Base = Base
> {
  readonly instances: object | undefined
  readonly relPath: Readonly<RelPath> | undefined
  readonly moduleName: ModuleName
  readonly stem: ModuleName
  readonly variant: ModuleName
  readonly fileName: FileName
  readonly url: Readonly<URL>
  readonly memo: Memo
  readonly root: Tree<ModuleType, Base>
  readonly parent: Tree<ModuleType, Base> | undefined
  readonly self: This
  readonly Base: new (...args: never) => Base
  readonly content:
    | (() => Awaitable<ModuleType>)
    | PromiseLike<DirectoryTree<ModuleType, Base, This>>

  constructor(
    arg: TreeArg<Base>,
    self: This,
    content: Tree<ModuleType, Base, This>['content'],
    parent?: Tree<ModuleType, Base> | undefined
  ) {
    this.moduleName = concatName(parent?.moduleName, arg.relPath?.moduleName)
    this.stem = concatName(parent?.stem, arg.relPath?.stem)
    this.variant = concatName(parent?.variant, arg.relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, arg.relPath?.fileName)
    const baseURL = parent?.root.url ?? arg.url ?? 'file:'
    this.url = new URL(this.moduleName.path, baseURL)
    this.memo = parent?.root.memo ?? new Memo()
    this.root = parent?.root ?? this
    this.parent = parent
    this.self = self
    this.relPath = arg.relPath
    this.Base = arg.Base
    this.content = content
  }

  instantiate(
    _context: Readonly<minissg.Context>
  ): Tree<ModuleType, Base> | undefined {
    return undefined
  }

  findChild(): Delay<Tree<ModuleType, Base> | undefined> {
    return this.memo.memoize(findChild, this)
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    return this.memo.memoize(findByModuleName, this, path)
  }

  findByFileName(path: string): Delay<Base | Asset | undefined> {
    return this.memo.memoize(findByFileName, this, path)
  }

  find(path: string): Delay<Base | Asset | undefined> {
    return this.memo.memoize(findByAny, this, path)
  }

  variants(): Delay<Set<Base>> {
    return this.memo.memoize(variants, this)
  }

  load(): Delay<ModuleType> | undefined {
    if (typeof this.content !== 'function') return undefined
    return this.memo.memoize(this.content)
  }

  async entries(): Promise<Array<readonly [string, This]>> {
    const ret: Array<readonly [string, This]> = []
    if (typeof this.content === 'function') return ret
    for (const edges of (await this.content).moduleNameMap) {
      for (const { node, final } of edges) {
        if (!final) continue
        const path = node.relPath?.moduleName.toRelativeModuleName() ?? ''
        ret.push([path, node.self])
      }
    }
    return ret
  }

  // to be a Context
  get module(): Base {
    return this.self
  }
}

export class TreeFactory<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>,
  This extends Base = Base
> extends Tree<ModuleType, Base, This> {
  override readonly instances: WeakMap<object, Tree<ModuleType, Base, This>>
  private readonly loader: ((page: This) => Awaitable<ModuleType>) | undefined

  constructor(
    arg: TreeArg<Base>,
    self: This,
    content:
      | ((page: This) => Awaitable<ModuleType>)
      | PromiseLike<DirectoryTree<ModuleType, Base, This>>
  ) {
    const con = typeof content === 'function' ? () => content(self) : content
    super(arg, self, con)
    this.loader = typeof content === 'function' ? content : undefined
    this.instances = new WeakMap()
  }

  override instantiate(
    context: Readonly<minissg.Context>
  ): Tree<ModuleType, Base, This> {
    const parent = findParent(this, context)?.[tree_]
    const cached = this.instances.get(parent ?? rootKey)
    if (cached != null) return cached
    // ToDo: check this.relPath.moduleName is consistent with context.moduleName
    const self: This = Object.create(this.self) as typeof this.self
    const loader = this.loader
    const content = loader != null ? () => loader(self) : this.content
    const tree = new Tree(this, self, content, parent)
    safeDefineProperty(self, tree_, { value: tree })
    this.instances.set(parent ?? rootKey, tree)
    return tree
  }
}

const assetURL = async (
  load: () => Awaitable<AssetModule>,
  origin: URL
): Promise<string> => new URL((await load()).default, origin).href

export class AssetTree<Base extends AbstractPage<unknown, Base>> {
  constructor(
    private readonly tree: Tree<unknown, Base>,
    private readonly load: (() => Awaitable<AssetModule>) | string
  ) {}

  get self(): Asset {
    const origin = new URL('/', this.tree.url)
    const load = this.load
    const url =
      typeof load === 'string'
        ? delay.dummy(new URL(load, origin).href)
        : this.tree.memo.memoize(assetURL, load, origin)
    return { type: 'asset', url }
  }

  instantiate(context: Readonly<minissg.Context>): AssetTree<Base> | undefined {
    const root = findParent(this.tree, context)?.[tree_].root
    return root == null ? undefined : new AssetTree(root, this.load)
  }
}
