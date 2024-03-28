import type { Awaitable } from '../../vite-plugin-minissg/src/util'
import { type RelPath, PathSteps } from './filename'
import { Trie } from './trie'

// Each page has a fragment NFA and the entire NFA is constructed by
// concatinating each of them.  For example, page A has a reference to
// page B with path component 'foo', page B has one for page C with 'bar'.
// The fragments of these pages and their concatination is depicted as follows:
//
//     page A: [1] --'foo'-->[[2]](B)
//                             |
//                          epsilon
//                             v
//     page B:                [3] --'bar'-->[[4]](C)
//
// Concatination is done by choosing a state of the two and connecting them
// by an epsilon transition.  For module name, there are two candidate states
// to be connected to the next fragment: the next state of the last path
// component ([2] in the above figure) or its previous state ([1]).
// For module name, the latter is used instead of the former if the path
// includes an empty string.  For example, if A has 'foo/' for B and B has
// 'bar' for C, the concatinated NFA looks like the following:
//
//     page A: [1] --'foo'--> [2] --''-->[[5]](B)
//                             |
//                          epsilon
//                             v
//     page B:                [3] --'bar'-->[[4]](C)
//
// This construction allows to accept 'foo/bar' and 'foo/' but reject 'foo'.
// Note that, in module name path, empty string may occur only as the last
// component.
//
// For file name, since their relative path resolution is performed on a
// directory-basis strategy, the state previous to the last one is always
// used to connect the two fragment.  For example, A has 'foo/bar.js' for B
// and B has 'baz.js' for C, resulting NFA is the following:
//
//     page A: [1] --'foo'--> [2] --'bar.js'-->[[3]](B)
//                             |
//                          epsilon
//                             v
//     page B:                [4] --'baz.js'-->[[5]](C)
//
// Empty path sometimes causes the following issue.  Consider the case when
// A has 'foo/' for B and B has '' for C.  In this case, the NFA must reject
// ['foo'] because there does not any page of 'foo'.  If we add an epsilon
// transition to a final state accepting the empty path in B, which is
// depicted as follows,
//
//     page A: [1] --'foo'--> [2] --''-->[[3]](B)
//                             |
//                          epsilon
//                             v
//     page B:                [4] --epsilon-->[[5]](C)
//                             |
//                          epsilon
//                             v
//     page C:                 :
//
// not only [5] but also [2] and [4] become final states due to epsilon
// transition to a final state [5].  This is not satisfactory.  To avoid
// this issue, we omit transitions corresponding to empty path, such as
// [4]-->[5] in the above NFA.  Because of this omission, any node referred
// to from another node through empty path, such as page C in the above,
// is never found by NFA matching.
//
// The root path indicates a set of root pages rather than the single root
// page.   Each of root pages is determined by either an empty path `[]` or
// single path `['']`.  Note that they have different meaning in the middle of
// concatination, but at the beginning of module path, both of them indicate
// the root page.  For example, consider the following construction of NFA
// starting with the state [1]:
//
//     page A: [1] --''-->[[2]](B)
//              |
//              v
//     page B:[[3]](C)
//              |
//              v
//     page C: [4] --''-->[[5]](D)
//
// In the standard theory of automata, `[]` is accepted only by [3] and `['']`
// is accepted by [2] and [5].  Therefore, `[]` represents {C} and `['']`
// represents {C, D}.  However, we would like to choose {B, C, D} for the
// root of tree search.  This exceptional case is implemented in the `root`
// flag of the `find` function.

interface State<Next> {
  readonly next: Next
  readonly epsilon: boolean
}

abstract class Transition<Next> extends Trie<string, Array<State<Next>>> {
  protected addEdge(steps: PathSteps, next: State<Next>): void {
    const { key, trie } = this.get(steps.path)
    if (key.length === 0 && trie.value != null) {
      trie.value.push(next)
    } else {
      trie.set(key, [next])
    }
  }

  abstract addRoute(steps: PathSteps, next: Next): void

  *routes(): Iterable<Next> {
    for (const edges of this) {
      for (const { next, epsilon } of edges) if (epsilon) yield next
    }
  }
}

class ModuleNameTransition<Next> extends Transition<Next> {
  override addRoute(steps: PathSteps, next: Next): void {
    if (steps.length > 0) this.addEdge(steps, { next, epsilon: false })
    this.addEdge(steps.chomp(), { next, epsilon: true })
  }
}

class FileNameTransition<Next> extends Transition<Next> {
  override addRoute(steps: PathSteps, next: Next): void {
    if (steps.length > 0) this.addEdge(steps, { next, epsilon: false })
    this.addEdge(steps.chop(), { next, epsilon: true })
  }
}

export type { Transition }
type NextPath = Readonly<RelPath>
export type Next<Abst> = Readonly<{ abst: Abst; relPath: NextPath }>

export class Indices<Abst, Asset> {
  readonly moduleNameMap = new ModuleNameTransition<Next<Abst>>()
  readonly stemMap = new ModuleNameTransition<Next<Abst>>()
  readonly fileNameMap = new FileNameTransition<Next<Abst | Asset>>()

  addRoute(abst: Abst, relPath: NextPath): void {
    const next = { abst, relPath }
    const moduleSteps = PathSteps.fromRelativeModuleName(relPath.moduleName)
    const stemSteps = PathSteps.fromRelativeModuleName(relPath.stem)
    const fileSteps = PathSteps.fromRelativeFileName(relPath.fileName)
    this.moduleNameMap.addRoute(moduleSteps, next)
    this.stemMap.addRoute(stemSteps, next)
    this.fileNameMap.addRoute(fileSteps, next)
  }
}

export interface TreeAbst<Tree, Inst = Tree> {
  readonly instantiate: (parent: Tree, path: NextPath) => PromiseLike<Inst>
}

interface TreeNode<Tree, Content> {
  readonly module: unknown
  readonly content: Content
  readonly findChild: () => PromiseLike<Tree | undefined>
}

type Content<Tree, Inst, Key extends string> =
  | ((...a: never) => unknown)
  | PromiseLike<{ [P in Key]: Transition<Next<TreeAbst<Tree, Inst>>> }>

const undef = Promise.resolve(undefined)

export const find = <
  Key extends string,
  Tree extends TreeNode<Tree, Content<Tree, Asset | Tree, Key>>,
  Asset extends TreeNode<Tree, undefined>
>(
  indexKey: Key,
  node: Tree | Asset,
  input: readonly string[],
  cb?: ((node: Tree | Asset) => unknown) | undefined
): PromiseLike<(Tree | Asset)['module'] | undefined> => {
  type Result = (Tree | Asset)['module'] | undefined
  type Cont = (r: Result) => Awaitable<Result>
  type Step<Final = never> = (
    node: Tree | Asset,
    input: readonly string[],
    final: readonly string[] | null | Final
  ) => PromiseLike<Result>

  const check: Step<true> = (node, input, final): PromiseLike<Result> => {
    // reject unless the final condition is met.
    if (final == null || (final === true && input.length > 0)) return undef
    // end of root search and switch to input search.
    if (final !== true && final.length > 0) return search(node, final, null)
    // matched.
    return cb?.(node) != null ? undef : Promise.resolve(node.module)
  }

  const deref: Step = (node, input, final) =>
    node.findChild().then(next => {
      return next == null ? undef : search(next, input, final)
    })

  const visit: Step = (node, input, final) =>
    // shallow one has precedence.
    check(node, input, final).then(r => r ?? deref(node, input, final))

  const search: Step = (node, input, final) => {
    if (typeof node.content !== 'object') return visit(node, input, final)
    return node.content.then(index => {
      const children = index[indexKey]
      const cont = Array.from(children.walk(input)).reduce<Cont>(
        (cont, { key, trie }) =>
          // longest match has precedence.
          trie.value?.reduceRight<Cont>((cont, { next, epsilon }) => {
            return r =>
              r ??
              next.abst.instantiate(node, next.relPath).then(inst => {
                return epsilon
                  ? search(inst, key, final).then(cont)
                  : check(inst, key, final ?? true).then(cont)
              })
          }, cont) ?? cont,
        r => r
      )
      // shallow one has precedence.
      return (children.isEmpty() ? visit : check)(node, input, final).then(cont)
    })
  }

  return search(node, [''], input)
}
