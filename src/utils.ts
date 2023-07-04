export type Awaitable<X> = X | PromiseLike<X>
export type Null = null | undefined
export const isNotNull = <X>(x: X): x is NonNullable<X> => x != null

// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
export type JsonObj = Readonly<{ [k: string]: Json }>
export type Json = null | string | number | boolean | JsonObj | readonly Json[]

export const js = (code: TemplateStringsArray, ...args: Json[]): string => {
  const values = args.map(i => JSON.stringify(i))
  const raw = code.raw.map(s => s.replace(/\\(`|\${)/g, '$1'))
  const a = raw.flatMap((x, i) => (values[i] != null ? [x, values[i]] : [x]))
  return a.join('')
}

const raise = (e: unknown): never => {
  throw e
}

/* eslint-disable @typescript-eslint/promise-function-async */
export const mapReduce = <X, Y, Z>(arg: {
  readonly sources: Iterable<X>
  readonly destination: Z
  readonly fork?: (x: X) => Awaitable<readonly X[] | null>
  readonly map: (x: X) => Awaitable<Y>
  readonly reduce?: (y: Y, z: Z) => Awaitable<unknown>
  readonly catch?: (e: unknown, x: X) => Awaitable<void>
}): Promise<Z> => {
  const fork = arg.fork ?? (() => null)
  const reduce = arg.reduce ?? (() => undefined)
  const catch_ = arg.catch ?? raise
  const step = (z: Promise<unknown>, x: X): Promise<unknown> =>
    (async () => await arg.map(x))().then(
      y => z.then(() => reduce(y, arg.destination)),
      e => z.then(() => catch_(e, x))
    )
  const spawn = (z: Promise<unknown>, x: X): Promise<unknown> =>
    (async () => await fork(x))().then(
      a => (a == null ? step(z, x) : a.reduce(spawn, z)),
      e => z.then(() => catch_(e, x))
    )
  const sources = Array.from(arg.sources).reduce(spawn, Promise.resolve(null))
  return sources.then(() => arg.destination)
}
/* eslint-enable */

export const addSet = <V>(dst: Set<V>, src: Iterable<V> | Null): void => {
  if (src != null) for (const i of src) dst.add(i)
}

export interface NodeInfo<Node, Value> {
  readonly next?: Iterable<Node> | Null
  readonly values?: Iterable<Value> | Null
  readonly entries?: Iterable<Node> | Null
}

// traverse acyclic directed graph in depth-first pre-order
export const traverseGraph = async <Node, Value>(graph: {
  readonly nodes: Iterable<Node>
  readonly nodeInfo: (node: Node) => Awaitable<Readonly<NodeInfo<Node, Value>>>
}): Promise<Map<Node, Set<Value>>> => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  type Result = { values: Set<Value>; children?: Array<{ node: Node }> | Null }
  type Item = { values?: never; node: Node } | Result
  const results = new Map<Node, Result>()
  const propagate = (result: Result): Result | Null => {
    if (result.children == null) return
    for (let i = 0; i < result.children.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const r = results.get(result.children[i]!.node)!
      if (r.children != null) {
        result.children = result.children.slice(i)
        return result
      }
      addSet(result.values, r.values)
    }
    return (result.children = null)
  }
  let postponed = await mapReduce<Item, Result | undefined, Result[]>({
    sources: Array.from(graph.nodes, node => ({ node })),
    destination: [],
    fork: async item => {
      if (item.values != null) return null
      const r = results.get(item.node)
      if (r != null) return []
      const result: Result = { values: new Set<Value>(), children: [] }
      results.set(item.node, result)
      const { next, entries, values } = await graph.nodeInfo(item.node)
      result.values = new Set(values ?? [])
      const roots = Array.from(entries ?? [], node => ({ node }))
      const children = Array.from(next ?? [], node => ({ node }))
      result.children = children.length > 0 ? children : null
      return [...children, result, ...roots] // post-order tree traversal
    },
    map: item => (item.values != null ? item : undefined),
    reduce: (result, z) => {
      if (result == null) return
      const r = propagate(result)
      if (r != null) z.push(r)
    }
  })
  while (postponed.length > 0) {
    postponed = postponed.map(propagate).filter(isNotNull)
  }
  return new Map(Array.from(results, ([k, v]) => [k, v.values]))
}

export const touch = <X>(error: X): X => {
  if (!(error instanceof Error)) return error
  // @babel/core sets Error.prepareStackTrace and therefore Node's
  // built-in sourcemap support is disabled if babel is used in the
  // middle of code transformation. The following code temporally
  // disables such a custom Error.prepareStackTrace.
  const prepareStackTrace = Error.prepareStackTrace
  if (prepareStackTrace == null) return error
  Error.prepareStackTrace = undefined
  try {
    Object.getOwnPropertyDescriptor(error, 'stack')
  } finally {
    Error.prepareStackTrace = prepareStackTrace
  }
  return error
}

export const freshId = (code: string): string => {
  let id
  do {
    id = `$${Math.floor(Math.random() * 4294967296).toString(16)}`
  } while (code.includes(id))
  return id
}
