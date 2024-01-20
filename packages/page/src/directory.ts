import type { Context } from '../../vite-plugin-minissg/src/module'
import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import type { PathSteps } from './filename'
import { Trie } from './trie'

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

export const tree_: unique symbol = Symbol('tree')

interface SomeTree<Subtree, Content, Ext = Context> {
  [tree_]: {
    readonly findChild: () => PromiseLike<Subtree | undefined>
    readonly instantiate: (context: Readonly<Context>) => Subtree | undefined
    readonly content: Content
  } & Ext
}

type Fun = (...args: never) => unknown
type Index<Key extends string, Node> = { [K in Key]: Transition<Node> }

export class Directory<
  Base extends SomeTree<Base, Fun | PromiseLike<Directory<Base, SomeAsset>>>,
  SomeAsset extends SomeTree<SomeAsset, undefined, unknown>,
  This extends Base = Base
> {
  readonly fileNameMap = new FileNameTransition<This | SomeAsset>()
  readonly moduleNameMap = new PathTransition<This>()
  readonly stemMap = new PathTransition<This>()
}

export const find = <
  Key extends string,
  Base extends SomeTree<Base, Fun | PromiseLike<Index<Key, Base | SomeAsset>>>,
  SomeAsset extends SomeTree<SomeAsset, undefined, unknown>
>(
  { node, final }: Step<Base | SomeAsset>,
  indexKey: Key,
  path: readonly string[],
  all?: Set<Base | SomeAsset> | undefined
): Awaitable<Base | SomeAsset | undefined> => {
  type Item = Base | SomeAsset
  const tree = node[tree_]
  if (tree.content == null || typeof tree.content === 'function') {
    return tree.findChild().then(n => {
      if (n != null) return find({ node: n, final }, indexKey, path, all)
      if (path.length !== 0 || final !== true) return undefined
      if (all != null) all.add(node)
      return all != null ? undefined : node
    })
  }
  return tree.content.then(index =>
    index[indexKey]
      .walk(path)
      .reduceRight<PromiseLike<Item | undefined>>((z, { key, trie }) => {
        for (const next of trie.value ?? []) {
          // transition occurs only if either
          //   1. one or more inputs exist, or
          //   2. an epsilon transition of the same final state exist.
          // A final state of the next transition is _same_ if either
          //   1. the final state of the last transition is unspecified, or
          //   2. it is equal to the final state of the last transition.
          if (path.length !== 0 || final == null || final === next.final) {
            z = z.then((r: Item | undefined): Awaitable<Item | undefined> => {
              if (r != null) return r
              const inst = next.node[tree_].instantiate(tree) ?? next.node
              return find({ node: inst, final: next.final }, indexKey, key, all)
            })
          }
        }
        return z
      }, Promise.resolve(undefined))
  )
}
