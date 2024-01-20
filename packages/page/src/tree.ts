import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { isAbsURL, hasMinissgEntries, safeDefineProperty } from './util'
import type { Optional } from './util'
import type { Delay } from './delay'
import { Memo } from './memo'
import { type Factory, Product } from './factory'
import { FileName, PathSteps } from './filename'
import { type Directory, tree_, find } from './directory'
import type { Asset } from './asset'

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

export abstract class TreeFactory<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base,
  Args extends unknown[] = never
> {
  private instances: WeakMap<object, This> | undefined

  constructor(
    readonly factory: Factory<This, Args>,
    readonly content:
      | ((self: This) => Awaitable<ModuleType>)
      | PromiseLike<Directory<Base, Asset, This>>
  ) {}

  abstract init(tree: This): void

  create(
    init: Optional<TreeInit<ModuleType, Base>>,
    parent?: TreeInternal<ModuleType, Base> | Null // null means root
  ): This {
    return this.factory.create(self => {
      const con = this.content
      const treeInit: TreeInit<ModuleType, Base, This> = {
        relPath: init.relPath ?? undefined,
        url: init.url ?? undefined,
        parent: parent ?? init.parent ?? undefined,
        Base: init.Base ?? this.factory.This,
        factory: parent === undefined ? this : undefined,
        content: typeof con === 'function' ? () => con(self) : con
      }
      const tree = new TreeInternal(treeInit, self)
      safeDefineProperty(self, tree_, { value: tree })
      this.init(self)
    })
  }

  createInstance(
    init: Optional<TreeInit<ModuleType, Base>>,
    parent: Tree<ModuleType, Base> | undefined
  ): This {
    this.instances ??= new WeakMap<object, This>()
    const cached = this.instances.get(parent ?? rootKey)
    if (cached != null) return cached
    const self = this.create(init, parent?.[tree_] ?? null)
    this.instances.set(parent ?? rootKey, self)
    return self
  }
}

type SomeTreeFactory<ModuleType, Base extends Tree<ModuleType, Base>> = Pick<
  TreeFactory<ModuleType, Base>,
  'createInstance'
>

interface TreeInit<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  readonly relPath?: Readonly<RelPath> | undefined
  readonly url?: Readonly<URL> | string | undefined
  readonly parent?: TreeInternal<ModuleType, Base> | undefined
  readonly Base: new (...args: never) => Base
  readonly factory?: SomeTreeFactory<ModuleType, Base> | undefined
  readonly content:
    | (() => Awaitable<ModuleType>)
    | PromiseLike<Directory<Base, Asset, This>>
}

class TreeInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  readonly relPath: Readonly<RelPath> | undefined
  readonly moduleName: ModuleName
  readonly stem: ModuleName
  readonly variant: ModuleName
  readonly fileName: FileName
  readonly url: Readonly<URL>
  readonly memo: Memo
  readonly root: TreeInternal<ModuleType, Base>
  readonly parent: TreeInternal<ModuleType, Base> | undefined
  readonly content: TreeInit<ModuleType, Base, This>['content']
  readonly factory: TreeInit<ModuleType, Base, This>['factory']
  readonly Base: TreeInit<ModuleType, Base, This>['Base']
  readonly module: This

  constructor(init: TreeInit<ModuleType, Base, This>, module: This) {
    const { parent, relPath, url } = init
    this.relPath = relPath
    this.moduleName = concatName(parent?.moduleName, relPath?.moduleName)
    this.stem = concatName(parent?.stem, relPath?.stem)
    this.variant = concatName(parent?.variant, relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, relPath?.fileName)
    this.url = new URL(this.moduleName.path, parent?.root.url ?? url ?? 'file:')
    this.memo = parent?.memo ?? new Memo()
    this.root = parent?.root ?? this
    this.parent = parent
    this.content = init.content
    this.factory = init.factory
    this.module = module
    this.Base = init.Base
  }

  findParent(context: Readonly<minissg.Context> | Null): Base | undefined {
    for (let c = context; c != null; c = c.parent) {
      if (this.module !== c.module && c.module instanceof this.Base) {
        if (c.module[tree_].factory == null) return c.module
      }
    }
    return undefined
  }

  async #findChild(this: void, self: this): Promise<Base | undefined> {
    let module: unknown = await self.load()
    const moduleName = self.moduleName
    let context: minissg.Context = self
    while (typeof module === 'object' && module != null) {
      if (module instanceof self.Base) return module[tree_].instantiate(context)
      if (!hasMinissgEntries(module)) break
      context = Object.freeze({ moduleName, module, parent: context })
      module = await module.entries(context)
    }
    return undefined
  }

  findChild(): PromiseLike<Base | undefined> {
    return this.memo.memoize(this.#findChild, this)
  }

  load(): Delay<ModuleType> | undefined {
    if (typeof this.content !== 'function') return undefined
    return this.memo.memoize(this.content)
  }

  instantiate(context: Readonly<minissg.Context>): Base | undefined {
    if (this.factory == null) return undefined
    return this.factory.createInstance(this, this.findParent(context))
    // ToDo: check this.relPath.moduleName is consistent with context.moduleName
  }

  async findByModuleName(
    this: void,
    self: TreeInternal<ModuleType, Base>,
    path: string
  ): Promise<Base | undefined> {
    const key = path.startsWith('/')
      ? PathSteps.normalize(path.slice(1))
      : PathSteps.normalize(self.moduleName.path + '/' + path)
    const root = self.root.instantiate(self.root) ?? self.root.module
    const found = await find<'moduleNameMap', Base, never>(
      { node: root },
      'moduleNameMap',
      PathSteps.fromRelativeModuleName(key).path
    )
    if (found != null || key !== '') return found
    // in moduleNameMap, root is either "" or "."
    return await find<'moduleNameMap', Base, never>(
      { node: root, final: true },
      'moduleNameMap',
      ['']
    )
  }

  async findByFileName(
    this: void,
    self: TreeInternal<ModuleType, Base>,
    path: string
  ): Promise<Base | Asset | undefined> {
    const key = path.startsWith('/')
      ? PathSteps.normalize(path.slice(1))
      : PathSteps.normalize(self.fileName.join(path).path)
    return await find<'fileNameMap', Base, Asset>(
      { node: self.root.instantiate(self.root) ?? self.root.module },
      'fileNameMap',
      PathSteps.fromRelativeModuleName(key).path
    )
  }

  async find(
    this: void,
    self: TreeInternal<ModuleType, Base>,
    path: string
  ): Promise<Base | Asset | undefined> {
    if (isAbsURL(path)) return undefined
    return (
      (await self.memo.memoize(self.findByModuleName, self, path)) ??
      (await self.memo.memoize(self.findByFileName, self, path))
    )
  }

  async variants(
    this: void,
    self: TreeInternal<ModuleType, Base>
  ): Promise<Set<Base>> {
    const steps = PathSteps.fromRelativeModuleName(self.stem.path).path
    const root = self.root.instantiate(self.root) ?? self.root.module
    const set = new Set<Base>()
    await find<'stemMap', Base, never>({ node: root }, 'stemMap', steps, set)
    return set
  }

  async subpages(): Promise<This[]> {
    const ret: This[] = []
    if (typeof this.content === 'function') return ret
    for (const edges of (await this.content).moduleNameMap) {
      for (const { node, final } of edges) if (final) ret.push(node)
    }
    return ret
  }
}

export class Tree<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> extends Product {
  declare readonly [tree_]: TreeInternal<ModuleType, Base, This>

  async entries(_context: Readonly<minissg.Context>): Promise<minissg.Module> {
    return (await this[tree_].subpages()).map(page => [
      page[tree_].relPath?.moduleName.toRelativeModuleName() ?? '',
      page
    ])
  }

  declare type: 'page'
}

safeDefineProperty(Tree.prototype, 'type', {
  writable: true,
  configurable: true,
  value: 'page' as const
})
