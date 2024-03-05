import type { ModuleName } from '../../vite-plugin-minissg/src/module'
import { type Awaitable, raise } from '../../vite-plugin-minissg/src/util'
import { type Delay, delay } from './delay'
import type { Transition, Next, TreeLeaf } from './find'
import type { RelPath } from './filename'

interface SomeNode {
  readonly module: unknown
}
interface TreeNode<Tree> extends SomeNode {
  readonly content:
    | ((...a: never) => unknown)
    | PromiseLike<{ moduleNameMap: Transition<Next<TreeLeaf<Tree>>> }>
  readonly findChild: () => PromiseLike<Tree | undefined>
  readonly parent: Tree | undefined
  readonly root: Tree
  readonly moduleName: ModuleName
}

interface Wait<Inst extends SomeNode> {
  resolve?: ((x: Inst['module'] | undefined) => void) | undefined
  reject?: ((x: unknown) => void) | undefined
  promise?: Delay<Inst['module']> | undefined
  found?: Inst
}

export class Ref<
  Tree extends TreeNode<Tree>,
  Parent extends Tree,
  Inst extends SomeNode
> {
  readonly instances = new WeakMap<Tree | this, Map<string, Inst>>()
  readonly referees = new WeakMap<Tree | Inst, Wait<Inst>>()

  instantiate(
    factory: {
      readonly _createInstance: (
        parent: Parent | undefined,
        relPath: Readonly<RelPath> | null
      ) => Inst
    },
    parent: Parent | undefined,
    relPath: Readonly<RelPath> | null
  ): Inst {
    const name = relPath?.moduleName ?? ''
    // if we already have the result, return it
    const cached = this.instances.get(parent ?? this)?.get(name)
    if (cached != null) return cached
    // create a fresh instance
    const inst = factory._createInstance(parent, relPath)
    // create a new entry for remembering this instance
    let m = this.instances.get(parent ?? this)
    if (m == null) {
      m = new Map()
      this.instances.set(parent ?? this, m)
    }
    m.set(name, inst)
    // associate the instance in the root for future `ref` call
    const root = parent?.root ?? inst
    const wait = this.referees.get(root)
    const promise = delay.dummy(inst.module)
    if (wait == null) {
      this.referees.set(root, { found: inst, promise })
    } else if (wait.resolve != null) {
      // update item to notify "we've found" to observers and the crowler
      wait.resolve(inst.module)
      wait.resolve = undefined
      wait.reject = undefined
      wait.promise = promise
      wait.found = inst
    }
    return inst
  }

  ref(current: Tree | undefined): Delay<Inst['module']> {
    // ref must be created in a tree context
    if (current == null) return delay(() => raise(error()))
    // search for the instance in the current tree
    const item = this.referees.get(current.root)
    // if we already have a promise, reuse it
    if (item?.promise != null) return item.promise
    // create a new promise that will be fulfilled with the instance
    const wait: Wait<Inst> = {}
    wait.promise = delay((): Awaitable<Inst['module']> => {
      // initiate crowler to search for the instance in the current tree
      void search(current, wait)
      return new Promise<Inst['module']>((resolve, reject) => {
        wait.resolve = resolve
        wait.reject = reject
      })
    })
    this.referees.set(current.root, wait)
    return wait.promise
  }
}

const error = <Tree extends TreeNode<Tree>>(tree?: Tree): Error =>
  Error(`not found any instance from ${tree?.moduleName.path ?? 'outside'}`)

const skip: PromiseLike<void> = Promise.resolve(undefined)

const descendants = <Tree extends TreeNode<Tree>, Inst extends SomeNode>(
  tree: Tree,
  wait: Wait<Inst>,
  except: Tree | null,
  queue: Tree[],
  cont: () => Awaitable<void>
): Awaitable<void> => {
  if (wait.found != null) return
  if (tree === except) return skip.then(cont)
  const last = (): Awaitable<void> => {
    queue.push(tree) // defer to call findChild
  }
  if (typeof tree.content === 'function') return skip.then(last).then(cont)
  return tree.content.then((index): Awaitable<void> => {
    const branches = Array.from(index.moduleNameMap.routes())
    if (branches.length === 0) return skip.then(cont)
    const k = (i: number): Awaitable<void> => {
      const next = branches[i]
      if (next == null) return skip.then(last).then(cont)
      return next.leaf
        .instantiate(tree, next.relPath)
        .then(node => descendants(node, wait, except, queue, () => k(i + 1)))
    }
    return k(0)
  })
}

const visitQueued = <Tree extends TreeNode<Tree>, Inst extends SomeNode>(
  wait: Wait<Inst>,
  queue: Tree[]
): PromiseLike<void> => {
  const k = (i: number): PromiseLike<void> => {
    const node = queue[i]
    if (node == null) return skip
    const q: Tree[] = []
    return node.findChild().then(
      next => {
        if (next == null) return
        return descendants(next, wait, node, q, () =>
          visitQueued(wait, q).then(() => k(i + 1))
        )
      },
      err => {
        console.warn(err)
        return k(i + 1)
      }
    )
  }
  return k(0)
}

const search = <Tree extends TreeNode<Tree>, Inst extends SomeNode>(
  tree: Tree,
  wait: Wait<Inst>
): Awaitable<void> => {
  // search is carried out from the current node where the reference is
  // created. at first, its descendant nodes are visited because the
  // target node should possibly be a descendant node of the current node
  // due to program's locality.  If not found, the ancestors of the
  // current node are visited from its direct parent to the root.
  const queue: Tree[] = []
  return descendants(tree, wait, null, queue, () => {
    const k = (prev: Tree): Awaitable<void> => {
      const node = prev.parent
      // first, visit nodes reachable from `tree` without calling findChild.
      // then, visit nodes requiring findChild.
      return node != null
        ? descendants(node, wait, prev, queue, () => k(node))
        : visitQueued(wait, queue)
    }
    const last = (): void => {
      // we've found that we don't have any instance in this tree.
      if (wait.reject == null) return
      wait.reject(error(tree))
      wait.resolve = undefined
      wait.reject = undefined
    }
    return k(tree)?.then(last, last)
  })
}
