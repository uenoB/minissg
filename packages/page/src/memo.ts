import { dig } from './util'
import { delay, type Delay, type Delayable } from './delay'

type Obj = NonNullable<object>
type MemoMap = WeakMap<Obj, Map<unknown, Map<unknown, Delay<unknown>>>>

export class Memo {
  private memoMap: MemoMap | undefined

  memoize<X>(
    [k1, k2, k3]: readonly [Obj, unknown?, unknown?],
    load: Delayable<X>
  ): Delay<X> {
    this.memoMap ??= new WeakMap()
    const m = dig(dig(this.memoMap, k1), k2)
    const v = m.get(k3) as Delay<X> | undefined
    if (v != null) return v
    const d = delay(load)
    m.set(k3, d)
    return d
  }

  forget(): void {
    this.memoMap = undefined
  }
}
