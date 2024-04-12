import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { Delay } from './delay'

interface SomeMap<K, V> {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => unknown
}

const dig = <K, V>(map: SomeMap<K, V>, key: K, Con: new () => V): V => {
  const r = map.get(key)
  if (r != null) return r
  const v = new Con()
  map.set(key, v)
  return v
}

class Memo {
  private objects: WeakMap<object, Memo> | undefined
  private prims: Map<unknown, Memo> | undefined
  value: Delay<unknown> | undefined

  dig(key: unknown): Memo {
    if (key != null && (typeof key === 'object' || typeof key === 'function')) {
      return dig<object, Memo>((this.objects ??= new WeakMap()), key, Memo)
    } else {
      return dig<unknown, Memo>((this.prims ??= new Map()), key, Memo)
    }
  }
}

const undefKey = { value: undefined }
const nullKey = { value: null }
const toKey = (x: object | null | undefined): object =>
  x === undefined ? undefKey : x ?? nullKey

const memo_ = new WeakMap<object, WeakMap<object, Memo>>()

export const memo = <
  This extends object | null | undefined,
  Args extends unknown[],
  Ret
>(
  func: (this: This, ...args: Args) => Awaitable<Ret>,
  self: This,
  ...args: Args
): Delay<Ret> => {
  let m = dig(dig(memo_, toKey(self), WeakMap), func, Memo)
  for (const arg of args) m = m.dig(arg)
  if (m.value != null) return m.value as Delay<Ret>
  return (m.value = Delay.resolve(Reflect.apply(func, self, args)))
}
