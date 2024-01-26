interface Get<K, V> {
  key: K[]
  trie: Trie<K, V>
}

export class Trie<K, V> {
  private readonly children = new Map<K | undefined, Trie<K, V>>()
  value: V | undefined

  constructor(value?: V | undefined) {
    this.value = value
  }

  isEmpty(): boolean {
    return this.value === undefined && this.children.size === 0
  }

  get(key: readonly K[]): Get<K, V> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let trie: Trie<K, V> = this
    for (let i = 0; i < key.length; i++) {
      const next = trie.children.get(key[i])
      if (next == null) return { key: key.slice(i), trie }
      trie = next
    }
    return { key: [], trie }
  }

  *walk(key: readonly K[]): Iterable<Get<K, V>> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let trie: Trie<K, V> = this
    for (let i = 0; i < key.length; i++) {
      yield { key: key.slice(i), trie }
      const next = trie.children.get(key[i])
      if (next == null) return
      trie = next
    }
    yield { key: [], trie }
  }

  set(key: readonly K[], value: V): Trie<K, V> {
    const rest = this.get(key)
    let trie = rest.trie
    for (let i = 0; i < rest.key.length; i++) {
      const newNode = new (this.constructor as new () => this)()
      trie.children.set(rest.key[i], newNode)
      trie = newNode
    }
    trie.value = value
    return trie
  }

  *[Symbol.iterator](): IterableIterator<V> {
    if (this.value != null) yield this.value
    for (const [, trie] of this.children) yield* trie
  }
}
