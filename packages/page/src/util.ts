export const dig = <X, Y, Z>(map: Map<X, Map<Y, Z>>, key: X): Map<Y, Z> => {
  const m = map.get(key)
  if (m != null) return m
  const n = new Map<Y, Z>()
  map.set(key, n)
  return n
}
