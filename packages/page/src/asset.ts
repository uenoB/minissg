import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'
import { type Delay, delay } from './delay'
import type { Memo } from './memo'
import { tree_ } from './directory'

export interface AssetModule {
  readonly default: string
}

interface SomeTreeInternal {
  findParent: (context: Readonly<Context>) => SomeTree | undefined
  root: SomeTreeInternal
  memo: Memo
  url: Readonly<URL>
}

interface SomeTree {
  [tree_]: SomeTreeInternal
}

interface AssetInternal {
  readonly findChild: () => PromiseLike<undefined>
  readonly instantiate: (context: Readonly<Context>) => Asset | undefined
  readonly content: undefined
  readonly parent: SomeTreeInternal
  readonly load: (() => Awaitable<AssetModule>) | string
}

const instantiate =
  (asset: Asset) =>
  (context: Readonly<Context>): Asset | undefined => {
    const parent = asset[tree_].parent.findParent(context)
    if (parent == null) return undefined
    return new Asset(parent[tree_], asset[tree_].load)
  }

const assetURL = async (
  asset: AssetInternal,
  load: () => Awaitable<AssetModule>,
  origin: URL
): Promise<string> =>
  new URL((await asset.parent.memo.memoize(load)).default, origin).href

export class Asset {
  declare readonly [tree_]: AssetInternal
  readonly url: Delay<string>

  constructor(
    parent: SomeTreeInternal,
    load: (() => Awaitable<AssetModule>) | string
  ) {
    const tree: AssetInternal = {
      findChild: () => delay.dummy(undefined),
      instantiate: instantiate(this),
      content: undefined,
      parent,
      load
    }
    safeDefineProperty(this, tree_, { value: tree })
    const origin = new URL('/', parent.root.url)
    this.url =
      typeof load === 'string'
        ? delay.dummy(new URL(load, origin).href)
        : delay(async () => await assetURL(this[tree_], load, origin))
  }

  declare type: 'asset'
}

safeDefineProperty(Asset.prototype, 'type', {
  writable: true,
  configurable: true,
  value: 'asset' as const
})
