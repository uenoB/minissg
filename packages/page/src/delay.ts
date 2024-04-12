import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { memo } from './memo'

const isPromiseLike = <X>(x: Awaitable<X>): x is PromiseLike<X> =>
  x != null &&
  typeof x === 'object' &&
  typeof (x as { then: unknown }).then === 'function'

type Final<X> =
  | { then?: never; ok: true; value: X } // fulfilled
  | { then?: never; ok: false; error: unknown } // rejected

type State<X> = Final<X> | Promise<Final<X>>

export class Delay<X> implements PromiseLike<X> {
  #state: State<X>

  private constructor(value: Awaitable<X>) {
    if (isPromiseLike(value)) {
      const promise = Promise.resolve(value).then(
        value => (this.#state = { ok: true, value }),
        (error: unknown) => (this.#state = { ok: false, error })
      )
      this.#state = promise
    } else {
      this.#state = { ok: true as const, value }
    }
  }

  get value(): X {
    const state = this.#state
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    if (state.then != null) throw state // for React Suspense
    return state.ok ? state.value : raise(state.error)
  }

  then<Y = X, Z = never>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Delay<Y | Z> {
    /* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
    const state = this.#state
    const promise =
      state.then != null
        ? state.then(x => (x.ok ? x.value : raise(x.error)))
        : state.ok
          ? Promise.resolve(state.value)
          : Promise.reject(state.error)
    return new Delay(promise.then(onfulfilled, onrejected))
    /* eslint-enable */
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
}
