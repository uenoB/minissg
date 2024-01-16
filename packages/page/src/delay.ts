import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'

export type Delay<X> = PromiseLike<X> & { value: X }

interface State<X> {
  p: PromiseLike<X>
  e: unknown
  r?: X
}

const delayAsync = <X, A extends unknown[] = []>(
  load: ((...a: A) => Awaitable<X>) | PromiseLike<X>,
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
  return {
    then(...a) {
      return boot().p.then(...a)
    },
    get value() {
      const s = boot()
      if ('r' in s) return s.r
      throw s.e
    }
  }
}

const delayDummy = <X>(value: Awaited<X>): Delay<Awaited<X>> => {
  const p = Promise.resolve(value)
  return { then: p.then.bind(p), value }
}

export const delay = delayAsync as {
  <X, A extends unknown[] = []>(
    load: ((...a: A) => Awaitable<X>) | PromiseLike<X>,
    ...args: A
  ): Delay<X>
  dummy: <X>(value: Awaited<X>) => Delay<Awaited<X>>
}

safeDefineProperty(delay, 'dummy', { value: delayDummy })
