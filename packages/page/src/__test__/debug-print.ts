import type { PublicTree } from '../tree'
import type { AssetTree } from '../asset'

// this file contains utilitiy functions useful to inspect the details of
// data structures for debug prints.  They would be used in a test cases
// to find the cause of failure.

interface NFAEdge {
  from: string
  path: Array<string | undefined> | null
  to: string
}

interface NFAVertex {
  name: string
  fileName: string
  moduleName: string | undefined
}

interface NFA {
  edges: NFAEdge[]
  vertexes: NFAVertex[]
}

export const toNFA = async <
  Key extends 'moduleNameMap' | 'stemMap' | 'fileNameMap',
  Base
>(
  indexKey: Key,
  node: PublicTree<Base> | AssetTree
): Promise<NFA> => {
  const vertexes = new Map<PublicTree<Base> | AssetTree, string>()
  const edges: NFAEdge[] = []
  const getName = (
    node: PublicTree<Base> | AssetTree,
    final: boolean
  ): string => {
    const suffix = final ? 'F' : ''
    const value = vertexes.get(node)
    if (value != null) return `${value}${suffix}`
    vertexes.set(node, `${vertexes.size}`)
    return `${vertexes.size - 1}${suffix}`
  }
  const visited = new Set<PublicTree<Base> | AssetTree>()
  const visit = async (node: PublicTree<Base> | AssetTree): Promise<void> => {
    if (visited.has(node)) return
    visited.add(node)
    if (typeof node.content === 'object') {
      for (const [key, states] of (await node.content)[indexKey].entries()) {
        for (const { final, next } of states) {
          edges.push({
            from: getName(node, false),
            path: key,
            to: getName(node, final)
          })
          if (!final) await visit(next.tree)
        }
      }
    } else {
      const next = await node.findChild()
      if (next != null) {
        edges.push({
          from: getName(node, false),
          path: null,
          to: getName(next, false)
        })
        await visit(next)
      }
    }
  }
  await visit(node)
  return {
    edges,
    vertexes: await Promise.all(
      Array.from(vertexes, async ([node, name]) => ({
        name,
        fileName: await node.page.fileName,
        moduleName: await node.page.moduleName
      }))
    )
  }
}
