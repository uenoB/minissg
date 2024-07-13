interface SomeMap<K, V> {
  get: (key: K) => V | undefined
  set: (key: K, value: V) => unknown
}

export const dig = <K, V>(map: SomeMap<K, V>, key: K, Con: new () => V): V => {
  const r = map.get(key)
  if (r != null) return r
  const v = new Con()
  map.set(key, v)
  return v
}
