import { test, expect } from 'vitest'
import { Memo } from '../memo'
import type { Delay } from '../delay'

test('memo in toplevel', () => {
  let r = 0
  const add = function (this: { foo: number }, y: number): number {
    return this.foo + (r += y)
  }
  const memo = new Memo<number>()
  const this1 = { foo: 123 }
  const this2 = { foo: 123 }
  const ret1 = memo.memo(add).call(this1, 1)
  expect(ret1.value).toBe(124)
  const ret2 = memo.memo(add).call(this2, 1)
  expect(ret2.value).toBe(125)
  expect(r).toBe(2)
  const ret3 = memo.memo(add).call(this1, 1)
  expect(ret3.value).toBe(124)
  expect(r).toBe(2)
  expect(ret3).toBe(ret1)
  const ret4 = memo.memo(add).call(this2, 3)
  expect(ret4.value).toBe(128)
  expect(r).toBe(5)
})

test('memo in context', () => {
  let r = 0
  const count = (x: number): number => (r += x)
  const memo = new Memo<number>()
  const context1 = {}
  const ret1 = Memo.inContext(context1, () => memo.memo(count)(1))
  expect(ret1.value).toBe(1)
  expect(r).toBe(1)
  const context2 = { parent: context1 }
  const ret2 = Memo.inContext(context2, () => memo.memo(count)(1))
  expect(ret2.value).toBe(1)
  expect(r).toBe(1)
  const ret3 = Memo.inContext(context2, () => memo.memo(count)(2))
  expect(ret3.value).toBe(3)
  expect(r).toBe(3)
  const context3 = { parent: context2 }
  const ret4 = Memo.inContext(context3, () => memo.memo(count)(1))
  expect(ret4.value).toBe(1)
  const ret5 = Memo.inContext(context3, () => memo.memo(count)(2))
  expect(ret5.value).toBe(3)
  expect(r).toBe(3)
  const context4 = { parent: context1 }
  const ret6 = Memo.inContext(context4, () => memo.memo(count)(1))
  expect(ret6.value).toBe(1)
  const ret7 = Memo.inContext(context4, () => memo.memo(count)(2))
  expect(ret7.value).toBe(5)
  expect(r).toBe(5)
})

test('make method memoized', () => {
  class Foo {
    count = 0
    declare bar: () => Delay<number>
  }
  Foo.prototype.bar = new Memo<number>().memo(function (this: Foo) {
    return ++this.count
  })
  const foo = new Foo()
  const ret1 = foo.bar()
  expect(ret1.value).toBe(1)
  expect(foo.count).toBe(1)
  const ret2 = foo.bar()
  expect(ret2.value).toBe(1)
  expect(ret2).toBe(ret1)
  expect(foo.count).toBe(1)
})
