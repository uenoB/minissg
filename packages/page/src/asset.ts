import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'
import { type Delay, delay } from './delay'
import type { Memo } from './memo'
import { tree_ } from './directory'

export interface AssetModule {
  readonly default: string
}

interface SomeFactoryInternal {
  findParent: (context: Readonly<Context>) => SomeInstanceInternal | undefined
}

interface SomeInstanceInternal {
  memo: Memo
  root: SomeInstanceInternal
  url: Readonly<URL>
}

interface AssetInternal {
  readonly findChild: () => PromiseLike<undefined>
  readonly instantiate: (context: Readonly<Context>) => AssetImpl
  readonly content: undefined
}

interface AssetFactoryInternal extends AssetInternal {
  readonly parent: SomeFactoryInternal
  readonly load: (() => Awaitable<AssetModule>) | string
  readonly instances: WeakMap<object, AssetImpl>
}

abstract class AssetImpl {
  declare readonly [tree_]: AssetInternal
  declare readonly url: Delay<Readonly<URL>>
  declare type: 'asset'

  constructor() {
    safeDefineProperty(this, tree_, {
      configurable: true,
      writable: true,
      value: {
        content: undefined,
        findChild: (): PromiseLike<undefined> => Promise.resolve(undefined),
        instantiate: () => this
      }
    })
  }

  static {
    safeDefineProperty(this.prototype, 'type', {
      configurable: true,
      writable: true,
      value: 'asset'
    })
    safeDefineProperty(this.prototype, 'url', {
      configurable: true,
      writable: true,
      value: delay.dummy(Object.freeze(new URL('file:///')))
    })
  }
}
export type { AssetImpl }

export type Asset = Pick<AssetImpl, 'url' | 'type'>

const assetURL = async (
  origin: Readonly<URL>,
  load: Delay<AssetModule>
): Promise<Readonly<URL>> =>
  Object.freeze(new URL((await load).default, origin))

class AssetInstance extends AssetImpl {
  override readonly url: Delay<Readonly<URL>>

  constructor(
    origin: Readonly<URL>,
    load: (() => Awaitable<AssetModule>) | string,
    memo: Memo
  ) {
    super()
    this.url =
      typeof load === 'string'
        ? delay.dummy(Object.freeze(new URL(load, origin)))
        : delay(() => memo.memoize(assetURL, origin, memo.memoize(load)))
  }
}

const instantiate = function (
  this: AssetFactory,
  context: Readonly<Context>
): AssetImpl {
  const tree = this[tree_]
  const parent = tree.parent.findParent(context)
  if (parent == null) throw Error('orphan asset')
  const cached = tree.instances.get(parent)
  if (cached != null) return cached
  const origin = new URL('/', parent.root.url)
  const inst = new AssetInstance(origin, tree.load, parent.memo)
  tree.instances.set(parent, inst)
  return inst
}

export class AssetFactory extends AssetImpl {
  declare readonly [tree_]: AssetFactoryInternal

  constructor(
    parent: SomeFactoryInternal,
    load: (() => Awaitable<AssetModule>) | string
  ) {
    super()
    const tree = {
      findChild: () => delay.dummy(undefined),
      instantiate: instantiate.bind(this),
      content: undefined,
      parent,
      load,
      instances: new WeakMap()
    }
    safeDefineProperty(this, tree_, { value: tree })
  }
}
