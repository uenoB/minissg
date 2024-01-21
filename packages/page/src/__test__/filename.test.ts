import { test, expect } from 'vitest'
import { FileName, PathSteps } from '../filename'

test.each([
  ['', ''],
  ['foo', 'foo'],
  ['foo/.', 'foo/'],
  ['foo/bar', 'foo/bar'],
  ['foo//bar', 'foo/bar'],
  ['foo//./bar', 'foo/bar'],
  ['foo//./bar/././././baz', 'foo/bar/baz'],
  ['foo/../bar/../baz', 'baz'],
  ['foo/../bar/../baz/..', ''],
  ['foo/../bar/../baz/../../foo', '../foo'],
  ['foo/.././../bar', '../bar'],
  ['.', ''],
  ['..', '..'],
  ['.././..', '../..']
])('PathSteps.normalize(%o) must be %o', (input, output) => {
  expect(PathSteps.normalize(input)).toBe(output)
})

test.each([
  ['', []],
  ['.', ['']],
  ['./', ['']],
  ['index.html', ['']],
  ['./index.html', ['']],
  ['foo', ['foo']],
  ['./foo', ['foo']],
  ['foo/', ['foo', '']],
  ['foo/.', ['foo', '']],
  ['./foo/', ['foo', '']],
  ['foo/index.html', ['foo', '']],
  ['./foo/index.html', ['foo', '']],
  ['foo/bar', ['foo', 'bar']],
  ['foo/bar/', ['foo', 'bar', '']],
  ['./foo/bar', ['foo', 'bar']],
  ['foo/./bar', ['foo', 'bar']],
  ['foo/bar/.', ['foo', 'bar', '']],
  ['foo/bar/index.html', ['foo', 'bar', '']],
  ['foo/../bar', ['foo', '..', 'bar']],
  ['foo/../bar/index.html', ['foo', '..', 'bar', 'index.html']]
])('PathSteps.fromRelativeModuleName(%o) must be %o', (input, output) => {
  expect(PathSteps.fromRelativeModuleName(input).path).toStrictEqual(output)
})

test.each([
  ['', []],
  ['.', []],
  ['./', []],
  ['index.html', ['index.html']],
  ['./index.html', ['index.html']],
  ['foo', ['foo']],
  ['./foo', ['foo']],
  ['foo/', ['foo', '']],
  ['foo/.', ['foo', '']],
  ['./foo/', ['foo', '']],
  ['foo/index.html', ['foo', 'index.html']],
  ['./foo/index.html', ['foo', 'index.html']],
  ['foo/bar', ['foo', 'bar']],
  ['foo/bar/', ['foo', 'bar', '']],
  ['./foo/bar', ['foo', 'bar']],
  ['foo/./bar', ['foo', 'bar']],
  ['foo/bar/.', ['foo', 'bar', '']],
  ['foo/bar/index.html', ['foo', 'bar', 'index.html']],
  ['foo/../bar', ['bar']],
  ['foo/../bar/index.html', ['bar', 'index.html']]
])('PathSteps.fromRelativeFileName(%o) must be %o', (input, output) => {
  expect(PathSteps.fromRelativeFileName(input).path).toStrictEqual(output)
})

test.each([
  ['', ''],
  ['.', '.'],
  ['./', '.'],
  ['index.html', '.'],
  ['foo', 'foo'],
  ['foo/', 'foo/'],
  ['foo/index.html', 'foo/'],
  ['foo/bar', 'foo/bar'],
  ['foo/bar/', 'foo/bar/']
])('PathSteps(%o).toRelativeModuleName() must be %o', (input, output) => {
  expect(PathSteps.fromRelativeModuleName(input).toRelativeModuleName()).toBe(
    output
  )
})

test.each([
  ['', ''],
  ['.', ''],
  ['./', ''],
  ['index.html', 'index.html'],
  ['foo', 'foo'],
  ['foo/', 'foo/'],
  ['foo/index.html', 'foo/index.html'],
  ['foo/bar', 'foo/bar'],
  ['foo/bar/', 'foo/bar/']
])('PathSteps(%o).toRelativeFileName() must be %o', (input, output) => {
  expect(PathSteps.fromRelativeFileName(input).toRelativeFileName()).toBe(
    output
  )
})

test.each([
  ['', '', ''],
  ['', '.', '.'],
  ['', '..', '..'],
  ['', './', './'],
  ['', 'foo', 'foo'],
  ['', './foo', './foo'],
  ['', 'foo/', 'foo/'],
  ['', 'foo/bar', 'foo/bar'],
  ['foo', '', 'foo'],
  ['foo', '.', '.'],
  ['foo', '..', '..'],
  ['foo', './', './'],
  ['foo', 'bar', 'bar'],
  ['foo/', '', 'foo/'],
  ['foo/', '.', 'foo/.'],
  ['foo/', '..', 'foo/..'],
  ['foo/', './', 'foo/./'],
  ['foo/', 'bar', 'foo/bar'],
  ['foo/bar', '', 'foo/bar'],
  ['foo/bar', '.', 'foo/.'],
  ['foo/bar', '..', 'foo/..'],
  ['foo/bar', './', 'foo/./'],
  ['foo/bar', 'baz', 'foo/baz'],
  ['foo/bar', 'baz/qux', 'foo/baz/qux'],
  ['foo/', 'https://example.com', 'foo/https://example.com'],
  ['foo/', '../bar', 'foo/../bar'],
  ['foo/', 'bar/../baz', 'foo/bar/../baz']
])('FileName(%o).join(%o) must be %o', (input1, input2, output) => {
  expect(FileName.root.join(input1).join(input2).path).toBe(output)
})

test.each([
  ['', ''],
  ['foo', ''],
  ['foo/', 'foo/'],
  ['foo/bar', 'foo/'],
  ['foo/bar/', 'foo/bar/'],
  ['foo/bar/.', 'foo/bar/'],
  ['foo/bar/./', 'foo/bar/./'],
  ['foo/bar/..', 'foo/bar/'],
  ['foo/bar/../', 'foo/bar/../']
])('FileName(%o).dirName() must be %o', (input, output) => {
  expect(FileName.root.join(input).dirName().path).toBe(output)
})
