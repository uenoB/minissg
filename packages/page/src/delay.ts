import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'

export type Delay<X> = PromiseLike<X> & { value: X }

interface State<X> {
  p: PromiseLike<X>
  e: unknown
  r?: X
}

type Load<A extends unknown[], X> = ((...a: A) => Awaitable<X>) | PromiseLike<X>

const delayAsync = <X, A extends unknown[] = never>(
  load: Load<A, X>,
  ...args: A
): Delay<X> => {
  let state: State<X> | undefined
  const boot = (): State<X> => {
    if (state != null) return state
    const src =
      typeof load === 'function' ? Promise.resolve(load(...args)) : load
    const s: Partial<State<X>> = {}
    s.p = s.e = src.then(
      x => (s.r = x),
      x => raise((s.e = x))
    )
    return (state = s as State<X>)
  }
  const delay: Delay<X> = {
    then: (...a) => boot().p.then(...a),
    get value() {
      const s = boot()
      if ('r' in s) return s.r
      throw s.e
    }
  }
  // prevent from calling `value` by deep clone
  return Object.create(delay) as typeof delay
}

const delayDummy = <X>(value: Awaited<X>): Delay<Awaited<X>> => {
  const delay: Delay<Awaited<X>> = {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    then: (...a) => Promise.resolve(value).then(...a),
    value
  }
  return Object.create(delay) as typeof delay
}

export const delay = delayAsync as {
  <X, A extends unknown[] = never>(load: Load<A, X>, ...args: A): Delay<X>
  dummy: <X>(value: Awaited<X>) => Delay<Awaited<X>>
}

safeDefineProperty(delay, 'dummy', { value: delayDummy })
