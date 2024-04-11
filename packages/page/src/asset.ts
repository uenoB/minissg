import { type Awaitable, lazy } from '../../vite-plugin-minissg/src/util'
import { constProp } from './util'
import { type Delay, delay } from './delay'

interface SomeInternal {
  readonly root: SomeInternal
  readonly url: Readonly<URL> | undefined
}

export interface AssetModule {
  readonly default: string
}

class Asset {
  constructor(readonly url: Readonly<URL>) {}

  declare readonly ref: () => Delay<undefined>
  declare readonly type: 'asset'
  static {
    const undef = delay.resolve(undefined)
    constProp(this.prototype, 'ref', () => undef)
    constProp(this.prototype, 'type', 'asset')
  }
}

class AssetNode {
  constructor(readonly module: PromiseLike<Asset>) {}

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
    const origin = new URL('/', parent.root.url).href
    const load = this.load
    const relPath =
      typeof load === 'string' ? () => load : async () => (await load()).default
    const asset = lazy(
      async () => new Asset(Object.freeze(new URL(await relPath(), origin)))
    )
    return Promise.resolve(new AssetNode(asset))
  }
}
