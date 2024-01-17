import type { Context, Module } from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { isAbsURL } from './util'
import type { Delay } from './delay'
import { Memo } from './memo'
import { FileName, PathSteps } from './filename'
import { type Directory, type Asset, find } from './directory'

export const tree_: unique symbol = Symbol('tree')

interface AbstractPage<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>
> {
  readonly [tree_]: Tree<ModuleType, Base>
  entries: (context: Readonly<Context>) => Awaitable<Module> // to be a Module
}

export type PageAllocator<
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>,
  This extends Base = Base
> = (init: (self: Base) => Tree<ModuleType, Base>) => This

const isPrototypeOf = (x: object | null, y: object): boolean =>
  x != null && Object.prototype.isPrototypeOf.call(x, y)

const isPageOf = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  other: object,
  tree: Tree<ModuleType, Base>
): other is Base =>
  tree_ in other && isPrototypeOf(Reflect.getPrototypeOf(tree.root.self), other)

const isPageInstOf = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  other: object,
  tree: Tree<ModuleType, Base>
): other is Base => isPageOf(other, tree) && other[tree_].instances == null

const findParent = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  context: Readonly<Context> | Null
): Base | undefined => {
  for (let c = context; c != null; c = c.parent) {
    if (tree.self !== c.module && isPageInstOf(c.module, tree)) return c.module
  }
  return undefined
}

const findChild = async <
  ModuleType,
  Base extends AbstractPage<ModuleType, Base>
>(
  tree: Tree<ModuleType, Base>
): Promise<Tree<ModuleType, Base> | undefined> => {
  if (typeof tree.content !== 'function') return undefined
  const moduleName = tree.moduleName
  let module = (await tree.memo.memoize(tree.content)) as Module
  let context: Context = tree
  while (typeof module === 'object' && module != null) {
    if (isPageOf(module, tree)) return module[tree_].instantiate(context)
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

const findByFileName = <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Awaitable<Base | Asset | undefined> => {
  const key = path.startsWith('/')
    ? PathSteps.normalize(path.slice(1))
    : PathSteps.normalize(tree.fileName.join(path).path)
  return find<Tree<unknown, Base>, 'fileNameMap'>(
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

export class Tree<ModuleType, Base extends AbstractPage<ModuleType, Base>> {
  readonly instances: WeakMap<object, Base> | undefined
  readonly alloc: PageAllocator<ModuleType, Base>
  readonly relPath: Readonly<RelPath> | undefined
  readonly moduleName: ModuleName
  readonly stem: ModuleName
  readonly variant: ModuleName
  readonly fileName: FileName
  readonly url: Readonly<URL>
  readonly memo: Memo
  readonly root: Tree<ModuleType, Base>
  readonly parent: Tree<ModuleType, Base> | undefined
  readonly self: Base
  readonly content:
    | (() => Awaitable<ModuleType>)
    | PromiseLike<Directory<Tree<ModuleType, Base>>>
    | undefined

  constructor(
    parent: Tree<ModuleType, Base> | null | undefined, // null means root
    self: Base,
    arg: Readonly<{
      alloc: PageAllocator<ModuleType, Base>
      content?: Tree<ModuleType, Base>['content']
      relPath?: Tree<ModuleType, Base>['relPath']
      url?: Readonly<URL> | string | Null
    }>
  ) {
    this.instances = parent === undefined ? new WeakMap() : undefined
    this.alloc = arg.alloc
    this.content = arg.content
    this.relPath = arg.relPath
    this.moduleName = concatName(parent?.moduleName, arg.relPath?.moduleName)
    this.stem = concatName(parent?.stem, arg.relPath?.stem)
    this.variant = concatName(parent?.variant, arg.relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, arg.relPath?.fileName)
    const baseURL = parent?.root.url ?? arg.url ?? 'file:'
    this.url = new URL(this.moduleName.path, baseURL)
    this.memo = parent?.root.memo ?? new Memo()
    this.root = parent?.root ?? this
    this.parent = parent ?? undefined
    this.self = self
  }

  instantiate(context: Readonly<Context>): Tree<ModuleType, Base> | undefined {
    if (this.instances == null) return undefined
    const parent = findParent(this, context)?.[tree_] ?? null
    const cached = this.instances.get(parent ?? rootKey)
    if (cached != null) return cached[tree_]
    // ToDo: check this.relPath.moduleName is consistent with context.moduleName
    const page = this.alloc(self => new Tree(parent, self, this))
    this.instances.set(parent ?? rootKey, page)
    return page[tree_]
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

  async entries(): Promise<Array<readonly [string, Base]>> {
    const ret: Array<readonly [string, Base]> = []
    if (this.content == null || typeof this.content === 'function') return ret
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
