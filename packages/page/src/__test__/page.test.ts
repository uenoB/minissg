import { test, expect } from 'vitest'
import { Page, rootSymbol, bindSymbol, loadSymbol } from '../page'

test('new', () => {
  const fileName = new URL('file:///a/b/index.js')
  const url = new URL('http://localhost')
  expect(new Page({ fileName, url })).toMatchObject({
    fileName,
    url,
    stem: '',
    variant: '',
    [loadSymbol]: undefined,
    [bindSymbol]: [],
    [rootSymbol]: undefined
  })
})

test('parsePath', () => {
  const fileName = new URL('file:///a/b/index.js')
  const url = new URL('http://localhost')
  const page = new Page({ fileName, url })
  expect(page.parsePath('foo/bar.js')).toStrictEqual({
    variant: '',
    stem: 'foo/bar',
    relURL: 'foo/bar/'
  })
  expect(page.parsePath('foo/bar.en.js')).toStrictEqual({
    variant: 'en',
    stem: 'foo/bar',
    relURL: 'en/foo/bar/'
  })
  expect(page.parsePath('foo/favicon.ico.js')).toStrictEqual({
    variant: 'ico',
    stem: 'foo/favicon',
    relURL: 'ico/foo/favicon/'
  })
  expect(page.parsePath('foo/favicon.ico.en.js')).toStrictEqual({
    variant: 'ico.en',
    stem: 'foo/favicon',
    relURL: 'ico.en/foo/favicon/'
  })
  expect(page.parsePath('foo/favicon.ico..en.js')).toStrictEqual({
    variant: 'en',
    stem: 'foo/favicon.ico',
    relURL: 'en/foo/favicon.ico'
  })
  expect(page.parsePath('foo/favicon.ico...en.js')).toStrictEqual({
    variant: 'en',
    stem: 'foo/favicon.ico.',
    relURL: 'en/foo/favicon.ico.'
  })
  expect(page.parsePath('foo/favicon.ico..en..tk.js')).toStrictEqual({
    variant: 'tk',
    stem: 'foo/favicon.ico..en',
    relURL: 'tk/foo/favicon.ico..en'
  })
  expect(page.parsePath('foo/index.html.js')).toStrictEqual({
    variant: 'html',
    stem: 'foo/index',
    relURL: 'html/foo/index/'
  })
  expect(page.parsePath('foo/index.html..js')).toStrictEqual({
    variant: '',
    stem: 'foo/index.html',
    relURL: 'foo/index.html'
  })
  expect(page.parsePath('foo/bar')).toStrictEqual({
    variant: '',
    stem: 'foo/bar',
    relURL: 'foo/bar/'
  })
  expect(page.parsePath('foo/bar/')).toStrictEqual({
    variant: '',
    stem: 'foo/bar/',
    relURL: 'foo/bar/'
  })
})

test('mkdir', () => {
  const fileName = new URL('file:///foo/index.js')
  const url = new URL('http://localhost')
  const page = new Page({ fileName, url })
  expect(page.mkdir('baz/')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/baz/' },
    stem: 'baz/',
    variant: '',
    [loadSymbol]: undefined
  })
  expect(page.mkdir('foo.en.js')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/foo.en.js/' },
    stem: 'foo.en.js/',
    variant: '',
    [loadSymbol]: undefined
  })
  expect(page.mkdir('bar/foo.en.js')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/bar/foo.en.js/' },
    stem: 'bar/foo.en.js/',
    variant: '',
    [loadSymbol]: undefined
  })
})

test('mkdir on file', () => {
  const fileName = new URL('file:///foo/index.en.js')
  const url = new URL('http://localhost/en/index')
  const page = new Page({ fileName, url, stem: 'index', variant: 'en' })
  expect(page.mkdir('baz/')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/en/index/baz/' },
    stem: 'index/baz/',
    variant: 'en',
    [loadSymbol]: undefined
  })
  expect(page.mkdir('foo.en.js')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/en/index/foo.en.js/' },
    stem: 'index/foo.en.js/',
    variant: 'en',
    [loadSymbol]: undefined
  })
  expect(page.mkdir('bar/foo.en.js')).toMatchObject({
    fileName,
    url: { href: 'http://localhost/en/index/bar/foo.en.js/' },
    stem: 'index/bar/foo.en.js/',
    variant: 'en',
    [loadSymbol]: undefined
  })
})

test('bind', () => {
  const fileName = new URL('file:///a/b/index.js')
  const url = new URL('http://localhost')
  const page = new Page({ fileName, url })
  const FOO1 = (): string => 'FOO1'
  const FOO2 = (): string => 'FOO2'
  const BAR = (): string => 'BAR'
  const BAZ = (): string => 'BAZ'
  page.bind([
    ['foo/index.html..js', FOO1],
    ['foo.js', FOO2],
    ['foo/bar.en.js', BAR],
    ['foo/baz.tk.js', BAZ]
  ])
  expect(page[bindSymbol]).toMatchObject([
    [
      'foo/index.html',
      [
        [
          '',
          {
            fileName: { href: 'file:///a/b/foo/index.html..js' },
            url: { href: 'http://localhost/foo/' },
            stem: 'foo/',
            variant: '',
            [loadSymbol]: {}
          }
        ]
      ]
    ],
    [
      'foo/',
      [
        [
          '',
          {
            fileName: { href: 'file:///a/b/foo.js' },
            url: { href: 'http://localhost/foo/' },
            stem: 'foo',
            variant: '',
            [loadSymbol]: {}
          }
        ]
      ]
    ],
    [
      'en/foo/bar/',
      [
        [
          '',
          {
            fileName: { href: 'file:///a/b/foo/bar.en.js' },
            url: { href: 'http://localhost/en/foo/bar/' },
            stem: 'foo/bar',
            variant: 'en',
            [loadSymbol]: {}
          }
        ]
      ]
    ],
    [
      'tk/foo/baz/',
      [
        [
          '',
          {
            fileName: { href: 'file:///a/b/foo/baz.tk.js' },
            url: { href: 'http://localhost/tk/foo/baz/' },
            stem: 'foo/baz',
            variant: 'tk',
            [loadSymbol]: {}
          }
        ]
      ]
    ]
  ])
})

test('mount', () => {
  const fileName1 = new URL('file:///foo/index.js')
  const url1 = new URL('http://localhost')
  const page1 = new Page({ fileName: fileName1, url: url1 })
  const fileName2 = new URL('file:///bar/index.js')
  const url2 = new URL('http://localhost:8888/2/')
  const page2 = new Page({ fileName: fileName2, url: url2 })
  page1.bind([
    ['foo1.js', () => 'FOO1'],
    ['bar.en.js', () => 'BAR1']
  ])
  page2.bind([
    ['foo2.js', () => 'FOO2'],
    ['bar.tk.js', () => 'BAR2']
  ])
  page1.mount(page2)
  expect(page1[bindSymbol]).toMatchObject([
    [
      'foo1/',
      [
        [
          '',
          {
            fileName: { href: 'file:///foo/foo1.js' },
            url: { href: 'http://localhost/foo1/' },
            stem: 'foo1',
            variant: ''
          }
        ]
      ]
    ],
    [
      'en/bar/',
      [
        [
          '',
          {
            fileName: { href: 'file:///foo/bar.en.js' },
            url: { href: 'http://localhost/en/bar/' },
            stem: 'bar',
            variant: 'en'
          }
        ]
      ]
    ],
    ['', page2]
  ])
  expect(page2[bindSymbol]).toMatchObject([
    [
      'foo2/',
      [
        [
          '',
          {
            fileName: { href: 'file:///bar/foo2.js' },
            url: { href: 'http://localhost/foo2/' },
            stem: 'foo2',
            variant: ''
          }
        ]
      ]
    ],
    [
      'tk/bar/',
      [
        [
          '',
          {
            fileName: { href: 'file:///bar/bar.tk.js' },
            url: { href: 'http://localhost/tk/bar/' },
            stem: 'bar',
            variant: 'tk'
          }
        ]
      ]
    ]
  ])
})

test('mount subdir', () => {
  const fileName1 = new URL('file:///foo/index.js')
  const url1 = new URL('http://localhost')
  const page1 = new Page({ fileName: fileName1, url: url1 })
  const fileName2 = new URL('file:///bar/index.js')
  const url2 = new URL('http://localhost:8888/2/')
  const page2 = new Page({ fileName: fileName2, url: url2 })
  page1.bind([
    ['foo1.js', () => 'FOO1'],
    ['bar.en.js', () => 'BAR1']
  ])
  page2.bind([
    ['foo2.js', () => 'FOO2'],
    ['bar.tk.js', () => 'BAR2']
  ])
  const page3 = page1.mkdir('baz/')
  page3.mount(page2)
  expect(page1[bindSymbol]).toMatchObject([
    [
      'foo1/',
      [
        [
          '',
          {
            fileName: { href: 'file:///foo/foo1.js' },
            url: { href: 'http://localhost/foo1/' },
            stem: 'foo1',
            variant: ''
          }
        ]
      ]
    ],
    [
      'en/bar/',
      [
        [
          '',
          {
            fileName: { href: 'file:///foo/bar.en.js' },
            url: { href: 'http://localhost/en/bar/' },
            stem: 'bar',
            variant: 'en'
          }
        ]
      ]
    ],
    ['baz/', page3]
  ])
  expect(page3[bindSymbol]).toMatchObject([['', page2]])
  expect(page2[bindSymbol]).toMatchObject([
    [
      'foo2/',
      [
        [
          '',
          {
            fileName: { href: 'file:///bar/foo2.js' },
            url: { href: 'http://localhost/baz/foo2/' },
            stem: 'baz/foo2',
            variant: ''
          }
        ]
      ]
    ],
    [
      'tk/bar/',
      [
        [
          '',
          {
            fileName: { href: 'file:///bar/bar.tk.js' },
            url: { href: 'http://localhost/baz/tk/bar/' },
            stem: 'baz/bar',
            variant: 'tk'
          }
        ]
      ]
    ]
  ])
  expect(page2[rootSymbol]).toBe(page1[rootSymbol])
  expect(page3[rootSymbol]).toBe(page1[rootSymbol])
})

test('find', () => {
  const fileName = new URL('file:///a/b/index.js')
  const url = new URL('http://localhost')
  const page = new Page({ fileName, url })
  page.bind([
    ['foo/index.html..js', () => 'FOO'],
    ['foo/bar.en.js', () => 'BAR'],
    ['foo/baz.tk.js', () => 'BAZ']
  ])
  const [, foo, bar, baz] = page[rootSymbol]?.pages as [Page, Page, Page, Page]
  expect(page.findByURL('foo/')).toBe(foo)
  expect(page.findByURL('en/foo/bar/')).toBe(bar)
  expect(page.findByURL('tk/foo/baz/')).toBe(baz)
  expect(page.findByURL('foo')).toBeUndefined()
  expect(page.findByURL('en/foo/bar')).toBeUndefined()
  expect(page.findByURL('tk/foo/baz')).toBeUndefined()
  expect(page.findByURL('/foo/')).toBe(foo)
  expect(page.findByURL('/en/foo/bar/')).toBe(bar)
  expect(page.findByURL('/tk/foo/baz/')).toBe(baz)
  expect(page.findByFileName('foo/index.html..js')).toBe(foo)
  expect(page.findByFileName('foo/bar.en.js')).toBe(bar)
  expect(page.findByFileName('foo/baz.tk.js')).toBe(baz)
  expect(page.findByFileName('/foo/index.html..js')).toBe(foo)
  expect(page.findByFileName('/foo/bar.en.js')).toBe(bar)
  expect(page.findByFileName('/foo/baz.tk.js')).toBe(baz)
  expect(foo.findByURL('.')).toBe(foo)
  expect(foo.findByURL('../en/foo/bar/')).toBe(bar)
  expect(foo.findByURL('../tk/foo/baz/')).toBe(baz)
  expect(foo.findByURL('/foo/')).toBe(foo)
  expect(foo.findByURL('/en/foo/bar/')).toBe(bar)
  expect(foo.findByURL('/tk/foo/baz/')).toBe(baz)
  expect(foo.findByFileName('index.html..js')).toBe(foo)
  expect(foo.findByFileName('bar.en.js')).toBe(bar)
  expect(foo.findByFileName('baz.tk.js')).toBe(baz)
  expect(foo.findByFileName('/foo/index.html..js')).toBe(foo)
  expect(foo.findByFileName('/foo/bar.en.js')).toBe(bar)
  expect(foo.findByFileName('/foo/baz.tk.js')).toBe(baz)
  expect(bar.findByURL('../../../foo/')).toBe(foo)
  expect(bar.findByURL('.')).toBe(bar)
  expect(bar.findByURL('../../../tk/foo/baz/')).toBe(baz)
  expect(bar.findByURL('/foo/')).toBe(foo)
  expect(bar.findByURL('/en/foo/bar/')).toBe(bar)
  expect(bar.findByURL('/tk/foo/baz/')).toBe(baz)
  expect(bar.findByFileName('index.html..js')).toBe(foo)
  expect(bar.findByFileName('bar.en.js')).toBe(bar)
  expect(bar.findByFileName('baz.tk.js')).toBe(baz)
  expect(bar.findByFileName('/foo/index.html..js')).toBe(foo)
  expect(bar.findByFileName('/foo/bar.en.js')).toBe(bar)
  expect(bar.findByFileName('/foo/baz.tk.js')).toBe(baz)
})
