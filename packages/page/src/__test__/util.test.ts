import { test, expect } from 'vitest'
import { dirPath, normalizePath } from '../util'

test('dirPath', () => {
  expect(dirPath('')).toBe('')
  expect(dirPath('foo')).toBe('')
  expect(dirPath('foo/')).toBe('foo/')
  expect(dirPath('foo/bar')).toBe('foo/')
  expect(dirPath('foo/bar/')).toBe('foo/bar/')
  expect(dirPath('foo/bar/.')).toBe('foo/bar/')
  expect(dirPath('foo/bar/./')).toBe('foo/bar/./')
  expect(dirPath('foo/bar/..')).toBe('foo/bar/')
  expect(dirPath('foo/bar/../')).toBe('foo/bar/../')
})

test('normalizePath', () => {
  expect(normalizePath('')).toBe('')
  expect(normalizePath('foo')).toBe('foo')
  expect(normalizePath('foo/.')).toBe('foo/')
  expect(normalizePath('foo/bar')).toBe('foo/bar')
  expect(normalizePath('foo//bar')).toBe('foo/bar')
  expect(normalizePath('foo//./bar')).toBe('foo/bar')
  expect(normalizePath('foo//./bar/././././baz')).toBe('foo/bar/baz')
  expect(normalizePath('foo/../bar/../baz')).toBe('baz')
  expect(normalizePath('foo/../bar/../baz/..')).toBe('')
  expect(normalizePath('foo/../bar/../baz/../../foo')).toBe('../foo')
  expect(normalizePath('foo/.././../bar')).toBe('../bar')
  expect(normalizePath('.')).toBe('')
  expect(normalizePath('..')).toBe('..')
  expect(normalizePath('.././..')).toBe('../..')
})
