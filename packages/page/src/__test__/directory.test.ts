import { test, expect } from 'vitest'
import { pathSteps } from '../directory'

test.each([
  ['', []],
  ['/', ['']],
  ['foo', ['foo']],
  ['/foo', ['foo']],
  ['foo/', ['foo', '']],
  ['/foo/', ['foo', '']],
  ['foo/bar', ['foo', 'bar']],
  ['foo/bar/', ['foo', 'bar', '']]
])('pathSteps(%o) must be %o', (input, output) => {
  expect(pathSteps(input)).toStrictEqual(output)
})
