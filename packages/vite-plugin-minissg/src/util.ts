export type Awaitable<X> = X | PromiseLike<X>
export type Null = null | undefined
export const isNotNull = <X>(x: X): x is NonNullable<X> => x != null
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type Void = Null | void

export type JsonObj = Readonly<{ [k: string]: Json }>
export type Json = null | string | number | boolean | JsonObj | readonly Json[]

export const js = (code: TemplateStringsArray, ...args: Json[]): string => {
  const values = args.map(i => JSON.stringify(i))
  const raw = code.raw.map(s => s.replace(/\\(`|\${)/g, '$1'))
  const a = raw.flatMap((x, i) => (values[i] != null ? [x, values[i]] : [x]))
  return a.join('')
}

export const lazy = <X>(f: () => Awaitable<X>): PromiseLike<X> => {
  let p: PromiseLike<X> | undefined
  return { then: (r, e) => (p ??= Promise.resolve(f())).then(r, e) }
}

export const raise = (e: unknown): never => {
  throw e
}

export const mapReduce = <X, Y, Z>(arg: {
  readonly sources: Iterable<X>
  readonly destination: Z
  readonly fork?: (x: X) => Awaitable<readonly X[] | null>
  readonly map: (x: X) => Awaitable<Y>
  readonly reduce?: (y: Y, z: Z) => Awaitable<Z | Void>
  readonly catch?: (e: unknown, x: X, z: Z) => Awaitable<Z | Void>
}): PromiseLike<Z> => {
  const fork = arg.fork ?? (() => null)
  const reduce = arg.reduce ?? ((_, z) => z)
  const catch_ = arg.catch ?? raise
  const step = (z: PromiseLike<Z>, x: X): PromiseLike<Z> =>
    Promise.resolve<Y>(arg.map(x)).then(
      y => z.then(async dest => (await reduce(y, dest)) ?? dest),
      (e: unknown) => z.then(async dest => (await catch_(e, x, dest)) ?? dest)
    )
  const spawn = (z: PromiseLike<Z>, x: X): PromiseLike<Z> =>
    Promise.resolve(fork(x)).then(
      a => (a == null ? step(z, x) : a.reduce(spawn, z)),
      (e: unknown) => z.then(async dest => (await catch_(e, x, dest)) ?? dest)
    )
  return Array.from(arg.sources).reduce(spawn, Promise.resolve(arg.destination))
}

export const addSet = <V>(dst: Set<V>, src: Iterable<V> | Null): void => {
  if (src != null) for (const i of src) dst.add(i)
}

export interface NodeInfo<Node, Value> {
  readonly next?: Iterable<Node> | Null
  readonly values?: Iterable<Value> | Null
  readonly entries?: Iterable<Node> | Null
}

// traverse possibly-cyclic directed graph in depth-first pre-order
export const traverseGraph = async <Node, Value>(graph: {
  readonly nodes: Iterable<Node>
  readonly nodeInfo: (node: Node) => Awaitable<Readonly<NodeInfo<Node, Value>>>
}): Promise<Map<Node, Set<Value>>> => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  type Attr = { values: Set<Value>; next: Item[] }
  type Item = { result: Set<Value>; node: Node; pred: Item[] } & Partial<Attr>
  const items = new Map<Node, Item>()
  const visit = (node: Node): Item => {
    let r = items.get(node)
    if (r == null) items.set(node, (r = { node, pred: [], result: new Set() }))
    return r
  }
  await mapReduce<Item, Item, undefined>({
    sources: Array.from(graph.nodes, visit),
    destination: undefined,
    fork: async item => {
      if (item.values != null) return []
      const { values, next, entries } = await graph.nodeInfo(item.node)
      item.values = item.result = new Set(values ?? [])
      item.next = Array.from(next ?? [], visit)
      items.set(item.node, item)
      for (const i of item.next) i.pred.push(item)
      return item.next.concat(Array.from(entries ?? [], visit))
    },
    map: i => i
  })
  let work = new Set(items.values() as Iterable<Required<Item>>)
  while (work.size > 0) {
    const current = work
    work = new Set()
    for (const i of current) {
      const old = i.result
      i.result = new Set(i.values)
      for (const n of i.next) addSet(i.result, n.result)
      if (Array.from(i.result).some(v => !old.has(v))) addSet(work, i.pred)
    }
  }
  return new Map(Array.from(items, ([k, v]) => [k, v.result]))
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
