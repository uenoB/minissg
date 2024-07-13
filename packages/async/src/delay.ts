import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'

const isPromiseLike = <X>(x: Awaitable<X>): x is PromiseLike<X> =>
  x != null &&
  typeof x === 'object' &&
  typeof (x as { then: unknown }).then === 'function'

type Final<X> =
  | { then?: never; ok: true; value: X } // fulfilled
  | { then?: never; ok: false; reason: unknown } // rejected

type State<X> =
  | Final<X> // finished
  | Promise<Final<X>> // working
  | { then?: never; ok: null; promise: PromiseLike<X> } // deferred

export class Delay<X> implements PromiseLike<X> {
  #state: State<X>

  private constructor(value: Awaitable<X>) {
    this.#state = isPromiseLike(value)
      ? { ok: null, promise: value }
      : { ok: true as const, value }
  }

  #force(): Final<X> | Promise<Final<X>> {
    let state = this.#state
    if (state.then == null && state.ok == null) {
      state = this.#state = Promise.resolve(state.promise).then(
        value => (this.#state = { ok: true as const, value }),
        (reason: unknown) => (this.#state = { ok: false as const, reason })
      )
    }
    return state
  }

  get value(): X {
    const state = this.#force()
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (state.then != null) throw state // for React Suspense
    return state.ok ? state.value : raise(state.reason)
  }

  wrap<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Delay<Y | Z> {
    const state = this.#force()
    if (state.then != null) {
      const promise = state.then(x => (x.ok ? x.value : raise(x.reason)))
      return new Delay(promise.then(onfulfilled, onrejected))
    } else {
      try {
        let r: Awaitable<Y | Z>
        if (state.ok) {
          if (onfulfilled == null) return this as Delay<unknown> as Delay<Y>
          r = onfulfilled(state.value)
        } else {
          if (onrejected == null) return this as Delay<unknown> as Delay<Z>
          r = onrejected(state.reason)
        }
        return r instanceof Delay ? (r as Delay<Y | Z>) : new Delay(r)
      } catch (reason) {
        return Delay.reject(reason)
      }
    }
  }

  // fit signatures with lib.es2015.promise.d.ts
  // eslint-disable-next-line @typescript-eslint/promise-function-async
  then<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Promise<Y | Z> {
    const state = this.#force()
    const promise = state.then != null ? state : Promise.resolve(state)
    const promise2 = promise.then(x => (x.ok ? x.value : raise(x.reason)))
    return promise2.then(onfulfilled, onrejected)
  }

  // fit signatures with lib.es2015.promise.d.ts
  static resolve(): Delay<void>
  static resolve<X>(value: Awaitable<X>): Delay<Awaited<X>>
  static resolve<X = void>(
    value?: Awaitable<Awaited<X>>
  ): Delay<Awaited<X> | undefined> {
    if (value instanceof Delay) return value as Delay<Awaited<X>>
    return new Delay(value)
  }

  // fit signatures with lib.es2015.promise.d.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static reject<X = never>(reason?: any): Delay<X> {
    if (isPromiseLike(reason)) return new Delay(reason.then(raise))
    const d = new Delay<X>(undefined as X)
    d.#state = { ok: false as const, reason }
    return d
  }

  static eager<X>(func: () => Awaitable<X>): Delay<X> {
    try {
      return Delay.resolve(func())
    } catch (error) {
      return Delay.reject(error)
    }
  }

  static lazy<X>(func: () => Awaitable<X>): Delay<X> {
    let p: Delay<X> | undefined
    return new Delay({
      then: async (r, e) => await (p ??= Delay.eager(func)).then(r, e)
    })
  }
}
