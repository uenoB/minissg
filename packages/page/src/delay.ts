import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'

export interface Delay<X> extends PromiseLike<X> {
  readonly value: X
  readonly then: <Y = X, Z = never>(
    // fit signatures with lib.es2015.promise.d.ts
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ) => Delay<Y | Z>
}

type State<X, A extends unknown[]> =
  | [(...a: A) => Awaitable<X>, A] // delayed
  | PromiseLike<X> // working
  | { then?: never; done: true; value: X } // fulfilled
  | { then?: never; done: false; value: unknown } // rejected

class DelayImpl<X, A extends unknown[]> implements Delay<X> {
  #state: State<X, A>

  constructor(state: State<X, A>) {
    this.#state = state
    if (!Array.isArray(state) && state.then != null) void this.#connect(state)
  }

  #connect(promise: PromiseLike<X>): PromiseLike<X> {
    return (this.#state = promise.then(
      (value: X): X => (this.#state = { done: true, value }).value,
      (value: unknown): X => raise((this.#state = { done: false, value }).value)
    ))
  }

  #touch(): Exclude<State<X, A>, unknown[]> {
    const state = this.#state
    if (!Array.isArray(state)) return state
    return this.#connect(Promise.resolve(state[0](...state[1])))
  }

  get value(): X {
    const state = this.#touch()
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    if (state.then != null) throw state
    return state.done ? state.value : raise(state.value)
  }

  then<Y, Z>(
    onfulfilled?: ((value: X) => Awaitable<Y>) | undefined | null,
    onrejected?: ((reason: unknown) => Awaitable<Z>) | undefined | null
  ): Delay<Y | Z> {
    const state = this.#touch()
    const promise =
      state.then != null
        ? state
        : state.done
          ? Promise.resolve(state.value)
          : Promise.reject(state.value)
    return new DelayImpl(promise.then(onfulfilled, onrejected))
  }
}

const delay = <X, A extends unknown[]>(
  func: ((...args: A) => Awaitable<X>) | PromiseLike<X>,
  ...args: A
): Delay<X> =>
  new DelayImpl<X, A>(
    typeof func === 'function' ? [func, args] : [() => func, args]
  )

const isAwaited = <X>(x: unknown): x is Awaited<X> =>
  x == null || typeof (x as object as { then: unknown }).then !== 'function'

const resolve = <X = void>(value?: Awaitable<X>): Delay<X> => {
  if (isAwaited<X>(value)) return new DelayImpl<X, never>({ done: true, value })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return new DelayImpl<X, never>(Promise.resolve(value!))
}

const reject = <X = never>(value?: unknown): Delay<X> =>
  isAwaited<unknown>(value)
    ? new DelayImpl<X, never>({ done: false, value })
    : new DelayImpl<X, never>(Promise.reject(value))

const delayFull: {
  <X>(load: PromiseLike<X>): Delay<Awaited<X>>
  <X, A extends unknown[] = []>(
    load: (...args: A) => Awaitable<X>,
    ...args: A
  ): Delay<Awaited<X>>
  readonly resolve: {
    // fit signatures with lib.es2015.promise.d.ts
    (): Delay<void>
    <X>(value: Awaitable<X>): Delay<Awaited<X>>
  }
  readonly reject: <X = never>(error?: unknown) => Delay<X>
} = Object.assign(delay, { resolve, reject })

export { delayFull as delay }
