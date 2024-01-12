import { raise } from '../../vite-plugin-minissg/src/util'
import { safeDefineProperty } from './util'

export type Delayable<X> = (() => X | PromiseLike<X>) | PromiseLike<X>
export type Delay<X> = PromiseLike<X> & { value: X }

interface State<X> {
  p: PromiseLike<X>
  e: unknown
  r?: X
}

const delayAsync = <X>(load: Delayable<X>): Delay<X> => {
  let state: State<X> | undefined
  const boot = (): State<X> => {
    if (state != null) return state
    const src = typeof load === 'function' ? Promise.resolve(load()) : load
    const p: PromiseLike<X> = src.then(
      x => (s.r = x),
      x => raise((s.e = x))
    )
    const s: State<X> = { p, e: p }
    return (state = s)
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
  <X>(load: Delayable<X>): Delay<X>
  dummy: <X>(value: Awaited<X>) => Delay<Awaited<X>>
}

safeDefineProperty(delay, 'dummy', { value: delayDummy })
