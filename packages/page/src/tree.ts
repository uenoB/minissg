import type * as minissg from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import { raise } from '../../vite-plugin-minissg/src/util'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { isAbsURL, safeDefineProperty } from './util'
import { type Delay, delay } from './delay'
import { Memo } from './memo'
import { PathSteps, concatName, concatFileName } from './filename'
import type { FileName, RelPath, PathInfo } from './filename'
import { type Directory, tree_, find } from './directory'
import type { AssetImpl } from './asset'

export type MainModule = Readonly<{ main: minissg.Main }>

export const hasMinissgMain = (x: object): x is MainModule =>
  !(Symbol.iterator in x) && 'main' in x && typeof x.main === 'function'

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
  self: TreeInstanceInternal<ModuleType, Base>,
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
): Promise<TreeInstance<ModuleType, Base> | undefined> => {
  let mod: unknown =
    typeof self.content === 'function'
      ? await self.memo.memoize(self.content)
      : await self.module.main(self)
  const moduleName = self.moduleName
  let context: minissg.Context = self
  while (typeof mod === 'object' && mod != null) {
    if (mod instanceof self.BaseFn) return mod[tree_].instantiate(self)
    if (!hasMinissgMain(mod)) break
    context = Object.freeze({ moduleName, module: mod, parent: context })
    mod = await mod.main(context)
  }
  return undefined
}

const load = async <
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base
>(
  self: TreeInstanceInternal<ModuleType, Base, This>
): Promise<ModuleType | undefined> => {
  if (typeof self.content !== 'function') return undefined
  const m = await self.memo.memoize(self.content)
  return typeof m === 'object' && m != null && hasMinissgMain(m) ? undefined : m
}

const subpages = async <
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base
>(
  self: TreeInstanceInternal<ModuleType, Base, This>
): Promise<Iterable<[string, TreeInstance<ModuleType, Base, This>]>> => {
  type T = TreeInstance<ModuleType, Base, This>
  if (typeof self.content === 'function') return [][Symbol.iterator]()
  const items = (await self.content).moduleNameMap
  function* subpages(): Iterable<[string, T]> {
    for (const edges of items) {
      for (const { node, final } of edges) {
        if (!final) continue
        const name = node[tree_].relPath?.moduleName.toRelativeModuleName()
        yield [name ?? '', node[tree_].instantiate(self)] as const
      }
    }
  }
  return subpages()
}

export type Loaded<ModuleType> = Awaitable<ModuleType | MainModule>
type TreeDirectory<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> = Directory<Base, AssetImpl, TreeFactory<ModuleType, Base, This>>

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
    | PromiseLike<TreeDirectory<ModuleType, Base, This>>
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
      | ((self: TreeInstance<ModuleType, Base, This>) => Loaded<ModuleType>)
      | PromiseLike<TreeDirectory<ModuleType, Base, This>>
  ) {}

  createInstance(
    self: unknown,
    parent: TreeInstanceInternal<ModuleType, Base> | undefined
  ): TreeInstance<ModuleType, Base, This> {
    const c = this.content
    if (c == null || !(self instanceof this.This)) throw Error('improper call')
    type T = TreeInstance<ModuleType, Base, This>
    const inst: This & T = Object.create(self) as typeof self & T
    const content = typeof c === 'function' ? () => c(inst) : c
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
  readonly moduleName: ModuleName = ModuleName.root
  readonly stem: ModuleName | undefined
  readonly variant: ModuleName | undefined
  readonly fileName: FileName | undefined
  readonly relPath: Readonly<RelPath> | undefined
  readonly url: Readonly<URL> | undefined
  readonly parent: TreeInstanceInternal<ModuleType, Base> | undefined
  readonly root: TreeInstanceInternal<ModuleType, Base> | undefined
  readonly memo: Memo | undefined
  readonly module: minissg.Module = {}
  abstract readonly content: TreeFactoryArg<ModuleType, Base, This>['content']

  findByModuleName(_path: string): Delay<Base | undefined> {
    return delay.dummy(undefined)
  }

  findByFileName(_path: string): Delay<Base | AssetImpl | undefined> {
    return delay.dummy(undefined)
  }

  find(_path: string): Delay<Base | AssetImpl | undefined> {
    return delay.dummy(undefined)
  }

  variants(): Delay<Set<Base>> {
    return delay.dummy(new Set<Base>())
  }

  load(): Delay<ModuleType | undefined> {
    return delay.dummy(undefined)
  }

  subpages(): Delay<Iterable<[string, This]>> {
    return delay.dummy([])
  }

  findChild(): Delay<TreeInstance<ModuleType, Base> | undefined> {
    return delay.dummy(undefined)
  }

  abstract instantiate(
    _context?: Readonly<minissg.Context> | undefined
  ): TreeInstance<ModuleType, Base, This>

  main(context: Readonly<minissg.Context>): Awaitable<minissg.Module> {
    return this.instantiate(context)
  }
}

class TreeInstanceInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> extends TreeInternal<ModuleType, Base> {
  override readonly moduleName: ModuleName
  override readonly stem: ModuleName
  override readonly variant: ModuleName
  override readonly fileName: FileName
  override readonly url: Readonly<URL>
  override readonly parent: TreeInstanceInternal<ModuleType, Base> | undefined
  override readonly root: TreeInstanceInternal<ModuleType, Base>
  override readonly memo: Memo
  override readonly module: TreeInstance<ModuleType, Base, This>
  override readonly content:
    | (() => Loaded<ModuleType>)
    | PromiseLike<TreeDirectory<ModuleType, Base, This>>

  readonly BaseFn: abstract new (...args: never) => Base

  constructor(
    arg: TreeFactoryArg<ModuleType, Base>,
    init: Pick<
      TreeInstanceInternal<ModuleType, Base, This>,
      'parent' | 'module' | 'content'
    >
  ) {
    super()
    const { parent, module, content } = init
    const url = parent?.root?.url ?? arg.url ?? 'file:'
    this.moduleName = concatName(parent?.moduleName, arg.relPath?.moduleName)
    this.stem = concatName(parent?.stem, arg.relPath?.stem)
    this.variant = concatName(parent?.variant, arg.relPath?.variant)
    this.fileName = concatFileName(parent?.fileName, arg.relPath?.fileName)
    this.url = Object.freeze(new URL(this.moduleName.path, url))
    this.parent = parent
    this.root = parent?.root ?? this
    this.memo = parent?.memo ?? new Memo()
    this.module = module
    this.content = content
    this.BaseFn = parent?.BaseFn ?? arg.This.Base
  }

  override findByModuleName(path: string): Delay<Base | undefined> {
    return this.memo.memoize(findByModuleName, this, path)
  }

  override findByFileName(path: string): Delay<Base | AssetImpl | undefined> {
    return this.memo.memoize(findByFileName, this, path)
  }

  override find(path: string): Delay<Base | AssetImpl | undefined> {
    return this.memo.memoize(findByBoth, this, path)
  }

  override variants(): Delay<Set<Base>> {
    return this.memo.memoize(variants, this)
  }

  override load(): Delay<ModuleType | undefined> {
    return this.memo.memoize(load, this)
  }

  override subpages(): Delay<Iterable<[string, This]>> {
    return this.memo.memoize(subpages, this)
  }

  override findChild(): Delay<TreeInstance<ModuleType, Base> | undefined> {
    return this.memo.memoize(findChild, this)
  }

  override instantiate(): TreeInstance<ModuleType, Base, This> {
    return this.module
  }

  override async main(): Promise<minissg.Module> {
    if (typeof this.content !== 'function') return await subpages(this)
    const m = await this.memo.memoize(this.content)
    if (typeof m === 'object' && m != null && hasMinissgMain(m)) return m
    const render = async (): Promise<minissg.Content> =>
      await this.module.render(m)
    return { default: delay(async () => await this.memo.run(render)) }
  }
}

class TreeFactoryInternal<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> extends TreeInternal<ModuleType, Base, This> {
  override readonly relPath: Readonly<RelPath> | undefined
  override readonly url: Readonly<URL> | undefined
  override readonly module = this
  override readonly content: TreeInternal<ModuleType, Base, This>['content']
  readonly BaseFn: abstract new (...args: never) => Base
  readonly instances: WeakMap<object, TreeInstance<ModuleType, Base, This>>
  readonly arg: TreeFactoryArg<ModuleType, Base, This>
  readonly self: unknown

  constructor(arg: TreeFactoryArg<ModuleType, Base, This>, self: unknown) {
    super()
    this.relPath = arg.relPath
    this.url = arg.url != null ? Object.freeze(new URL(arg.url)) : undefined
    this.content = arg.content
    this.BaseFn = arg.This.Base
    this.instances = new WeakMap()
    this.arg = arg
    this.self = self
  }

  override instantiate(
    context?: Readonly<minissg.Context> | undefined
  ): TreeInstance<ModuleType, Base, This> {
    const parent = this.findParent(context)
    const cached = this.instances.get(parent ?? this.instances)
    if (cached != null) return cached
    const inst = this.arg.createInstance(this.self, parent)
    this.instances.set(parent ?? this.instances, inst)
    return inst
  }

  findParent(
    context: Readonly<minissg.Context> | Null
  ): TreeInstanceInternal<ModuleType, Base> | undefined {
    for (let c = context; c != null; c = c.parent) {
      if (this.module !== c.module && c.module instanceof this.BaseFn) {
        const tree = c.module[tree_]
        if (tree instanceof TreeInstanceInternal) return tree
      }
    }
    return undefined
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

class TreeNullInternal extends TreeInternal<never, never, never> {
  static instance = new this()
  override readonly content = (): never => raise(Error('cannot instantiate'))
  override readonly instantiate = this.content
}

export abstract class Tree<
  ModuleType,
  Base extends Tree<ModuleType, Base>,
  This extends Base = Base
> {
  declare readonly [tree_]: TreeInternal<ModuleType, Base, This>

  constructor() {
    safeDefineProperty(this, tree_, { value: TreeNullInternal.instance })
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

  abstract parsePath(path: string): Readonly<PathInfo> | Null
  abstract paginatePath(index: number): Readonly<PathInfo> | Null
}
