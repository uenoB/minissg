import { AsyncLocalStorage } from 'node:async_hooks'
import { Memo } from '@minissg/async'
import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import type { PageBase } from './page_base'
import type { PublicTree } from './tree'

export class TreeContext<Base, This extends Base = Base, Load = unknown> {
  readonly createPage: () => This & PageBase<Base, This, Load>
  readonly Base: abstract new (...args: never) => Base & PageBase<Base>

  constructor(
    createPage: () => This & PageBase<Base, This, Load>,
    Base: abstract new (...args: never) => Base & PageBase<Base>
  ) {
    this.createPage = createPage
    this.Base = Base
  }

  getTree(obj: object): PublicTree<Base> | undefined {
    return obj instanceof this.Base ? TreeContext.getTree(obj) : undefined
  }

  declare static getTree: <Base, This extends Base, Load>(
    this: void,
    page: Base & PageBase<Base, This, Load>
  ) => PublicTree<Base, This, Load> | undefined

  declare static setTree: <Base, This extends Base, Load>(
    this: void,
    page: Base & PageBase<Base, This, Load>,
    tree: PublicTree<Base, This, Load>
  ) => PublicTree<Base, This, Load>

  private static readonly loadedStorage = new AsyncLocalStorage<Set<string>>()

  static run<X>(context: Context, func: () => X): X {
    return Memo.inContext(context, () => {
      return context.loaded != null
        ? this.loadedStorage.run(context.loaded, func)
        : func()
    })
  }

  static async protect<X>(func: () => Awaitable<X>): Promise<X> {
    const loaded = this.loadedStorage.getStore() ?? new Set()
    const orig = [...loaded]
    try {
      return await func()
    } finally {
      if (orig.length !== loaded.size) {
        loaded.clear()
        for (const i of orig) loaded.add(i)
      }
    }
  }
}
