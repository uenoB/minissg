import { test, expect } from 'vitest'
import { Delay } from '../delay'

const wait = async (msec: number): Promise<void> => {
  await new Promise(resolve => {
    setTimeout(resolve, msec)
  })
}

test('await fulfilled future', async () => {
  let r = 0
  const inc = Promise.resolve().then(() => ++r)
  const d = Delay.resolve(inc)
  expect(r).toBe(0)
  await expect(d).resolves.toBe(1)
  expect(r).toBe(1)
})

test('await rejected future', async () => {
  let r = 0
  const inc = Promise.resolve().then(() => {
    ++r
    throw Error('FooBar')
  })
  const d = Delay.resolve(inc)
  expect(r).toBe(0)
  await expect(d).rejects.toThrow('FooBar')
  expect(r).toBe(1)
})

test('future of fulfilled promise', async () => {
  let r = 0
  const inc = Promise.resolve().then(() => ++r)
  const d = Delay.resolve(inc)
  expect(r).toBe(0)
  expect(() => d.value).toThrow(Promise)
  await wait(5)
  expect(r).toBe(1)
  expect(d.value).toBe(1)
})

test('future of rejected promise', async () => {
  let r = 0
  const inc = Promise.resolve().then(() => {
    ++r
    throw Error('FooBar')
  })
  const d = Delay.resolve(inc)
  expect(r).toBe(0)
  expect(() => d.value).toThrow(Promise)
  await wait(5)
  expect(r).toBe(1)
  expect(() => d.value).toThrow('FooBar')
})

test('future of awaited value', () => {
  const d = Delay.resolve('foobar')
  expect(d.value).toBe('foobar')
})

test('Delay.resolve with awaited value', () => {
  const d = Delay.resolve('foobar')
  expect(d.value).toBe('foobar')
})

test('Delay.resolve with fulfilled promise', async () => {
  const d = Delay.resolve(Promise.resolve('foobar'))
  expect(() => d.value).toThrow(Promise)
  await wait(5)
  expect(d.value).toBe('foobar')
})

test('Delay.resolve with rejected promise', async () => {
  const d = Delay.resolve(Promise.reject(Error('foobar')))
  expect(() => d.value).toThrow(Promise)
  await wait(5)
  expect(() => d.value).toThrow('foobar')
})

test('Delay.reject with awaited value', () => {
  const d = Delay.reject(Error('FooBar'))
  expect(() => d.value).toThrow('FooBar')
})

test('await Delay.resolve', async () => {
  const d = Delay.resolve('foobar')
  await expect(d).resolves.toBe('foobar')
})

test('await Delay.reject', async () => {
  const d = Delay.reject(Error('FooBar'))
  await expect(() => d).rejects.toThrow('FooBar')
})

test('Delay.then creates future', async () => {
  let r = 0
  const inc = Promise.resolve().then(() => ++r)
  const d1 = Delay.resolve(inc)
  const d2 = d1.then(async () => await wait(5).then(() => ++r))
  expect(r).toBe(0)
  expect(() => d1.value).toThrow(Promise)
  expect(() => d2.value).toThrow(Promise)
  await wait(1)
  expect(r).toBe(1)
  expect(d1.value).toBe(1)
  expect(() => d2.value).toThrow(Promise)
  await wait(5)
  expect(r).toBe(2)
  expect(d1.value).toBe(1)
  expect(d2.value).toBe(2)
})
