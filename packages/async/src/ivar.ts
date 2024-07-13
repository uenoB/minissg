import { Delay } from './delay'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'

export class Ivar<X> {
  #resolve: ((x: Awaitable<X>) => void) | undefined
  #promise: Delay<X> | undefined

  get(): Delay<X> {
    if (this.#promise != null) return this.#promise
    const promise = new Promise<X>(resolve => {
      this.#resolve = resolve
    })
    this.#promise = Delay.resolve(promise)
    return this.#promise
  }

  set(newValue: () => Awaitable<X>): Delay<X> {
    if (this.#resolve != null) {
      const resolve = this.#resolve
      this.#resolve = undefined
      let value: Awaitable<X>
      try {
        value = newValue()
      } catch (error) {
        value = Delay.reject(error)
      }
      resolve(value)
    }
    if (this.#promise == null) this.#promise = Delay.eager(newValue)
    return this.#promise
  }
}
