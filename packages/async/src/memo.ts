import { AsyncLocalStorage } from 'node:async_hooks'
import type { Awaitable, Void } from '../../vite-plugin-minissg/src/util'
import { Delay } from './delay'
import { dig } from './util'

interface Context {
  parent?: Readonly<Context> | undefined
}

const rootContext: Readonly<Context> = {}
const contextStorage = /*#__PURE__*/ new AsyncLocalStorage<Readonly<Context>>()

class MemoMap<X> {
  private objects: WeakMap<object, MemoMap<X>> | undefined
  private primitives: Map<unknown, MemoMap<X>> | undefined
  value: Delay<X> | undefined

  get(key: unknown): MemoMap<X> | undefined {
    return key != null && (typeof key === 'object' || typeof key === 'function')
      ? this.objects?.get(key)
      : this.primitives?.get(key)
  }

  dig(key: unknown): MemoMap<X> {
    return key != null && (typeof key === 'object' || typeof key === 'function')
      ? dig<object, MemoMap<X>>((this.objects ??= new WeakMap()), key, MemoMap)
      : dig<unknown, MemoMap<X>>((this.primitives ??= new Map()), key, MemoMap)
  }

  find(context: unknown, keys: unknown[]): MemoMap<X> | undefined {
    let m = this.get(context)
    if (m == null) return undefined
    for (const i of keys) {
      m = m.get(i)
      if (m == null) return undefined
    }
    return m
  }

  findInContext(
    context: Readonly<Context> | undefined,
    keys: unknown[]
  ): MemoMap<X> | undefined {
    for (let c = context; c != null; c = c.parent) {
      const m = this.find(c, keys)
      if (m != null) return m
    }
    return this.find(rootContext, keys)
  }
}

export class Memo<X> {
  readonly #storage = new MemoMap<X>()

  get(keys: unknown[]): Delay<X> | undefined {
    const context = contextStorage.getStore()
    return this.#storage.findInContext(context, keys)?.value
  }

  set(keys: unknown[], newValue: () => Awaitable<X>): Delay<X> {
    const context = contextStorage.getStore()
    let m = this.#storage.findInContext(context, keys)
    if (m?.value != null) return m.value
    if (m == null) {
      m = this.#storage.dig(context ?? rootContext)
      for (const i of keys) m = m.dig(i)
    }
    return (m.value = Delay.resolve(newValue()))
  }

  memo<Args extends unknown[], This extends object | Void = void>(
    func: (this: This, ...args: Args) => Awaitable<X>
  ): (this: This, ...args: Args) => Delay<X> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    return function (this: This, ...args: Args): Delay<X> {
      return self.set([func, this, ...args], () =>
        Reflect.apply(func, this, args)
      )
    }
  }

  static inContext = /*#__PURE__*/ contextStorage.run.bind(contextStorage)
}
