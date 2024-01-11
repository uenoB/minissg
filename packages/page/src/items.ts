import type { Awaitable } from '../../vite-plugin-minissg/src/util'

export type Tuples<X, This = void> =
  | readonly [string, X]
  | Iterable<Tuples<X, This>>
  | AsyncIterable<Tuples<X, This>>
  | Readonly<Record<string, X>>
  | ((this: This) => Awaitable<Tuples<X, This>>)

export const iterateTuples = async function* <X, This>(
  tuples: Tuples<X, This>,
  self: This
): AsyncIterable<readonly [string, X]> {
  if (typeof tuples === 'function') {
    yield* iterateTuples(await tuples.call(self), self)
  } else if (Array.isArray(tuples) && typeof tuples[0] === 'string') {
    yield tuples as [string, X]
  } else if (Symbol.iterator in tuples || Symbol.asyncIterator in tuples) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    for await (const item of tuples) yield* iterateTuples(item, self)
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
