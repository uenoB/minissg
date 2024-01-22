import { test, expect } from 'vitest'
import type { Module, Content } from '../../../vite-plugin-minissg/src/module'
import { type PageArg, type Asset, Page } from '../index'

interface Pages {
  root: Page
  [k: `/${string}`]: Page | undefined
  [k: `${string}.js`]: Page | Asset | undefined
}

const tree = async (): Promise<Pages> => {
  const bar = Page.module({
    pages: {
      'foo/bar.en.js': (): unknown => 'bar1',
      'foo/bar.ja.js': (): unknown => 'bar2'
    },
    substitutePath: s => s.slice('foo/'.length)
  })
  const baz = Page.module({
    pages: {
      'index.html..en.js': (): unknown => 'baz1',
      'index.html..ja.js': (): unknown => 'baz2'
    }
  })
  const bazModule = { main: () => ({ main: () => baz }) }
  const garply = Page.module({
    pages: {
      'garply.js': (): unknown => 'garply0'
    }
  })
  const grault = Page.module()
  grault.main = () => garply
  const corge = Page.module({
    pages: {
      '': (): unknown => 'corge0',
      'corge.js': (): unknown => 'corge1'
    }
  })
  const quux = Page.module()
  quux.main = () => corge
  const qux = Page.module({
    pages: {
      '': (): unknown => 'qux0',
      'index.html..js': (): unknown => 'qux1',
      'foo.js': (): unknown => 'qux2',
      'bar.html..js': (): unknown => 'qux3'
    }
  })
  const foo = Page.module({
    pages: {
      'bar/bar.js': (): unknown => bar,
      'baz.js': (): unknown => bazModule,
      'foo/index.html..js': (): unknown => 'foo',
      'qux/qux.txt..js': (): unknown => qux,
      'quux/index.html..js': (): unknown => quux,
      'grault/index.html..js': (): unknown => grault
    },
    substitutePath: s => s.replace(/^(?:foo|qux)\//, '')
  })
  const p = Page.module({
    url: 'http://example.com',
    pages: {
      'foo.js': (): unknown => foo,
      'index.html..js': (): unknown => 'root'
    }
  })
  return {
    root: p,
    '/': await p.findByModuleName('/'),
    '/foo/': await p.findByModuleName('/foo/'),
    '/foo/bar/bar/en/bar/': await p.findByModuleName('/foo/bar/bar/en/bar/'),
    '/foo/bar/bar/ja/bar/': await p.findByModuleName('/foo/bar/bar/ja/bar/'),
    '/foo/baz/en/': await p.findByModuleName('/foo/baz/en/'),
    '/foo/baz/ja/': await p.findByModuleName('/foo/baz/ja/'),
    '/foo/qux.txt': await p.findByModuleName('/foo/qux.txt'),
    '/foo/qux.txt/': await p.findByModuleName('/foo/qux.txt/'),
    '/foo/qux.txt/foo/': await p.findByModuleName('/foo/qux.txt/foo/'),
    '/foo/qux.txt/bar.html': await p.findByModuleName('/foo/qux.txt/bar.html'),
    '/foo/quux/': await p.findByModuleName('/foo/quux/'),
    '/foo/quux/corge/': await p.findByModuleName('/foo/quux/corge/'),
    '/foo/grault/garply/': await p.findByModuleName('/foo/grault/garply/'),
    'index.html..js': await p.findByFileName('index.html..js'),
    'foo/index.html..js': await p.findByFileName('foo/index.html..js'),
    'bar/foo/bar.en.js': await p.findByFileName('bar/foo/bar.en.js'),
    'bar/foo/bar.ja.js': await p.findByFileName('bar/foo/bar.ja.js'),
    'index.html..en.js': await p.findByFileName('index.html..en.js'),
    'index.html..ja.js': await p.findByFileName('index.html..ja.js'),
    'qux/qux.txt..js': await p.findByFileName('qux/qux.txt..js'),
    'qux/index.html..js': await p.findByFileName('qux/index.html..js'),
    'qux/foo.js': await p.findByFileName('qux/foo.js'),
    'qux/bar.html..js': await p.findByFileName('qux/bar.html..js'),
    'quux/index.html..js': await p.findByFileName('quux/index.html..js'),
    'quux/corge.js': await p.findByFileName('quux/corge.js'),
    'grault/garply.js': await p.findByFileName('grault/garply.js')
  } as const
}

test('Page.module without argument', () => {
  const p = Page.module({})
  expect(p.url.value.href).toBe('file:///')
  expect(p.fileName).toBe('')
  expect(p.variant).toBe('')
  expect(p.moduleName.path).toBe('')
  expect(p.parent).toBeUndefined()
  expect(p.load()).toBeUndefined()
})

test('Page.module with url', () => {
  const p = Page.module({ url: 'http://example.com/foo/' })
  expect(p.url.value.href).toBe('http://example.com/foo/')
})

test('tree', async () => {
  const t = await tree()
  expect(t).toStrictEqual(
    Object.fromEntries(
      Object.entries(t).map(([k]) => {
        const pat: Record<string, unknown> = {}
        if (k === 'root') {
          pat['fileName'] = ''
          pat['moduleName'] = expect.objectContaining({ path: '' })
        } else if (k.startsWith('/')) {
          pat['moduleName'] = expect.objectContaining({ path: k.slice(1) })
        } else if (k.endsWith('.js')) {
          pat['fileName'] = k
        }
        return [k, expect.objectContaining(pat)]
      })
    )
  )
})

test.each([
  ['/foo'],
  ['/foo/bar'],
  ['/foo/bar/'],
  ['/foo/bar/bar'],
  ['/foo/bar/bar/'],
  ['/foo/bar/bar/en'],
  ['/foo/bar/bar/en/'],
  ['/foo/bar/bar/en/bar'],
  ['/foo/bar/bar/ja'],
  ['/foo/bar/bar/ja/'],
  ['/foo/bar/bar/ja/bar'],
  ['/foo/baz'],
  ['/foo/baz/'],
  ['/foo/baz/en'],
  ['/foo/baz/ja'],
  ['/foo/quux'],
  ['/foo/quux/corge'],
  ['/foo/grault'],
  ['/foo/grault/'],
  ['/foo/grault/garply']
])('intermediate name %s must be undefined', async url => {
  const t = await tree()
  await expect(t.root.findByModuleName(url)).resolves.toBeUndefined()
})

test.each([['foo.js'], ['bar/bar.js'], ['baz.js'], ['grault/index.html..js']])(
  'intermediate file %s must be undefined',
  async path => {
    const t = await tree()
    await expect(t.root.findByFileName(path)).resolves.toBeUndefined()
  }
)

test.each([
  ['/', 'index.html..js'],
  ['/foo/', 'foo/index.html..js'],
  ['/foo/bar/bar/en/bar/', 'bar/foo/bar.en.js'],
  ['/foo/bar/bar/ja/bar/', 'bar/foo/bar.ja.js'],
  ['/foo/baz/en/', 'index.html..en.js'],
  ['/foo/baz/ja/', 'index.html..ja.js'],
  ['/foo/qux.txt', 'qux/qux.txt..js'],
  ['/foo/qux.txt/', 'qux/index.html..js'],
  ['/foo/qux.txt/foo/', 'qux/foo.js'],
  ['/foo/qux.txt/bar.html', 'qux/bar.html..js'],
  ['/foo/quux/', 'quux/index.html..js'],
  ['/foo/quux/corge/', 'quux/corge.js'],
  ['/foo/grault/garply/', 'grault/garply.js']
] as const)('page %s and %s must be identical', async (url, fileName) => {
  const t = await tree()
  expect(t[url]).toBe(t[fileName])
})

test.each([
  ['/', 'root'],
  ['/foo/', 'foo'],
  ['/foo/bar/bar/en/bar/', 'bar1'],
  ['/foo/bar/bar/ja/bar/', 'bar2'],
  ['/foo/baz/en/', 'baz1'],
  ['/foo/baz/ja/', 'baz2'],
  ['/foo/qux.txt', 'qux0'],
  ['/foo/qux.txt/', 'qux1'],
  ['/foo/qux.txt/foo/', 'qux2'],
  ['/foo/qux.txt/bar.html', 'qux3'],
  ['/foo/quux/', 'corge0'],
  ['/foo/quux/corge/', 'corge1'],
  ['/foo/grault/garply/', 'garply0']
] as const)('page %o must have %o as its contents', async (url, body) => {
  const getDefault = async (m: Module): Promise<Content | undefined> =>
    'default' in m ? await m.default : undefined
  const t = await tree()
  const p = t[url]
  expect(p).toBeDefined()
  if (p == null) return
  const context = { module: p, moduleName: p.moduleName }
  const m = p.main(context)
  await expect(Promise.resolve(m).then(getDefault)).resolves.toBe(body)
})

test.each([
  ['/foo/baz/en/', '/foo/baz/ja/'],
  ['/foo/bar/bar/en/bar/', '/foo/bar/bar/ja/bar/'],
  ['/foo/']
] as const)('%o must have %o as its variant', async (...urls) => {
  const t = await tree()
  const undef = Promise.resolve(undefined)
  for (const url of urls) {
    await expect(
      t[url]?.variants().then(Array.from) ?? undef
    ).resolves.toStrictEqual(urls.map(i => t[i]))
  }
})

test('subclass', () => {
  class MyPage extends Page<string, MyPage> {
    static override Base = this
    readonly foo: number
    constructor(arg: PageArg<string, MyPage>, foo: number) {
      super(arg)
      this.foo = foo
    }
  }
  const page = MyPage.module({}, 123)
  expect(page.foo).toBe(123)
})

test('generic subclass', () => {
  class MyPage2<X> extends Page<X, MyPage2<X>> {
    static override Base = this
    readonly foo: number
    constructor(arg: PageArg<X, MyPage2<X>>, foo: number) {
      super(arg)
      this.foo = foo
    }
  }
  const page = MyPage2.module({}, 123)
  expect(page.foo).toBe(123)
})

test.each([
  ['index.html..js', 'index.html..en.js', 'index.html..en.js'],
  ['index.html..js', 'foo/index.html..js', 'foo/index.html..js'],
  ['bar/foo/bar.en.js', 'bar.ja.js', 'bar/foo/bar.ja.js'],
  ['bar/foo/bar.en.js', '../../index.html..js', 'index.html..js'],
  ['foo/index.html..js', '/index.html..en.js', 'index.html..en.js'],
  ['index.html..en.js', 'index.html..ja.js', 'index.html..ja.js'],
  ['quux/corge.js', '../grault/garply.js', 'grault/garply.js'],
  ['grault/garply.js', '../quux/corge.js', 'quux/corge.js']
] as const)(
  'tree[%o].findByFileName(%o) must be %o',
  async (path1, path2, output) => {
    const t = await tree()
    const p = t[path1]
    expect(p).toBeInstanceOf(Page)
    if (!(p instanceof Page)) return
    await expect(p.findByFileName(path2)).resolves.toBe(t[output])
  }
)
