import createDebug from 'debug'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'

const d = createDebug('minissg:page')
export const debug = d.enabled ? d : undefined

const sleep = (msec: number): PromiseLike<undefined> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(undefined)
    }, msec)
  })

const debugTimerPeriod = 3000

const debugTimerImpl = <X>(
  task: () => PromiseLike<X>,
  callback: (
    debug: typeof d,
    dt: number, // in seconds
    when: 'start' | 'middle' | 'end'
  ) => Awaitable<void>
): PromiseLike<X> => {
  const promise = task().then(x => ({ done: x }))
  const t1 = performance.now()
  return Promise.resolve(callback(d, 0, 'start')).then(async () => {
    for (;;) {
      const result = await Promise.race([promise, sleep(debugTimerPeriod)])
      const t2 = performance.now()
      await callback(d, (t2 - t1) / 1000, result != null ? 'end' : 'middle')
      if (result != null) return result.done
    }
  })
}

export const debugTimer = d.enabled
  ? debugTimerImpl
  : <X>(f: () => PromiseLike<X>) => f()
