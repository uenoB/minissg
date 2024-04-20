import type { PublicTreeNode } from '../tree'
import type { AssetNode } from '../asset'

export const dump = async <
  Key extends 'moduleNameMap' | 'stemMap' | 'fileNameMap',
  Base
>(
  indexKey: Key,
  node: PublicTreeNode<Base> | AssetNode,
  nodeNames: Map<PublicTreeNode<Base> | AssetNode, number> = new Map(),
  output: Set<string> = new Set()
): Promise<Set<string>> => {
  const getName = (
    node: PublicTreeNode<Base> | AssetNode,
    final: boolean
  ): string => {
    const suffix = final ? 'F' : ''
    const value = nodeNames.get(node)
    if (value != null) return `${value}${suffix}`
    nodeNames.set(node, nodeNames.size)
    return `${nodeNames.size - 1}${suffix}`
  }
  if (typeof node.content === 'object') {
    for (const [key, states] of (await node.content)[indexKey].entries()) {
      for (const { final, next } of states) {
        const inst = await next.abst.instantiate(node, next.relPath)
        output.add(
          JSON.stringify({
            from: getName(node, false),
            path: key,
            to: getName(inst, final)
          })
        )
        if (!final) await dump(indexKey, inst, nodeNames, output)
      }
    }
  } else {
    const next = await node.findChild()
    if (next.tree) {
      output.add(
        JSON.stringify({
          from: getName(node, false),
          path: null,
          to: getName(next.node, false)
        })
      )
      await dump(indexKey, next.node, nodeNames, output)
    }
  }
  return output
}
