import { test, expect, describe } from 'vitest'
import * as M from '../query'

describe.each([
  ['foo.txt?Foo', 'foo.txt', ''],
  ['foo.txt?Fooo', undefined, undefined],
  ['foo.txt?Fo', undefined, undefined],
  ['foo.txt?Foo&Bar', 'foo.txt', ''],
  ['foo.txt?Bar&Foo', 'foo.txt', ''],
  ['foo.txt?Bar&Foo&Baz', 'foo.txt', ''],
  ['foo.txt?Foo#bar', 'foo.txt', ''],
  ['foo.txt?Bar#Foo', undefined, undefined],
  ['foo.txt?Bar#&Foo', undefined, undefined],
  ['foo.txt?Bar?Foo', undefined, undefined],
  ['foo.txt?Foo.html', undefined, undefined],
  ['foo.txt?Foo=xx&Bar', 'foo.txt', 'xx'],
  ['foo.txt?Bar&Foo=xx', 'foo.txt', 'xx'],
  ['foo.txt?Bar&Foo=xx&Baz', 'foo.txt', 'xx'],
  ['foo.txt?Foo=xx#bar', 'foo.txt', 'xx'],
  ['foo.txt?Bar#Foo=xx', undefined, undefined],
  ['foo.txt?Bar#&Foo=xx', undefined, undefined],
  ['foo.txt?Bar?Foo=xx', undefined, undefined],
  ['foo.txt?Foo=xx', 'foo.txt', 'xx'],
  ['foo.txt?Foo.html=xx.js', undefined, undefined],
  ['foo.txt?Foo=xx.html', 'foo.txt', 'xx.html'],
  ['foo.txt?Foo.js=xx', undefined, undefined],
  ['foo.txt?Foo.js=xx&Bar', undefined, undefined],
  ['foo.txt?Bar&Foo.js=xx', undefined, undefined],
  ['foo.txt?Foo.html.js=xx', undefined, undefined]
])('Query.Class Foo property', (url, stem, param) => {
  test(`test against ${url}`, () => {
    const c = M.Query.Class('Foo')
    expect(c.test(url)).toBe(stem != null)
  })

  test(`value of ${url}`, () => {
    const c = M.Query.Class('Foo')
    expect(c.match(url)?.value).toBe(param)
  })
})

test.each([
  ['foo.txt', 'foo.txt?Foo'],
  ['foo.txt?', 'foo.txt?Foo&'],
  ['foo.txt#', 'foo.txt?Foo#'],
  ['foo.txt?#Foo', 'foo.txt?Foo&#Foo'],
  ['foo.txt?Foo', 'foo.txt?Foo'],
  ['foo.txt?Fooo', 'foo.txt?Foo&Fooo'],
  ['foo.txt?Fo', 'foo.txt?Foo&Fo'],
  ['foo.txt?Fooo#bar', 'foo.txt?Foo&Fooo#bar'],
  ['foo.txt?Bar#&Foo', 'foo.txt?Foo&Bar#&Foo'],
  ['foo.txt?Bar?Foo', 'foo.txt?Foo&Bar?Foo'],
  ['foo.txt?Bar.js?Foo', 'foo.txt?Foo&Bar.js?Foo'],
  ['foo.txt?Bar.js#Foo', 'foo.txt?Foo&Bar.js#Foo'],
  ['foo.txt.js', 'foo.txt.js?Foo'],
  ['foo.txt.js?Foo.html.js', 'foo.txt.js?Foo&Foo.html.js'],
  ['foo.txt/bar', 'foo.txt/bar?Foo'],
  ['foo.txt=bar', 'foo.txt=bar?Foo'],
  ['foo.txt&bar', 'foo.txt&bar?Foo']
])('Query.Class add Foo to %s', (url, expected) => {
  const c = M.Query.Class('Foo')
  expect(c.add(url)).toBe(expected)
})
