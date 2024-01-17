import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import type { PathSteps } from './filename'
import { Trie } from './trie'
import type { Delay } from './delay'

interface Step<Node> {
  node: Node
  final?: boolean | undefined
}

interface Edge<Node> extends Step<Node> {
  final: boolean
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

export interface Asset {
  type: 'asset'
  url: Delay<string>
  pathname: (path?: string | Null) => string
}

interface AssetTree {
  content?: never // distinct from Tree
  self: Asset
}

export interface IndexNode<SomeTree> {
  fileNameMap: SomeTree | AssetTree
  moduleNameMap: SomeTree
  stemMap: SomeTree
}

type MakeIndex<Nodes> = { [K in keyof Nodes]: Transition<Nodes[K]> }

interface AbstractTree<Subtree> extends Context {
  content:
    | (() => Awaitable<unknown>)
    | PromiseLike<MakeIndex<IndexNode<Subtree>>>
    | undefined
  self: unknown
  findChild: () => PromiseLike<Subtree | undefined>
  instantiate: (context: Context) => Subtree | undefined
}

export class Directory<SomeTree extends AbstractTree<SomeTree>> {
  readonly fileNameMap = new FileNameTransition<SomeTree | AssetTree>()
  readonly moduleNameMap = new PathTransition<SomeTree>()
  readonly stemMap = new PathTransition<SomeTree>()
}

export const find = <
  SomeTree extends AbstractTree<SomeTree>,
  Key extends keyof IndexNode<SomeTree>
>(
  { node, final }: Step<IndexNode<SomeTree>[Key]>,
  indexKey: Key,
  path: readonly string[],
  all?: Set<IndexNode<SomeTree>[Key]['self']> | undefined
): Awaitable<IndexNode<SomeTree>[Key]['self'] | undefined> => {
  type R = IndexNode<SomeTree>[Key]['self']
  if (node.content == null) {
    return path.length === 0 && final === true ? node.self : undefined
  }
  if (typeof node.content === 'function') {
    return node.findChild().then(n => {
      if (n != null) return find({ node: n, final }, indexKey, path, all)
      if (path.length !== 0 || final !== true) return undefined
      if (all != null) all.add(node.self)
      return all != null ? undefined : node.self
    })
  }
  return node.content.then(index =>
    index[indexKey]
      .walk(path)
      .reduceRight<PromiseLike<R | undefined>>((z, { key, trie }) => {
        for (let next of trie.value ?? []) {
          // transition occurs only if either
          //   1. one or more inputs exist, or
          //   2. an epsilon transition of the same final state exist.
          // A final state of the next transition is _same_ if either
          //   1. the final state of the last transition is unspecified, or
          //   2. it is equal to the final state of the last transition.
          if (path.length !== 0 || final == null || final === next.final) {
            if (next.node.content != null) {
              const nextNode = next.node.instantiate(node)
              if (nextNode != null) next = { node: nextNode, final: next.final }
            }
            z = z.then(r => r ?? find(next, indexKey, key, all))
          }
        }
        return z
      }, Promise.resolve(undefined))
  )
}
