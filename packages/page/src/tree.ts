import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { isAbsURL, hasMinissgMain, safeDefineProperty } from './util'
import { type Delay, delay } from './delay'
import { Memo } from './memo'
import { FileName, PathSteps, concatName, concatFileName } from './filename'
import type { RelPath, PathInfo } from './filename'
import { type Directory, tree_, find } from './directory'
import type { AssetImpl } from './asset'

const findByModuleName = async <
  ModuleType,
  Base extends Tree<ModuleType, Base>
>(
  self: TreeInstanceInternal<ModuleType, Base>,
  path: string
): Promise<Base | undefined> => {
  const key = path.startsWith('/')
    ? PathSteps.normalize(path.slice(1))
    : PathSteps.normalize(self.moduleName.path + '/' + path)
  const found = await find<'moduleNameMap', Base, never>(
    { node: self.root.module },
    'moduleNameMap',
    PathSteps.fromRelativeModuleName(key).path
  )
  if (found != null || key !== '') return found
  // in moduleNameMap, root is either "" or "."
  return await find<'moduleNameMap', Base, never>(
    { node: self.root.module, final: true },
    'moduleNameMap',
    ['']
  )
}

const findByFileName = async <ModuleType, Base extends Tree<ModuleType, Base>>(
  self: TreeInstanceInternal<ModuleType, Base>,
  path: string
): Promise<Base | AssetImpl | undefined> => {
  const key = path.startsWith('/')
    ? PathSteps.normalize(path.slice(1))
    : PathSteps.normalize(self.fileName.join(path).path)
  return await find<'fileNameMap', Base, AssetImpl>(
    { node: self.root.module },
    'fileNameMap',
    PathSteps.fromRelativeFileName(key).path
  )
}

const findByBoth = async <ModuleType, Base extends Tree<ModuleType, Base>>(
  self: TreeInternal<ModuleType, Base>,
  path: string
): Promise<Base | AssetImpl | undefined> => {
  if (isAbsURL(path)) return undefined
  const found = await self.findByModuleName(path)
  return found ?? (await self.findByFileName(path))
}

const variants = async <ModuleType, Base extends Tree<ModuleType, Base>>(
  self: TreeInstanceInternal<ModuleType, Base>
): Promise<Set<Base>> => {
  const set = new Set<Base>()
  const steps = PathSteps.fromRelativeModuleName(self.stem.path).path
  const root = self.root.module
  await find<'stemMap', Base, never>({ node: root }, 'stemMap', steps, set)
  return set
}

const findChild = async <ModuleType, Base extends Tree<ModuleType, Base>>(
  self: TreeInstanceInternal<ModuleType, Base>
): Promise<Base | undefined> => {
  let mod: unknown =
    typeof self.content === 'function'
      ? await self.memo.memoize(self.content)
      : await self.module.main(self)
  const moduleName = self.moduleName
  let context: minissg.Context = self
  while (typeof mod === 'object' && mod != null) {
    if (mod instanceof self.Base) return mod[tree_].instantiate(self)
    if (!hasMinissgMain(mod)) break
    context = Object.freeze({ moduleName, module: mod, parent: context })
    mod = await mod.main(context)
  }
  return undefined
}

const subpages = async <
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base
>(
  self: TreeInternal<ModuleType, Base, This>
): Promise<Iterable<This>> => {
  const items =
    typeof self.content === 'function' ? [] : (await self.content).moduleNameMap
  function* subpages(): Iterable<This> {
    for (const edges of items) {
      for (const { node, final } of edges) if (final) yield node
    }
  }
  return subpages()
}

export interface TreeFactoryArg<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  readonly relPath: Readonly<RelPath> | undefined
  readonly url: Readonly<URL> | string | Null
  readonly This: (abstract new (...args: never) => This) & {
    Base: abstract new (...args: never) => Base
  }
  readonly content:
    | ((...args: never) => unknown)
    | PromiseLike<Directory<Base, AssetImpl, This>>
  readonly createInstance: (
    self: unknown,
    parent: TreeInstanceInternal<ModuleType, Base> | undefined
  ) => TreeInstance<ModuleType, Base, This>
}

export class TreeFactoryArgImpl<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  constructor(
    readonly relPath: TreeFactoryArg<ModuleType, Base, This>['relPath'],
    readonly url: TreeFactoryArg<ModuleType, Base, This>['url'],
    readonly This: TreeFactoryArg<ModuleType, Base, This>['This'],
    readonly content:
      | ((self: TreeInstance<ModuleType, Base, This>) => Awaitable<ModuleType>)
      | PromiseLike<Directory<Base, AssetImpl, This>>
  ) {}

  createInstance(
    self: unknown,
    parent: TreeInstanceInternal<ModuleType, Base> | undefined
  ): TreeInstance<ModuleType, Base, This> {
    if (!(self instanceof this.This)) throw Error('improper call')
    const con = this.content
    type T = TreeInstance<ModuleType, Base, This>
    const inst: This & T = Object.create(self) as typeof self & T
    const content = typeof con === 'function' ? () => con(inst) : con
    const init = { parent, module: inst, content }
    const tree = new TreeInstanceInternal<ModuleType, Base, This>(this, init)
    safeDefineProperty(inst, tree_, { value: tree })
    inst.initialize()
    return inst
  }

  createFactory(
    self: This,
    content: TreeFactoryArgImpl<ModuleType, Base, This>['content'],
    relPath?: TreeFactoryArgImpl<ModuleType, Base, This>['relPath']
  ): TreeFactory<ModuleType, Base, This> {
    const arg = new TreeFactoryArgImpl(relPath, this.url, this.This, content)
    type T = TreeFactory<ModuleType, Base, This>
    const inst: T & This = Object.create(self) as typeof self & T
    const tree = new TreeFactoryInternal(arg, inst)
    safeDefineProperty(inst, tree_, { value: tree })
    return inst
  }
}

abstract class TreeInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  readonly Base: abstract new (...args: never) => Base
  abstract readonly relPath: Readonly<RelPath> | undefined
  abstract readonly moduleName: ModuleName
  abstract readonly stem: ModuleName
  abstract readonly variant: ModuleName
  abstract readonly fileName: FileName
  abstract readonly url: Readonly<URL> | undefined
  abstract readonly parent: TreeInstanceInternal<ModuleType, Base> | undefined
  abstract readonly module: minissg.Module
  abstract readonly memo: Memo
  abstract readonly content: TreeFactoryArg<ModuleType, Base, This>['content']
  abstract findByModuleName(path: string): Delay<Base | undefined>
  abstract findByFileName(path: string): Delay<Base | AssetImpl | undefined>
  abstract variants(): Delay<Set<Base>>
  abstract load(): Delay<ModuleType> | undefined
  abstract instantiate(
    context: Readonly<minissg.Context> | undefined
  ): TreeInstance<ModuleType, Base, This>
  abstract findChild(): PromiseLike<Base | undefined>
  abstract main(context: Readonly<minissg.Context>): Awaitable<minissg.Module>

  constructor(arg: TreeFactoryArg<ModuleType, Base>) {
    this.Base = arg.This.Base
  }

  find(path: string): Delay<Base | AssetImpl | undefined> {
    return this.memo.memoize(findByBoth, this, path)
  }

  findParent(
    context: Readonly<minissg.Context> | Null
  ): TreeInstanceInternal<ModuleType, Base> | undefined {
    for (let c = context; c != null; c = c.parent) {
      if (this.module !== c.module && c.module instanceof this.Base) {
        const tree = c.module[tree_]
        if (tree instanceof TreeInstanceInternal) return tree
      }
    }
    return undefined
  }

  subpages(): Delay<Iterable<This>> {
    return this.memo.memoize(subpages, this)
  }
}

class TreeInstanceInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> extends TreeInternal<ModuleType, Base> {
  override readonly relPath: undefined
  override readonly moduleName: ModuleName
  override readonly stem: ModuleName
  override readonly variant: ModuleName
  override readonly fileName: FileName
  override readonly url: Readonly<URL>
  override readonly parent: TreeInstanceInternal<ModuleType, Base> | undefined
  override readonly module: TreeInstance<ModuleType, Base, This>
  override readonly memo: Memo
  override readonly content:
    | (() => Awaitable<ModuleType>)
    | PromiseLike<Directory<Base, AssetImpl, This>>

  readonly root: TreeInstanceInternal<ModuleType, Base>

  constructor(
    arg: TreeFactoryArg<ModuleType, Base>,
    init: Pick<
      TreeInstanceInternal<ModuleType, Base, This>,
      'parent' | 'module' | 'content'
    >
  ) {
    super(arg)
    const { parent, module, content } = init
    const url = parent?.root?.url ?? arg.url ?? 'file:'
    this.moduleName = concatName(parent?.moduleName, arg.relPath?.moduleName)
    this.stem = concatName(parent?.stem, arg.relPath?.stem)
    this.variant = concatName(parent?.variant, arg.relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, arg.relPath?.fileName)
    this.url = new URL(this.moduleName.path, url)
    this.parent = parent
    this.module = module
    this.memo = parent?.memo ?? new Memo()
    this.content = content
    this.root = parent?.root ?? this
  }

  override findByModuleName(path: string): Delay<Base | undefined> {
    return this.memo.memoize(findByModuleName, this, path)
  }

  override findByFileName(path: string): Delay<Base | AssetImpl | undefined> {
    return this.memo.memoize(findByFileName, this, path)
  }

  override variants(): Delay<Set<Base>> {
    return this.memo.memoize(variants, this)
  }

  override load(): Delay<ModuleType> | undefined {
    if (typeof this.content !== 'function') return undefined
    return this.memo.memoize(this.content)
  }

  override instantiate(): TreeInstance<ModuleType, Base, This> {
    return this.module
  }

  override findChild(): Delay<Base | undefined> {
    return this.memo.memoize(findChild, this)
  }

  override async main(): Promise<minissg.Module> {
    const mod = await this.load()
    if (mod == null) {
      return Array.from(await this.subpages(), tree => {
        const name = tree[tree_].relPath?.moduleName.toRelativeModuleName()
        return [name ?? '', tree] as const
      })
    } else if (typeof mod === 'object' && hasMinissgMain(mod)) {
      return mod
    } else {
      return {
        default: delay(
          async () =>
            await this.memo.run(async () => await this.module.render(mod))
        )
      }
    }
  }
}

class TreeFactoryInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> extends TreeInternal<ModuleType, Base, This> {
  override readonly relPath: Readonly<RelPath> | undefined
  override readonly moduleName = ModuleName.root
  override readonly stem = ModuleName.root
  override readonly variant = ModuleName.root
  override readonly fileName = FileName.root
  override readonly url: Readonly<URL> | undefined
  override readonly parent: undefined
  override readonly module = this
  override readonly memo = new Memo()
  override readonly content: TreeInternal<ModuleType, Base, This>['content']
  readonly instances: WeakMap<object, TreeInstance<ModuleType, Base, This>>
  readonly arg: TreeFactoryArg<ModuleType, Base, This>
  readonly self: unknown

  constructor(arg: TreeFactoryArg<ModuleType, Base, This>, self: unknown) {
    super(arg)
    this.relPath = arg.relPath
    this.url = arg.url != null ? new URL(arg.url) : undefined
    this.content = arg.content
    this.instances = new WeakMap()
    this.arg = arg
    this.self = self
  }

  findByModuleName(path: string): Delay<Base | undefined> {
    const found = this.instantiate(this)[tree_].findByModuleName(path)
    return found ?? delay.dummy(undefined)
  }

  findByFileName(path: string): Delay<Base | AssetImpl | undefined> {
    const found = this.instantiate(this)[tree_].findByFileName(path)
    return found ?? delay.dummy(undefined)
  }

  variants(): Delay<Set<Base>> {
    const found = this.instantiate(this)[tree_].variants()
    return found ?? delay.dummy(new Set<Base>())
  }

  load(): undefined {
    return undefined
  }

  findChild(): Delay<undefined> {
    return delay.dummy(undefined)
  }

  instantiate(
    context: Readonly<minissg.Context> | undefined
  ): TreeInstance<ModuleType, Base, This> {
    const parent = this.findParent(context)
    const cached = this.instances.get(parent ?? this.instances)
    if (cached != null) return cached
    const inst = this.arg.createInstance(this.self, parent)
    this.instances.set(parent ?? this.instances, inst)
    return inst
  }

  main(context: Readonly<minissg.Context>): minissg.Module {
    return this.instantiate(context) ?? {}
  }
}

export type TreeInstance<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> = {
  readonly [tree_]: TreeInstanceInternal<ModuleType, Base, This>
} & This

export type TreeFactory<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> = {
  readonly [tree_]: TreeFactoryInternal<ModuleType, Base, This>
} & This

export abstract class Tree<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  declare readonly [tree_]: TreeInternal<ModuleType, Base, This>

  constructor(arg: TreeFactoryArg<ModuleType, Base, This>) {
    const tree = new TreeFactoryInternal(arg, this)
    safeDefineProperty(this, tree_, { value: tree })
  }

  main(context: Readonly<minissg.Context>): Awaitable<minissg.Module> {
    return this[tree_].main(context)
  }

  render(module: ModuleType): Awaitable<minissg.Content> {
    const mod: unknown = module
    if (mod == null) return mod
    if (typeof mod === 'string') return mod
    if (mod instanceof Uint8Array) return mod
    if (typeof mod !== 'object') return `[${typeof mod}]`
    if ('default' in mod) return mod.default as minissg.Content
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return Reflect.apply(Object.prototype.toString, mod, [])
  }

  initialize(): void {}

  abstract parsePath(path: string): Readonly<PathInfo>
  abstract paginatePath(index: number): Readonly<PathInfo>
}
