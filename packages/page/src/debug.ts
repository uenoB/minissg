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

const debugTimerImpl = async <X>(
  task: PromiseLike<X>,
  onTimer: (
    debug: typeof d,
    dt: number, // in seconds
    when: 'start' | 'middle' | 'end'
  ) => Awaitable<void>
): Promise<X> => {
  const promise = task.then(x => ({ done: x }))
  const t1 = performance.now()
  await onTimer(d, 0, 'start')
  for (;;) {
    const result = await Promise.race([promise, sleep(debugTimerPeriod)])
    const t2 = performance.now()
    await onTimer(d, (t2 - t1) / 1000, result != null ? 'end' : 'middle')
    if (result != null) return result.done
  }
}

export const debugTimer = /*#__PURE__*/ d.enabled
  ? debugTimerImpl
  : <X>(task: PromiseLike<X>) => task
