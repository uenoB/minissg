import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { defineProperty } from './util'

const dig = <K extends object, X>(
  map: WeakMap<K, WeakMap<K, X>>,
  key: K
): WeakMap<K, X> => {
  const r = map.get(key)
  if (r != null) return r
  const m = new WeakMap<K, X>()
  map.set(key, m)
  return m
}

export interface Delay<X> extends PromiseLike<X> {
  then: <Result1 = X, Result2 = never>(
    onFullfilled?: ((value: X) => Awaitable<Result1>) | null | undefined,
    onRejected?: ((x: unknown) => Awaitable<Result2>) | null | undefined
  ) => Delay<Result1 | Result2>
  value: X
}

type Load<X, A extends unknown[]> = ((...a: A) => Awaitable<X>) | PromiseLike<X>

class DelayAsync<X, A extends unknown[]> implements Delay<X> {
  #p: [Load<X, A>, A] | PromiseLike<X>
  readonly #w = new WeakMap<object, WeakMap<object, Delay<unknown>>>()
  #e: unknown
  #r?: [X]

  constructor(load: Load<X, A>, args: A) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#p = [load, args]
  }

  promise(): PromiseLike<X> {
    if (!Array.isArray(this.#p)) return this.#p
    const r = (x: X): X => (this.#r = [x])[0]
    const e = (x: unknown): never => raise((this.#e = x))
    this.#p = this.#e =
      typeof this.#p[0] === 'function'
        ? Promise.resolve(this.#p[0](...this.#p[1])).then(r, e)
        : this.#p[0].then(r, e)
    return this.#p
  }

  then<Y, Z>(
    f?: ((x: X) => Awaitable<Y>) | null | undefined,
    g?: ((x: unknown) => Awaitable<Z>) | null | undefined
  ): Delay<Y | Z> {
    const memo = dig(this.#w, f ?? this)
    const cached = memo.get(g ?? this)
    if (cached != null) return cached as Delay<Y | Z>
    const p = new DelayAsync(this.promise().then(f, g), [])
    if (f != null || g != null) memo.set(g ?? this, p)
    return p
  }

  get value(): X {
    void this.promise()
    if (this.#r != null) return this.#r[0]
    throw this.#e
  }
}

class DelayDummy<X> implements Delay<X> {
  #p: Delay<X> | undefined
  declare value: X

  constructor(value: X) {
    defineProperty(this, 'value', { enumerable: true, value })
  }

  then<Y, Z>(
    f?: ((x: X) => Awaitable<Y>) | null | undefined,
    g?: ((x: unknown) => Awaitable<Z>) | null | undefined
  ): Delay<Y | Z> {
    this.#p ??= new DelayAsync(Promise.resolve(this.value), [])
    return this.#p.then(f, g)
  }
}

const delay = (<X, A extends unknown[] = []>(
  load: Load<X, A>,
  ...args: A
): Delay<X> => new DelayAsync<X, A>(load, args)) as {
  <X, A extends unknown[] = []>(load: Load<X, A>, ...args: A): Delay<X>
  dummy: <X>(value: X) => Delay<X>
}
delay.dummy = <X>(value: X): Delay<X> => new DelayDummy<X>(value)

defineProperty(delay, 'dummy', { configurable: false, writable: false })

export { delay }
