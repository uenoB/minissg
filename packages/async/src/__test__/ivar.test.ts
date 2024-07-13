import { test, expect } from 'vitest'
import { Ivar } from '../ivar'

const wait = async (): Promise<void> => {
  await new Promise(resolve => {
    setImmediate(resolve)
  })
}

test('ivar: get after set', () => {
  const ivar = new Ivar<number>()
  const d1 = ivar.set(() => 1234)
  const d2 = ivar.get()
  expect(d1.value).toBe(1234)
  expect(d2.value).toBe(1234)
  expect(d1).toBe(d2)
})

test('ivar: set after get', async () => {
  const ivar = new Ivar<number>()
  const d1 = ivar.get()
  expect(() => d1.value).toThrow(Promise)
  const d2 = ivar.set(() => 1234)
  expect(() => d2.value).toThrow(Promise)
  expect(d1).toBe(d2)
  await wait()
  const d3 = ivar.get()
  expect(d3).toBe(d2)
  expect(d3.value).toBe(1234)
})

test('ivar: get after set Promise', async () => {
  const ivar = new Ivar<number>()
  void ivar.set(async () => await Promise.resolve(1234).then(x => x + 2))
  const d = ivar.get()
  expect(() => d.value).toThrow(Promise)
  await wait()
  expect(d.value).toBe(1236)
})

test('ivar: set Promise after get', async () => {
  const ivar = new Ivar<number>()
  const d = ivar.get()
  expect(() => d.value).toThrow(Promise)
  void ivar.set(async () => await Promise.resolve(1234).then(x => x + 2))
  await wait()
  expect(d.value).toBe(1236)
})

test('ivar: single assignment', () => {
  const ivar = new Ivar<number>()
  void ivar.set(() => 1234)
  void ivar.set(() => 5678)
  const d = ivar.get()
  expect(d.value).toBe(1234)
})

test('ivar: single assignment even in nested function', () => {
  const ivar = new Ivar<number>()
  const d = ivar.set(() => {
    void ivar.set(() => 5678)
    return 1234
  })
  expect(d.value).toBe(1234)
})
