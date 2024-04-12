import { test, expect } from 'vitest'
import { memo } from '../memo'

test('memoized', () => {
  let r = 0
  const add = function (this: { foo: number }, x: number): number {
    return this.foo + (r += x)
  }
  const self1 = { foo: 123 }
  const self2 = { foo: 123 }
  const ret1 = memo(add, self1, 1)
  expect(ret1.value).toBe(124)
  expect(r).toBe(1)
  const ret2 = memo(add, self2, 1)
  expect(ret2.value).toBe(125)
  expect(r).toBe(2)
  const ret3 = memo(add, self1, 1)
  expect(ret3.value).toBe(124)
  expect(r).toBe(2)
  const ret4 = memo(add, self2, 2)
  expect(ret4.value).toBe(127)
  expect(r).toBe(4)
})
