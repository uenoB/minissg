import type { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { RelPath } from './filename'
import { dig } from './util'

interface SomeNode {
  readonly module: unknown
}
interface TreeNode<Tree> extends SomeNode {
  readonly parent: Tree | undefined
  readonly root: Tree
  readonly moduleName: ModuleName
}

interface Wait<Inst extends SomeNode> {
  root: WeakRef<Inst>
  resolve?: ((x: Inst['module'] | undefined) => void) | undefined
  promise?: PromiseLike<Inst['module']> | undefined
}

export class Ref<
  Tree extends TreeNode<Tree>,
  Parent extends Tree,
  Inst extends SomeNode
> {
  readonly instances = new WeakMap<Tree | this, Map<string, Inst>>()
  readonly waits = new Set<Wait<Tree | Inst>>()

  private findWait(root: Tree | Inst): Wait<Tree | Inst> | undefined {
    for (const wait of Array.from(this.waits)) {
      const derefRoot = wait.root.deref()
      if (root === derefRoot) return wait // found
      if (derefRoot == null) this.waits.delete(wait) // garbage collection
    }
    return undefined
  }

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
    dig(this.instances, parent ?? this, Map).set(name, inst)
    // remember the instance with its root for future `ref` call
    const root = parent?.root ?? inst
    const wait = this.findWait(root)
    const promise = Promise.resolve(inst.module)
    if (wait == null) {
      this.waits.add({ root: new WeakRef(root), promise })
    } else if (wait.resolve != null) {
      // update item to notify "we've found" to oberservers
      wait.resolve(inst.module)
      wait.resolve = undefined
      wait.promise = promise
    }
    return inst
  }

  ref(current: Tree): PromiseLike<Inst['module']> {
    // search for the instance in the current tree
    const found = this.findWait(current.root)
    if (found?.promise != null) return found.promise
    // create a new promise that will be fulfilled with the instance
    const wait: Wait<Inst | Tree> = { root: new WeakRef(current.root) }
    wait.promise = new Promise<Inst['module']>(resolve => {
      wait.resolve = resolve
    })
    this.waits.add(wait)
    return wait.promise
  }
}
