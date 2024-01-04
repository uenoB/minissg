interface Get<K, V> {
  key: K[]
  node: Trie<K, V>
}

export class Trie<K, V> {
  private readonly children = new Map<K | undefined, Trie<K, V>>()
  value: V | undefined

  constructor(value?: V | undefined) {
    this.value = value
  }

  get(key: readonly K[]): Get<K, V> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie<K, V> = this
    for (let i = 0; i < key.length; i++) {
      const next = node.children.get(key[i])
      if (next == null) return { key: key.slice(i), node }
      node = next
    }
    return { key: [], node }
  }

  walk(key: readonly K[]): Array<Get<K, V>> {
    const results: Array<Get<K, V>> = []
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: Trie<K, V> = this
    for (let i = 0; i < key.length; i++) {
      results.push({ key: key.slice(i), node })
      const next = node.children.get(key[i])
      if (next == null) return results
      node = next
    }
    results.push({ key: [], node })
    return results
  }

  set(key: readonly K[], value: V): Trie<K, V> {
    const rest = this.get(key)
    let node = rest.node
    for (let i = 0; i < rest.key.length; i++) {
      const newNode = new (this.constructor as new () => this)()
      node.children.set(rest.key[i], newNode)
      node = newNode
    }
    node.value = value
    return node
  }
}
