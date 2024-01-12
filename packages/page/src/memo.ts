import { AsyncLocalStorage } from 'node:async_hooks'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { delay, type Delay } from './delay'

interface SomeMap<K, V> {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => unknown
}

const dig = <K>(map: SomeMap<K, MemoMap>, key: K): MemoMap => {
  const r = map.get(key)
  if (r != null) return r
  const m = new MemoMap()
  map.set(key, m)
  return m
}

class MemoMap {
  private wnext: WeakMap<object, MemoMap> | undefined
  private pnext: Map<unknown, MemoMap> | undefined
  value: Delay<unknown> | undefined

  dig(key: unknown): MemoMap {
    if (key != null && (typeof key === 'object' || typeof key === 'function')) {
      return dig((this.wnext ??= new WeakMap()), key)
    } else {
      return dig((this.pnext ??= new Map()), key)
    }
  }
}

export class Memo {
  private readonly memoMap = new AsyncLocalStorage<WeakMap<object, MemoMap>>()

  memoize<Args extends readonly unknown[], Ret>(
    func: (...args: Args) => Awaitable<Ret>,
    ...args: Args
  ): Delay<Ret> {
    const memoMap = this.memoMap.getStore()
    if (memoMap == null) return delay(() => func(...args))
    let m = dig(memoMap, func)
    for (const i of args) m = m.dig(i)
    if (m.value != null) return m.value as Delay<Ret>
    return (m.value = delay(() => func(...args)))
  }

  run<R>(f: () => R): R {
    return this.memoMap.run(new WeakMap(), f)
  }
}
