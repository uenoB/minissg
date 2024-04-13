import { type Awaitable, raise, lazy } from '../../vite-plugin-minissg/src/util'
import { memo } from './memo'

const isPromiseLike = <X>(x: Awaitable<X>): x is PromiseLike<X> =>
  x != null &&
  typeof x === 'object' &&
  typeof (x as { then: unknown }).then === 'function'

type Final<X> =
  | { then?: never; ok: true; value: X } // fulfilled
  | { then?: never; ok: false; error: unknown } // rejected

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

  get value(): X {
    let state = this.#state
    if (state.then == null && state.ok == null) {
      this.#state = state = Promise.resolve(state.promise).then(
        value => (this.#state = { ok: true as const, value }),
        (error: unknown) => (this.#state = { ok: false as const, error })
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    if (state.then != null) throw state // for React Suspense
    return state.ok ? state.value : raise(state.error)
  }

  then<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Delay<Y | Z> {
    let state = this.#state
    // copied from value() for performance
    if (state.then == null && state.ok == null) {
      this.#state = state = Promise.resolve(state.promise).then(
        value => (this.#state = { ok: true as const, value }),
        (error: unknown) => (this.#state = { ok: false as const, error })
      )
    }
    /* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
    const promise =
      state.then != null
        ? state.then(x => (x.ok ? x.value : raise(x.error)))
        : state.ok
          ? Promise.resolve(state.value)
          : Promise.reject(state.error)
    /* eslint-enable */
    return new Delay(promise.then(onfulfilled, onrejected))
  }

  // fit signatures with lib.es2015.promise.d.ts
  static resolve(): Delay<void>
  static resolve<X>(value: Awaitable<X>): Delay<Awaited<X>>
  static resolve<X = void>(
    value?: Awaitable<Awaited<X>>
  ): Delay<Awaited<X> | undefined> {
    return new Delay(value)
  }

  static reject<X = never>(error?: unknown): Delay<X> {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (isPromiseLike(error)) return new Delay(Promise.reject(error))
    const d = new Delay<X>(undefined as X)
    d.#state = { ok: false as const, error }
    return d
  }

  static memo = memo

  static lazy<X>(func: () => Awaitable<X>): Delay<X> {
    return new Delay(lazy(func))
  }
}
