import type { Awaitable } from '../../vite-plugin-minissg/src/util'

type PairsItem<X, Y, This> =
  | readonly [X, Y]
  | Readonly<Record<string, Y>>
  | ((this: This) => Pairs<X, Y, This>)

export type Pairs<X, Y, This = void> =
  | Awaitable<Readonly<Record<string, Y>>>
  | Awaitable<Iterable<Awaitable<PairsItem<X, Y, This>>>>
  | Awaitable<AsyncIterable<Awaitable<PairsItem<X, Y, This>>>>
  | Awaitable<(this: This) => Awaitable<Pairs<X, Y, This>>>

const isPair = (x: unknown): x is readonly [unknown, unknown] =>
  Array.isArray(x) && x.length === 2

export const iteratePairs = async function* <X, Y, This>(
  pairs: Pairs<string | X, Y, This>,
  self: This
): AsyncIterable<readonly [string | X, Y]> {
  let v = await pairs
  while (typeof v === 'function') v = await Reflect.apply(v, self, [])
  if (Symbol.iterator in v || Symbol.asyncIterator in v) {
    for await (const pair of v) {
      if (typeof pair === 'function') {
        yield* iteratePairs(pair, self)
      } else if (isPair(pair)) {
        yield pair
      } else {
        yield* Object.entries(pair)
      }
    }
  } else {
    yield* Object.entries(v)
  }
}

export type List<X, This = void> =
  | Awaitable<Iterable<X>>
  | Awaitable<AsyncIterable<X>>
  | Awaitable<(this: This) => List<X, This>>

export const listItems = async <X, This>(
  items: List<X, This>,
  self: This
): Promise<X[]> => {
  let v = await items
  while (typeof v === 'function') v = await Reflect.apply(v, self, [])
  if (Symbol.iterator in v) return Array.from(v)
  const ret: X[] = []
  for await (const i of v) ret.push(i)
  return ret
}
