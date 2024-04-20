import { type Awaitable, lazy, raise } from '../../vite-plugin-minissg/src/util'
import { constProp, defineProperty } from './util'
import { Delay } from './delay'

interface SomeInternal {
  readonly url: Readonly<URL> | undefined
}

export interface AssetModule {
  readonly default: string
}

class Asset {
  constructor(url: Readonly<URL> | undefined) {
    if (url != null) defineProperty(this, 'url', { value: url })
  }

  declare readonly url: Readonly<URL>
  declare readonly ref: () => Delay<undefined>
  declare readonly type: 'asset'
  static {
    const unavailable = (): never => raise(Error('url is unavailable'))
    defineProperty(this.prototype, 'url', { get: unavailable })
    constProp(this.prototype, 'ref', () => Delay.resolve(undefined))
    constProp(this.prototype, 'type', 'asset')
  }
}

class AssetNode {
  constructor(readonly module: Awaitable<Asset>) {}

  declare readonly content: undefined

  findChild(): PromiseLike<{ tree: false }> {
    return Promise.resolve({ tree: false })
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
