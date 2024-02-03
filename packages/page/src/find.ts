import type { Awaitable, Null } from '../../vite-plugin-minissg/src/util'
import { type RelPath, PathSteps } from './filename'
import { Trie } from './trie'

interface Edge<Node> {
  // Edge represents an edge in the nondeterministic finite automaton
  // constituted by Indices.
  // `final` means whether or not `node` is a final state.
  // If `final` is true, `node` and its epsillon and final successors are
  // final states.  If `final` is false, they are not final states.
  // If undefined, the previous final state is propagated to the next.
  // Note that, in contrast to standard automata theory, final states are
  // not recognized by themselves but their incoming edges; only if
  // transition comes to a state through an final edge, the state is a final
  // state.
  readonly node: Node
  readonly final?: boolean | undefined
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
    this.addEdge(steps, { node, final: steps.length > 0 ? true : undefined })
  }

  *routes(): Iterable<Node> {
    for (const edges of this) {
      for (const { node, final } of edges) if (final !== false) yield node
    }
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

export type { Transition }

type Path = Readonly<RelPath> | undefined
export type PathPair<Next> = readonly [Path, Next]

export class Indices<Leaf, Asst> {
  readonly fileNameMap = new FileNameTransition<PathPair<Leaf | Asst>>()
  readonly moduleNameMap = new PathTransition<PathPair<Leaf>>()
  readonly stemMap = new PathTransition<PathPair<Leaf>>()

  addRoute(leaf: Leaf, relPath?: Readonly<RelPath> | Null): void {
    const pair = [relPath ?? undefined, leaf] as const
    const fileSteps = PathSteps.fromRelativeFileName(relPath?.fileName)
    const moduleSteps = PathSteps.fromRelativeModuleName(relPath?.moduleName)
    const stemSteps = PathSteps.fromRelativeModuleName(relPath?.stem)
    this.fileNameMap.addRoute(fileSteps, pair)
    this.moduleNameMap.addRoute(moduleSteps, pair)
    this.stemMap.addRoute(stemSteps, pair)
  }
}

export interface TreeLeaf<Tree, Inst = Tree> {
  readonly instantiate: (parent: Tree, path: Path) => PromiseLike<Inst>
}

interface TreeNode<Tree, Content> {
  readonly module: unknown
  readonly content: Content
  readonly findChild: () => PromiseLike<Tree | undefined>
}

type Next<Tree, Inst, Key extends string> =
  | ((...a: never) => unknown)
  | PromiseLike<{ [P in Key]: Transition<PathPair<TreeLeaf<Tree, Inst>>> }>

export const find = <
  Key extends string,
  Tree extends TreeNode<Tree, Next<Tree, Asst | Tree, Key>>,
  Asst extends TreeNode<Tree, undefined>
>(
  indexKey: Key,
  path: readonly string[],
  { node, final }: Edge<Tree | Asst>,
  all?: Set<Tree['module'] | Asst['module']> | undefined
): PromiseLike<Tree['module'] | Asst['module'] | undefined> => {
  type Result = Tree['module'] | Asst['module'] | undefined
  const deref = (findChild = true): PromiseLike<Result> => {
    if (path.length === 0 && final !== false) {
      if (all != null) all.add(node.module)
      return Promise.resolve(all != null ? undefined : node.module)
    }
    if (!findChild) return Promise.resolve(undefined)
    return node.findChild().then(next => {
      if (next == null) return undefined
      return find(indexKey, path, { node: next, final }, all)
    })
  }
  if (node.content == null || typeof node.content === 'function') return deref()
  return node.content.then((index): PromiseLike<Result> => {
    type K = (r: Result) => Awaitable<Result>
    const k = Array.from(index[indexKey].walk(path)).reduce<K>(
      (outer, { key, trie }) =>
        trie.value?.reduceRight<K>((inner, { node: next, final: fin }) => {
          // transition occurs only if the next candidate is either
          //   1. not an epsilon transition, or
          //   2. an epsilon transition satisfying one of the following:
          //      1. exactly same final state as the last one, or
          //      2. one of the states is undefined.
          return key.length < path.length || (final ?? fin) === (fin ?? final)
            ? (r: Result): Awaitable<Result> =>
                r ??
                next[1].instantiate(node, next[0]).then(inst => {
                  const edge = { node: inst, final: fin ?? final }
                  return find(indexKey, key, edge, all).then(inner)
                })
            : inner
        }, outer) ?? outer,
      r => r ?? deref(index[indexKey].isEmpty())
    )
    return Promise.resolve<Result>(undefined).then(k)
  })
}
