import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { type RelPath, PathSteps } from './filename'
import { Trie } from './trie'

// Each page has a fragment of NFA.  Each node in the trie of a page is a
// state of NFA.  Each page has two implicit states: one is a final state
// that corresponds to the page and another is a non-final state and placed
// just before the root of trie with epsilon transtion.  For example, if
// page A has a reference to another page with path 'foo/bar', the trie,
// i.e. the NFA fragment, is depicted as follows:
//
//                             +--------------trie---------------+
//                             |                                 |
//     page A:  [[1]]   [2] --e--> [3] --foo--> [4] --bar--> [5] |
//                             |                                 |
//                             +---------------------------------+
//
// If the page A is the root of page search, its final state ([[1]] in the
// above figure) is the initial state and connected to its non-final state
// ([2]) by an epsilon transition.
//
// The entire NFA is constructed by concatinating the fragment of each page
// with epsilon transitions.  Each leaf of a trie is connected to the final
// state of a page by an epsilon transition.  To the non-final state, either
// the leaf node or its predecessor is connected by an epsilon transition.
// For module names, the former is typically used.  Only when the last path
// component is empty, the latter is chosen.  For example, suppose page A has
// 'foo/' for page B and page B has 'bar' for page C, the entire NFA looks
// like the following:
//
//     page A: [[1]]   [2] --e--> [3] --foo--> [4] --''--> [5]
//                                              |            |
//                      +-----------e-----------+            |
//               +------|--------------e---------------------+
//               v      v
//     page B: [[6]]   [7] --e--> [8] --bar--> [9]
//                                             | |
//               +-------------e---------------+ |
//               |      +-----------e------------+
//               v      v
//     page C: [[ ]]   [ ] --e--> ...
//
// This construction allows to accept 'foo/bar' and 'foo/' but reject 'foo'.
//
// For file names, since their relative path resolution is performed on a
// directory-basis strategy, the predecessor of the trie leaf is always
// selected to connect the two NFA fragments.  For example, when page A has
// 'foo/bar.js' for B and page B has 'baz.js' for C, resulting NFA is the
// following:
//
//     page A: [[1]]   [2] --e--> [3] --foo--> [4] --bar.js--> [5]
//                                              |               |
//                      +-----------e-----------+               |
//               +------|---------------e-----------------------+
//               v      v
//     page B: [[6]]   [7] --e--> [8] --baz.js--> [9]
//                                 |               |
//                      +-----e----+               |
//               +------|---------e----------------+
//               v      v
//     page C: [[A]]   [B] --e--> ...
//
// If path to the next page is empty and therefore no predecessor of the trie
// leaf is found, the epsilon transition to the final state is omitted in order
// to avoid unexpected acceptance of input.  For example, consider the case
// when page A has 'foo/' for B, B has '' for C, and C has 'bar' for D.
// The NFA is constructed as follows:
//
//     page A: [[1]]   [2] --e--> [3] --foo--> [4] --''--> [5]
//                                              |           |
//                      +-----------e-----------+           |
//               +------|--------------e--------------------+
//               v      v
//     page B: [[6]]   [7] --e--> [8]
//                                 |
//                      +----e-----+
//                      v
//     page C: [[A]]   [B] --e--> [C] --bar--> [D]
//                                             | |
//                      +-----------e----------+ |
//               +------|-------e----------------+
//               v      v
//     page D: [[E]]   [F]
//
// This accepts 'foo/' for B and 'foo/bar' for D.  Because of omission of
// epsilon transition from [8] to [[A]], page C never matches.
// If the epsilon transition from [8] to [[A]] exists, 'foo' is accepted
// for page C, but this is not satisfactory.

interface State<Next> {
  readonly final: boolean
  readonly next: Next
}

abstract class Transition<Next> extends Trie<string, Array<State<Next>>> {
  protected addEdge(steps: PathSteps, state: State<Next>): void {
    const { key, trie } = this.get(steps.path)
    if (key.length === 0 && trie.value != null) {
      trie.value.push(state)
    } else {
      trie.set(key, [state])
    }
  }

  abstract addRoute(steps: PathSteps, next: Next): void

  *routes(): Iterable<Next> {
    for (const states of this.values()) {
      for (const { final, next } of states) if (!final) yield next
    }
  }
}

class ModuleNameTransition<Next> extends Transition<Next> {
  override addRoute(steps: PathSteps, next: Next): void {
    if (steps.length > 0) this.addEdge(steps, { final: true, next })
    this.addEdge(steps.chomp(), { final: false, next })
  }
}

class FileNameTransition<Next> extends Transition<Next> {
  override addRoute(steps: PathSteps, next: Next): void {
    if (steps.length > 0) this.addEdge(steps, { final: true, next })
    this.addEdge(steps.chop(), { final: false, next })
  }
}

interface Next<Tree> {
  readonly relPath: Readonly<RelPath>
  readonly tree: Tree
}

export class Indices<Tree, Asset> {
  readonly moduleNameMap = new ModuleNameTransition<Next<Tree>>()
  readonly stemMap = new ModuleNameTransition<Next<Tree>>()
  readonly fileNameMap = new FileNameTransition<Next<Tree | Asset>>()

  addRoute(relPath: Readonly<RelPath>, tree: Tree): void {
    const next = { tree, relPath }
    const moduleSteps = PathSteps.fromRelativeModuleName(relPath.moduleName)
    const stemSteps = PathSteps.fromRelativeModuleName(relPath.stem)
    const fileSteps = PathSteps.fromRelativeFileName(relPath.fileName)
    this.moduleNameMap.addRoute(moduleSteps, next)
    this.stemMap.addRoute(stemSteps, next)
    this.fileNameMap.addRoute(fileSteps, next)
  }
}

interface TreeNode<Tree, Content> {
  readonly content: Content
  readonly page: object
  readonly findChild: () => PromiseLike<Tree | undefined>
}

interface NamedTreeNode<Tree, Content> extends TreeNode<Tree, Content> {
  readonly instance: {
    get: () => PromiseLike<{ moduleName: { path: string } }>
  }
}

type Content<Tree, Key extends string> =
  | ((...a: never) => unknown)
  | PromiseLike<{ [P in Key]: Transition<Next<Tree>> }>
  | undefined

type Found<Tree extends { page: unknown }> = Tree['page'] | undefined

export const find = <
  Key extends string,
  Tree extends TreeNode<Tree, Content<Asset | Tree, Key>>,
  Asset extends TreeNode<Tree, undefined>
>(
  indexKey: Key,
  tree: Tree | Asset,
  input: readonly string[],
  found: (tree: Tree | Asset) => Awaitable<Found<Tree | Asset>> = r => r.page
): PromiseLike<Found<Tree | Asset>> => {
  type Cont = (r: Found<Tree | Asset>) => Awaitable<Found<Tree | Asset>>
  const search = (
    tree: Tree | Asset,
    input: readonly string[]
  ): PromiseLike<Found<Tree | Asset>> => {
    if (input.length === 0) return Promise.resolve(undefined)
    if (typeof tree.content !== 'object') {
      return tree.findChild().then(next => {
        return next != null ? search(next, input) : undefined
      })
    }
    return tree.content.then((index): PromiseLike<Found<Tree | Asset>> => {
      // longer match has precedence
      const cont = Array.from(index[indexKey].walk(input)).reduce<Cont>(
        (cont, { key, trie }) =>
          trie.value?.reduceRight<Cont>((cont, { final, next }) => {
            if (final && key.length !== 0) return cont
            return r =>
              r ??
              (final
                ? Promise.resolve(found(next.tree)).then(cont)
                : search(next.tree, key).then(cont))
          }, cont) ?? cont,
        r => r
      )
      return Promise.resolve(undefined).then(cont)
    })
  }
  return input.length > 0 ? search(tree, input) : Promise.resolve(found(tree))
}

export const findLeaf = <
  Tree extends NamedTreeNode<Tree, Content<Tree, 'moduleNameMap'>>,
  Ret extends object
>(
  tree: Tree,
  found: (tree: Tree) => Awaitable<Ret | undefined>
): PromiseLike<Ret | undefined> => {
  type Cont = (r: Ret | undefined) => Awaitable<Ret | undefined>
  const search = (tree: Tree): PromiseLike<Ret | undefined> => {
    if (typeof tree.content !== 'object') {
      return tree.findChild().then(next => {
        return next != null ? search(next) : found(tree)
      })
    }
    return tree.content.then(index => {
      return tree.instance.get().then((inst): PromiseLike<Ret | undefined> => {
        const slash = inst.moduleName.path.endsWith('/')
        // NOTE: index.moduleNameMap.value includes both '' and './'
        const cont = (index.moduleNameMap.value ?? []).reduce<Cont>(
          (cont, { next }) => {
            // next.relPath?.moduleName must be either undefined, '', or './'.
            // './' must be followed only if moduleName ends with '/'.
            if (!slash && next.relPath.moduleName !== '') return cont
            return r => r ?? search(next.tree).then(cont)
          },
          r => r
        )
        return Promise.resolve(undefined).then(cont)
      })
    })
  }
  return search(tree)
}
