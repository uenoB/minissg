import { test, expect } from 'vitest'
import * as M from '../module'

test.each([
  ['foo', '', 'foo'],
  ['foo/bar', '', 'foo/bar'],
  ['foo', 'bar', 'foo/bar'],
  ['index.html', '', ''],
  ['index.html', 'index.html', ''],
  ['foo', 'index.html', 'foo/'],
  ['foo', 'index.html/', 'foo/index.html/'],
  ['foo/index.html', 'bar', 'foo/bar'],
  ['foo/index.html', 'index.html', 'foo/'],
  ['foo', 'bar/./baz', 'foo/bar/baz'],
  ['foo', 'bar/././baz', 'foo/bar/baz'],
  ['foo', './bar', 'foo/bar'],
  ['foo', '././bar', 'foo/bar'],
  ['foo', 'bar/.', 'foo/bar/'],
  ['foo', 'bar/./.', 'foo/bar/'],
  ['foo', 'bar/././', 'foo/bar/'],
  ['foo', '.', 'foo/'],
  ['foo', './', 'foo/'],
  ['foo', './.', 'foo/'],
  ['foo', '././', 'foo/'],
  ['foo', './bar/./baz/./foo/.', 'foo/bar/baz/foo/'],
  ['foo', './bar:baz', 'foo/bar:baz']
])('join %o and %o', (path1, path2, expected) => {
  expect(M.ModuleName.root.join(path1).join(path2).path).toBe(expected)
})

test.each([
  ['foo', '/bar'],
  ['foo', 'bar//baz'],
  ['foo', '../bar/baz'],
  ['foo', 'bar/../baz'],
  ['foo', 'bar/baz/..'],
  ['foo', 'bar:baz'],
  ['foo', 'bar?baz'],
  ['foo', 'bar#baz']
])('join %o and %o', (path1, path2) => {
  expect(() => M.ModuleName.root.join(path1).join(path2)).toThrow(/invalid/)
})

test.each([
  ['', '', true],
  ['foo', '', true],
  ['foo', 'foo', true],
  ['foo', 'bar', false],
  ['foo/bar', 'foo', true],
  ['foo/bar', 'foo/bar', true],
  ['foo/barr', 'foo/bar', false],
  ['foo/bar', 'foo/barr', false],
  ['foo/bar/', 'foo/bar', true],
  ['foo/bar', 'foo/bar/', false],
  ['foo/bar/index.html', 'foo/bar/', true]
])('%o isIn %o', (path1, path2, expected) => {
  expect(
    M.ModuleName.root.join(path1).isIn(M.ModuleName.root.join(path2))
  ).toBe(expected)
})
