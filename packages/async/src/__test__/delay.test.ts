import { test, expect } from 'vitest'
import { Delay } from '../delay'

const wait = async (): Promise<void> => {
  await new Promise(resolve => {
    setImmediate(resolve)
  })
}

test('Delay.resolve with value', () => {
  const d = Delay.resolve('foobar')
  expect(d.value).toBe('foobar')
})

test('await Delay.resolve with value', async () => {
  const d = Delay.resolve('foobar')
  await expect(d).resolves.toBe('foobar')
})

test('Delay.resolve with fulfilled promise', async () => {
  const d = Delay.resolve(Promise.resolve('foobar'))
  expect(() => d.value).toThrow(Promise)
  await wait()
  expect(d.value).toBe('foobar')
})

test('await Delay.resolve with fulfilled promise', async () => {
  const d = Delay.resolve(Promise.resolve('foobar'))
  await expect(d).resolves.toBe('foobar')
})

test('Delay.resolve with rejected promise', async () => {
  const d = Delay.resolve(Promise.reject(Error('foobar')))
  expect(() => d.value).toThrow(Promise)
  await wait()
  expect(() => d.value).toThrow('foobar')
})

test('await Delay.resolve with rejected promise', async () => {
  const d = Delay.resolve(Promise.reject(Error('foobar')))
  await expect(() => d).rejects.toThrowError('foobar')
})

test('Delay.reject with value', () => {
  const d = Delay.reject(Error('foobar'))
  expect(() => d.value).toThrow('foobar')
})

test('await Delay.reject with value', async () => {
  const d = Delay.reject(Error('foobar'))
  await expect(() => d).rejects.toThrowError('foobar')
})

test('Delay.reject with fulfilled promise', async () => {
  const d = Delay.reject(Promise.resolve(Error('foobar')))
  expect(() => d.value).toThrow(Promise)
  await wait()
  expect(() => d.value).toThrow('foobar')
})

test('await Delay.reject with fulfilled promise', async () => {
  const d = Delay.reject(Promise.resolve(Error('foobar')))
  await expect(() => d).rejects.toThrowError('foobar')
})

test('Delay.reject with rejected promise', async () => {
  const d = Delay.reject(Promise.reject(Error('foobar')))
  expect(() => d.value).toThrow(Promise)
  await wait()
  expect(() => d.value).toThrow('foobar')
})

test('await Delay.reject with rejected promise', async () => {
  const d = Delay.reject(Promise.reject(Error('foobar')))
  await expect(() => d).rejects.toThrowError('foobar')
})

test('wrap of fulfilled Delay runs immediately', () => {
  const d1 = Delay.resolve(1234)
  let r = 0
  const d2 = d1.wrap(x => (r = x + 1))
  expect(d1.value).toBe(1234)
  expect(d2.value).toBe(1235)
  expect(r).toBe(1235)
})
