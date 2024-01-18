import type { Awaitable } from '../../vite-plugin-minissg/src/util'

export type Pairs<X, This = void> =
  | readonly [string, X]
  | Iterable<Pairs<X, This>>
  | AsyncIterable<Pairs<X, This>>
  | Readonly<Record<string, X>>
  | ((this: This) => Awaitable<Pairs<X, This>>)

const isPair = (x: unknown): x is readonly [string, ...unknown[]] =>
  Array.isArray(x) && typeof x[0] === 'string'

export const iteratePairs = async function* <X, This>(
  tuples: Pairs<X, This>,
  self: This
): AsyncIterable<readonly [string, X]> {
  if (typeof tuples === 'function') {
    yield* iteratePairs(await tuples.call(self), self)
  } else if (isPair(tuples)) {
    yield tuples as [string, X]
  } else if (Symbol.iterator in tuples || Symbol.asyncIterator in tuples) {
    for await (const item of tuples) yield* iteratePairs(item, self)
  } else {
    yield* Object.entries(tuples)
  }
}

export type Items<X, This = void> =
  | Iterable<X>
  | AsyncIterable<X>
  | ((this: This) => Awaitable<Items<X, This>>)

export const listItems = async <X, This>(
  items: Items<X, This>,
  self: This
): Promise<X[]> => {
  while (typeof items === 'function') items = await items.call(self)
  if (Symbol.asyncIterator in items) {
    const a: X[] = []
    for await (const i of items) a.push(i)
    return a
  }
  return Array.from(items)
}
