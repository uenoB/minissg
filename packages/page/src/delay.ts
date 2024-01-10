export type Delayable<X> = (() => X | PromiseLike<X>) | PromiseLike<X>

export interface Delay<X> extends PromiseLike<X> {
  readonly value: X
}

export const delay = <X>(load: Delayable<X>): Delay<X> => {
  let promise: PromiseLike<X> | undefined
  const result: { r?: X; e?: unknown } = {}
  const boot = (): PromiseLike<X> => {
    if (promise != null) return promise
    const src = typeof load === 'function' ? Promise.resolve(load()) : load
    promise = result.e = src.then(
      x => (result.r = x),
      x => {
        throw (result.e = x)
      }
    )
    return promise
  }
  return {
    then(resolve, reject) {
      return boot().then(resolve, reject)
    },
    get value() {
      void boot()
      if ('r' in result) return result.r
      throw result.e
    }
  }
}

export const dummyDelay = <X>(value: Awaited<X>): Delay<Awaited<X>> => {
  const p = Promise.resolve(value)
  return { then: p.then.bind(p), value }
}
