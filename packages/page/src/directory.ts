import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import type { PathSteps } from './filename'
import { Trie } from './trie'
import type { Delay } from './delay'

interface Step<Node> {
  readonly node: Node
  readonly final?: boolean | undefined
}

interface Edge<Node> extends Step<Node> {
  readonly final: boolean
  // Edge represents an edge in the nondeterministic finite automaton
  // constituted by PageIndex.
  // `final` means whether or not `node` is a final state.
  // If `final` is true, `node` and its epsillon and final successors
  // are final states.  If `final` is false, they are not final states.
  // Note that, in contrast to standard automata theory, final states are
  // not recognized by themselves but their incoming edges; only if
  // transition comes to a state through an final edge, the state is a final
  // state.
}

class Transition<Node> extends Trie<string, Array<Edge<Node>>> {
  addEdge(steps: PathSteps, next: Edge<Node>): void {
    const { key, trie } = this.get(steps.path)
    if (key.length === 0 && trie.value != null) {
      trie.value.push(next)
    } else {
      trie.set(key, [next])
    }
  }

  addRoute(steps: PathSteps, node: Node): void {
    this.addEdge(steps, { node, final: true })
  }
}

class PathTransition<Node> extends Transition<Node> {
  override addRoute(steps: PathSteps, node: Node): void {
    super.addRoute(steps, node)
    // in the case where `path` ends with `/`, i.e. the last component of
    // `key` is an empty string, we need an alternative way to `node` without
    // the last empty string because the page may have an additional edge to
    // child pages (for example, `/foo/` may have a link to `/foo/bar`).
    if (steps.last === '') this.addEdge(steps.chop(), { node, final: false })
  }
}

class FileNameTransition<Node> extends Transition<Node> {
  override addRoute(steps: PathSteps, node: Node): void {
    super.addRoute(steps, node)
    // in fileNameMap, a page may have an edge to different file name in the
    // same directory and therefore we need an alternative way to the page
    // without the file name part of `path` (last component of `key`).
    if (steps.length > 0) this.addEdge(steps.chop(), { node, final: false })
  }
}

export type AssetModule = Readonly<{ default: string }>

export interface Asset {
  readonly type: 'asset'
  readonly url: Delay<string>
}

interface AssetTree {
  readonly content?: never // distinct from AbstractTree
  readonly self: Asset
  readonly instantiate: AbstractTree<AssetTree>['instantiate']
}

export interface IndexNode<SomeTree> {
  readonly fileNameMap: SomeTree | AssetTree
  readonly moduleNameMap: SomeTree
  readonly stemMap: SomeTree
}

type MakeIndex<Nodes> = { [K in keyof Nodes]: Transition<Nodes[K]> }

interface AbstractTree<Subtree> extends Context {
  readonly content:
    | ((...args: never) => unknown)
    | PromiseLike<MakeIndex<IndexNode<Subtree>>>
  readonly self: unknown
  readonly findChild: () => PromiseLike<Subtree | undefined>
  readonly instantiate: (context: Context) => Subtree | undefined
}

export class Directory<
  SomeTree extends AbstractTree<SomeTree>,
  ThisTree extends SomeTree = SomeTree
> {
  readonly fileNameMap = new FileNameTransition<ThisTree | AssetTree>()
  readonly moduleNameMap = new PathTransition<ThisTree>()
  readonly stemMap = new PathTransition<ThisTree>()
}

export const find = <
  SomeTree extends AbstractTree<SomeTree>,
  Key extends keyof IndexNode<SomeTree>
>(
  { node, final }: Step<SomeTree>,
  indexKey: Key,
  path: readonly string[],
  all?: Set<IndexNode<SomeTree>[Key]['self']> | undefined
): Awaitable<IndexNode<SomeTree>[Key]['self'] | undefined> => {
  type T = IndexNode<SomeTree>[Key]
  const found = (t: T): T['self'] | undefined => {
    if (path.length !== 0 || final !== true) return undefined
    if (all != null) all.add(t.self)
    return all != null ? undefined : t.self
  }
  if (typeof node.content === 'function') {
    return node.findChild().then(n => {
      return n != null
        ? find({ node: n, final }, indexKey, path, all)
        : found(node)
    })
  }
  return node.content.then(index =>
    index[indexKey]
      .walk(path)
      .reduceRight<PromiseLike<T['self'] | undefined>>((z, { key, trie }) => {
        for (const next of trie.value ?? []) {
          // transition occurs only if either
          //   1. one or more inputs exist, or
          //   2. an epsilon transition of the same final state exist.
          // A final state of the next transition is _same_ if either
          //   1. the final state of the last transition is unspecified, or
          //   2. it is equal to the final state of the last transition.
          if (path.length !== 0 || final == null || final === next.final) {
            z = z.then(r => {
              if (r != null) return r
              const inst = next.node.instantiate(node) ?? next.node
              return inst.content != null
                ? find({ ...next, node: inst }, indexKey, key, all)
                : found(node)
            })
          }
        }
        return z
      }, Promise.resolve(undefined))
  )
}
