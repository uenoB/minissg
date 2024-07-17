import { Delay, Ivar } from '@minissg/async'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { type FileName, type RelPath, concatFileName } from './filename'
import { type Public, constProp } from './util'

interface SomeInstance {
  readonly fileName: FileName
  readonly root: SomeInstance | undefined
  readonly url: () => Readonly<URL>
}

export type AssetModule = Readonly<{
  readonly default: string
}>

interface AssetInstance {
  readonly fileName: FileName
  readonly url: Delay<Readonly<URL>>
}

class Asset {
  readonly #tree: AssetTree

  constructor(tree: AssetTree) {
    this.#tree = tree
  }

  get fileName(): Delay<string> {
    return this.#tree.instance.get().wrap(i => i.fileName.path)
  }

  get url(): Delay<Readonly<URL>> {
    return this.#tree.instance.get().wrap(i => i.url)
  }

  declare readonly moduleName: undefined
  declare readonly type: 'asset'
  static {
    constProp(this.prototype, 'type', 'asset')
  }
}

type PublicAsset = Public<Asset>
export type { PublicAsset as Asset }

export class AssetTree {
  readonly load: string | (() => Awaitable<AssetModule>)
  readonly page: Asset
  readonly instance = new Ivar<AssetInstance>()
  declare readonly content: undefined

  constructor(load: string | (() => Awaitable<AssetModule>)) {
    this.load = load
    this.page = new Asset(this)
  }

  findChild(): PromiseLike<undefined> {
    return Promise.resolve(undefined)
  }

  instantiate(parent: Delay<SomeInstance>, relPath: Readonly<RelPath>): void {
    void this.instance.set(() => {
      return parent.wrap(inst => {
        const url: Delay<Readonly<URL>> = Delay.lazy(() => {
          const rootURL = (inst.root ?? inst).url()
          return typeof this.load === 'string'
            ? Object.freeze(new URL(this.load, rootURL))
            : Delay.eager(this.load).wrap(module => {
                return Object.freeze(new URL(module.default, rootURL))
              })
        })
        const fileName = concatFileName(inst.fileName, relPath.fileName)
        return { fileName, url }
      })
    })
  }
}
