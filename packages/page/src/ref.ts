import type { RelPath } from './filename'
import { dig } from './util'

interface TreeNode<Tree> {
  readonly root: Tree
}

interface Wait<Inst> {
  resolve?: ((inst: Inst) => void) | undefined
  promise?: PromiseLike<Inst> | undefined
}

class WaitMap<Inst> {
  readonly set = new Set<{ root: WeakRef<object>; wait: Wait<Inst> }>()

  get(root: object): Wait<Inst> | undefined {
    for (const pair of Array.from(this.set)) {
      const derefRoot = pair.root.deref()
      if (root === derefRoot) return pair.wait // found
      if (derefRoot == null) this.set.delete(pair) // garbage collection
    }
    return undefined
  }

  add(root: object, wait: Wait<Inst>): void {
    this.set.add({ root: new WeakRef(root), wait })
  }
}

export class Ref<Tree extends TreeNode<Tree>, Inst extends Tree> {
  readonly instances = new WeakMap<object, Map<string, Inst>>()
  readonly waits = new WaitMap<Inst>()

  findInstance(
    parent: Tree | undefined,
    relPath: Readonly<RelPath> | null
  ): Inst | undefined {
    const name = relPath?.moduleName ?? ''
    // if we already have the result, return it
    return this.instances.get(parent ?? this)?.get(name)
  }

  registerInstance(
    inst: Inst,
    parent: Tree | undefined,
    relPath: Readonly<RelPath> | null
  ): void {
    const name = relPath?.moduleName ?? ''
    // create a new entry for remembering this instance
    dig(this.instances, parent ?? this, Map).set(name, inst)
    // remember the instance with its root for future `ref` call
    const root = parent?.root ?? inst
    const wait = this.waits.get(root)
    const promise = Promise.resolve(inst)
    if (wait == null) {
      this.waits.add(root, { promise })
    } else if (wait.resolve != null) {
      // update item to notify "we've found" to oberservers
      wait.resolve(inst)
      wait.resolve = undefined
      wait.promise = promise
    }
  }

  deref(root: object): PromiseLike<Inst> {
    // search for the instance in the current tree
    const found = this.waits.get(root)
    if (found?.promise != null) return found.promise
    // create a new promise that will be fulfilled with the instance
    const wait: Wait<Inst> = {}
    wait.promise = new Promise<Inst>(resolve => {
      wait.resolve = resolve
    })
    this.waits.add(root, wait)
    return wait.promise
  }
}
