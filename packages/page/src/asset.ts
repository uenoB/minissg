import { type Awaitable, lazy } from '../../vite-plugin-minissg/src/util'
import { constProp, defineProperty, unavailable } from './util'
import { type Delay, delay } from './delay'

interface SomeInternal {
  readonly url: Readonly<URL> | undefined
}

export interface AssetModule {
  readonly default: string
}

class Asset {
  constructor(url: Readonly<URL> | undefined) {
    if (url != null) this.url = url
  }

  declare readonly url: Readonly<URL>
  declare readonly ref: () => Delay<undefined>
  declare readonly type: 'asset'
  static {
    defineProperty(this.prototype, 'url', { get: unavailable })
    constProp(this.prototype, 'ref', () => delay.resolve(undefined))
    constProp(this.prototype, 'type', 'asset')
  }
}

class AssetNode {
  constructor(readonly module: Awaitable<Asset>) {}

  declare readonly findChild: () => PromiseLike<undefined>
  declare readonly content: undefined
  static {
    const findChild = (): PromiseLike<undefined> => Promise.resolve(undefined)
    constProp(this.prototype, 'findChild', findChild)
    constProp(this.prototype, 'content', undefined)
  }
}

export type { Asset, AssetNode }

export class AssetAbst<Base extends SomeInternal> {
  constructor(private readonly load: (() => Awaitable<AssetModule>) | string) {}

  instantiate(parent: Base): PromiseLike<AssetNode> {
    let asset
    if (parent.url == null) {
      asset = new Asset(undefined)
    } else {
      const origin = new URL('/', parent.url).href
      const load = this.load
      const relPath =
        typeof load === 'string'
          ? () => load
          : async () => (await load()).default
      asset = lazy(
        async () => new Asset(Object.freeze(new URL(await relPath(), origin)))
      )
    }
    return Promise.resolve(new AssetNode(asset))
  }
}
