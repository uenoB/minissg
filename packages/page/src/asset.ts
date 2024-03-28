import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { constProp } from './util'
import { type Delay, delay } from './delay'
import type { Memo } from './memo'

interface SomeInternal {
  readonly root: SomeInternal
  readonly url: Readonly<URL> | undefined
  readonly memo: Memo
}

export interface AssetModule {
  readonly default: string
}

const assetURL = async (
  load: Delay<AssetModule>,
  origin: string
): Promise<Readonly<URL>> =>
  Object.freeze(new URL((await load).default, origin))

class Asset {
  readonly url: Delay<Readonly<URL>>

  constructor(
    origin: string,
    load: (() => Awaitable<AssetModule>) | string,
    memo: Memo | undefined
  ) {
    this.url =
      typeof load === 'string'
        ? delay.resolve(Object.freeze(new URL(load, origin)))
        : memo == null
          ? delay(assetURL, delay(load), origin)
          : memo.memoize(assetURL, memo.memoize(load), origin)
  }

  declare readonly ref: () => Delay<undefined>
  declare readonly type: 'asset'
  static {
    const dummyURL = delay.resolve(Object.freeze(new URL('file:')))
    const undef = delay.resolve(undefined)
    constProp(this.prototype, 'url', dummyURL)
    constProp(this.prototype, 'ref', () => undef)
    constProp(this.prototype, 'type', 'asset')
  }
}

class AssetNode {
  constructor(readonly module: Asset) {}

  declare readonly findChild: () => PromiseLike<undefined>
  declare readonly content: undefined
  static {
    const undef = (): PromiseLike<undefined> => Promise.resolve(undefined)
    constProp(this.prototype, 'findChild', undef)
    constProp(this.prototype, 'content', undefined)
  }
}

export type { Asset, AssetNode }

export class AssetAbst<Base extends SomeInternal> {
  constructor(private readonly load: (() => Awaitable<AssetModule>) | string) {}

  instantiate(parent: Base): PromiseLike<AssetNode> {
    const origin = new URL('/', parent.root.url).href
    const node = new AssetNode(new Asset(origin, this.load, parent.memo))
    return Promise.resolve(node)
  }
}
