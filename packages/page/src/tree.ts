import type { Module, Context } from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { dirPath, normalizePath, isAbsURL } from './util'
import type { Delay } from './delay'
import { Memo } from './memo'
import { type Directory, type Asset, pathSteps, find } from './directory'

export const tree_: unique symbol = Symbol('tree')

interface AbstractPage<ModuleType, Base extends AbstractPage<ModuleType, Base>>
  extends Context {
  readonly [tree_]: Tree<ModuleType, Base>
}

const isPrototypeOf = (x: object | null, y: object): boolean =>
  x != null && Object.prototype.isPrototypeOf.call(x, y)

const isBase = <Base extends AbstractPage<unknown, Base>>(
  x: object
): x is Base => tree_ in x

const isChildOf = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  self: Base,
  other: object
): other is Base =>
  isBase<Base>(other) &&
  isPrototypeOf(Reflect.getPrototypeOf(other[tree_].root.self), self)

const isParentOf = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  tree: Tree<ModuleType, Base>,
  other: object
): other is Base =>
  isBase<Base>(other) &&
  isPrototypeOf(Reflect.getPrototypeOf(tree.root.self), other)

const findParent = <ModuleType, Base extends AbstractPage<ModuleType, Base>>(
  self: Base,
  context: Readonly<Context> | Null
): Base | undefined => {
  for (let c = context; c != null; c = c.parent) {
    if (isChildOf(self, c.module) && self !== c.module) return c.module
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
  let context: Context = tree.self
  while (typeof module === 'object' && module != null) {
    if (isParentOf(tree, module)) return module[tree_]
    if (!('entries' in module && typeof module.entries === 'function')) break
    context = Object.freeze({ moduleName, module, parent: context })
    module = await module.entries(context)
  }
  return undefined
}

const findByModuleName = <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Awaitable<Base | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(tree.moduleName.path + '/' + path)
  return find<Tree<unknown, Base>, 'moduleNameMap'>(
    { node: tree.root },
    'moduleNameMap',
    pathSteps(key)
  )
}

const findByFileName = <Base extends AbstractPage<unknown, Base>>(
  tree: Tree<unknown, Base>,
  path: string
): Awaitable<Base | Asset | undefined> => {
  const key = path.startsWith('/')
    ? normalizePath(path.slice(1))
    : normalizePath(dirPath(tree.fileName) + path)
  return find<Tree<unknown, Base>, 'fileNameMap'>(
    { node: tree.root },
    'fileNameMap',
    pathSteps(key)
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
  const key = pathSteps(tree.stem.path)
  const set = new Set<Base>()
  await find({ node: tree.root }, 'stemMap', key, set)
  return set
}

export class Tree<ModuleType, Base extends AbstractPage<ModuleType, Base>> {
  fileName: string
  stem: ModuleName
  variant: ModuleName
  url: Readonly<URL>
  readonly moduleName: ModuleName
  readonly root: Tree<ModuleType, Base>
  readonly parent: Tree<ModuleType, Base> | undefined
  readonly self: Base
  readonly memo: Memo
  content:
    | (() => Awaitable<ModuleType>)
    | Promise<Directory<Base, Tree<ModuleType, Base>>>
    | undefined

  constructor(
    self: Base,
    arg: {
      context?: Readonly<Context> | Null
      url?: string | URL | Null
    }
  ) {
    const parent = findParent(self, arg?.context)?.[tree_]
    this.content = undefined
    this.moduleName = arg?.context?.moduleName ?? ModuleName.root
    this.fileName = parent?.fileName ?? ''
    this.stem = parent?.stem ?? ModuleName.root
    this.variant = parent?.variant ?? ModuleName.root
    this.url = parent?.url ?? new URL('.', arg?.url ?? 'file:')
    this.memo = parent?.memo ?? new Memo()
    this.root = parent?.root ?? this
    this.parent = parent
    this.self = self
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
    if (typeof this.content === 'function') return []
    return (await this.content)?.pages ?? []
  }
}
