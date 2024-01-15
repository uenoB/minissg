import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { Trie } from './trie'
import type { Delay } from './delay'

export interface Step<Node> {
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

export const pathSteps = (path: string): string[] => {
  const key = path.split('/')
  if (key[0] === '') key.shift()
  return key
}

class Transition<Node> extends Trie<string, Array<Edge<Node>>> {
  addEdge(path: string[], next: Edge<Node>): void {
    const { key, node } = this.get(path)
    if (key.length === 0 && node.value != null) {
      node.value.push(next)
    } else {
      node.set(key, [next])
    }
  }

  addRoute(path: string, node: Node, trim?: number | Null): void {
    const key = pathSteps(path)
    this.addEdge(key, { node, final: true })
    if (trim != null) {
      this.addEdge(key.slice(0, key.length - trim), { node, final: false })
    }
  }
}

class PathTransition<Node> extends Transition<Node> {
  override addRoute(path: string, node: Node): void {
    super.addRoute(path, node, path.endsWith('/') ? 1 : null)
    // in the case where `path` ends with `/`, i.e. the last component of
    // `key` is an empty string, because the page may have an additional
    // edge to child pages (for example, `/foo/` may have a link to
    // `/foo/bar`), we need an alternative way to `node` without the last
    // empty string.
  }
}

class FileNameTransition<Node> extends Transition<Node> {
  override addRoute(path: string, node: Node): void {
    super.addRoute(path, node, 1)
    // in fileNameMap, a page may have an edge to different file name in the
    // same directory and therefore we need an alternative way to the page
    // without the file name part of `path` (last component of `key`).
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

interface IndexNode<SomeTree> {
  fileNameMap: SomeTree | AssetTree
  moduleNameMap: SomeTree
  stemMap: SomeTree
}

type MakeIndex<Nodes> = { [K in keyof Nodes]: Transition<Nodes[K]> }

interface AbstractTree<Base, Subtree> {
  content:
    | (() => Awaitable<unknown>)
    | Promise<MakeIndex<IndexNode<Subtree>>>
    | undefined
  self: Base
  findChild: () => PromiseLike<Subtree | undefined>
}

export class Directory<Base, SomeTree extends AbstractTree<Base, SomeTree>> {
  readonly pages: Array<readonly [string, Base]> = []
  readonly fileNameMap = new FileNameTransition<SomeTree | AssetTree>()
  readonly moduleNameMap = new PathTransition<SomeTree>()
  readonly stemMap = new PathTransition<SomeTree>()
}

export const find = <
  SomeTree extends AbstractTree<unknown, SomeTree>,
  Key extends keyof IndexNode<SomeTree>
>(
  { node, final }: Step<IndexNode<SomeTree>[Key]>,
  indexKey: Key,
  path: string[],
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
      .reduceRight<PromiseLike<R | undefined>>((z, { key, node }) => {
        for (const next of node.value ?? []) {
          if (path.length !== 0 || final == null || final === next.final) {
            z = z.then(r => r ?? find(next, indexKey, key, all))
          }
        }
        return z
      }, Promise.resolve(undefined))
  )
}
