import { test, expect } from 'vitest'
import type { Module, Content } from '../../../vite-plugin-minissg/src/module'
import { run, ModuleName } from '../../../vite-plugin-minissg/src/module'
import { type Asset, type Inst, Page } from '../index'

interface Pages {
  root: Inst<Page>
  [k: `/${string}`]: Inst<Page> | undefined
  [k: `${string}.js`]: Inst<Page> | Asset | undefined
  '': Inst<Page> | Asset | undefined
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
  const fred = Page.module({
    pages: {
      'fred.js': (): unknown => 'fred'
    }
  })
  const waldo = Page.module({
    pages: {
      '': fred,
      'waldo.js': (): unknown => 'waldo'
    }
  })
  const foo = Page.module({
    pages: {
      '': waldo,
      'bar/bar.js': (): unknown => bar,
      'baz.js': (): unknown => bazModule,
      'foo/index.html..js': (): unknown => 'foo',
      'qux/qux.txt..js': qux,
      'quux/index.html..js': (): unknown => quux,
      'grault/index.html..js': (): unknown => grault
    },
    substitutePath: s => s.replace(/^(?:foo|qux)\//, '')
  })
  const root = Page.module<unknown>({
    url: 'http://example.com',
    pages: {
      'foo.js': (): unknown => foo,
      'index.html..js': (): unknown => 'root'
    }
  })
  const dummyContext = { moduleName: ModuleName.root, module: {} }
  const p = (await root.main(dummyContext)) as Inst<Page>
  return {
    root: p,
    '/': await p.findByModuleName('/'),
    '/foo/': await p.findByModuleName('/foo/'),
    '/foo/bar/bar/': await p.findByModuleName('/foo/bar/bar/'),
    '/foo/bar/bar/en/bar/': await p.findByModuleName('/foo/bar/bar/en/bar/'),
    '/foo/bar/bar/ja/bar/': await p.findByModuleName('/foo/bar/bar/ja/bar/'),
    '/foo/baz/': await p.findByModuleName('/foo/baz/'),
    '/foo/baz/en/': await p.findByModuleName('/foo/baz/en/'),
    '/foo/baz/ja/': await p.findByModuleName('/foo/baz/ja/'),
    '/foo/qux.txt': await p.findByModuleName('/foo/qux.txt'),
    '/foo/qux.txt/': await p.findByModuleName('/foo/qux.txt/'),
    '/foo/qux.txt/foo/': await p.findByModuleName('/foo/qux.txt/foo/'),
    '/foo/qux.txt/bar.html': await p.findByModuleName('/foo/qux.txt/bar.html'),
    '/foo/quux/': await p.findByModuleName('/foo/quux/'),
    '/foo/quux/corge/': await p.findByModuleName('/foo/quux/corge/'),
    '/foo/grault/': await p.findByModuleName('/foo/grault/'),
    '/foo/grault/garply/': await p.findByModuleName('/foo/grault/garply/'),
    '/foo/waldo/': await p.findByModuleName('/foo/waldo/'),
    '/foo/fred/': await p.findByModuleName('/foo/fred/'),
    '': await p.findByFileName(''),
    'index.html..js': await p.findByFileName('index.html..js'),
    'foo.js': await p.findByFileName('foo.js'),
    'foo/index.html..js': await p.findByFileName('foo/index.html..js'),
    'bar/bar.js': await p.findByFileName('bar/bar.js'),
    'bar/foo/bar.en.js': await p.findByFileName('bar/foo/bar.en.js'),
    'bar/foo/bar.ja.js': await p.findByFileName('bar/foo/bar.ja.js'),
    'baz.js': await p.findByFileName('baz.js'),
    'index.html..en.js': await p.findByFileName('index.html..en.js'),
    'index.html..ja.js': await p.findByFileName('index.html..ja.js'),
    'qux/qux.txt..js': await p.findByFileName('qux/qux.txt..js'),
    'qux/index.html..js': await p.findByFileName('qux/index.html..js'),
    'qux/foo.js': await p.findByFileName('qux/foo.js'),
    'qux/bar.html..js': await p.findByFileName('qux/bar.html..js'),
    'quux/index.html..js': await p.findByFileName('quux/index.html..js'),
    'quux/corge.js': await p.findByFileName('quux/corge.js'),
    'grault/index.html..js': await p.findByFileName('grault/index.html..js'),
    'grault/garply.js': await p.findByFileName('grault/garply.js'),
    'waldo.js': await p.findByFileName('waldo.js'),
    'fred.js': await p.findByFileName('fred.js')
  } as const
}

test('Page.module without argument', async () => {
  const p = Page.module()
  expect(() => p.moduleName).toThrow('not available')
  expect(() => p.stem).toThrow('not available')
  expect(() => p.variant).toThrow('not available')
  expect(p.fileName).toBe('')
  expect(() => p.url).toThrow('not available')
  expect(() => p.parent).toThrow('not available')
  expect(() => p.root).toThrow('not available')
  await expect(p.children).resolves.toBeDefined()
  await expect(p.load()).resolves.toBeUndefined()
  expect(() => p.find('')).toThrow('not available')
  await expect(async () => await p.ref).rejects.toThrow('not found')
})

test('Page.module with url', async () => {
  const r = Page.module({ url: 'http://example.com/foo/' })
  const dummyContext = { moduleName: ModuleName.root, module: {} }
  const p = (await r.main(dummyContext)) as Page
  await expect(p.url).resolves.toMatchObject({
    href: 'http://example.com/foo/'
  })
})

test('new Page', () => {
  const p = new Page()
  expect(() => p.moduleName).toThrow('not available')
  expect(() => p.stem).toThrow('not available')
  expect(() => p.variant).toThrow('not available')
  expect(p.fileName).toBe('')
  expect(() => p.url).toThrow('not available')
  expect(() => p.parent).toThrow('not available')
  expect(() => p.root).toThrow('not available')
  expect(() => p.children).toThrow('not available')
  expect(() => p.load()).toThrow('not available')
  expect(() => p.find('')).toThrow('not available')
  expect(() => p.ref).toThrow('not available')
  const dummyContext = { moduleName: ModuleName.root, module: {} }
  expect(() => p.main(dummyContext)).toThrow('not available')
})

test('tree', async () => {
  const t = await tree()
  expect(t).toStrictEqual(
    Object.fromEntries(
      Object.entries(t).map(([k]) => {
        const pat: Record<string, unknown> = {}
        if (k === 'root') {
          pat['fileName'] = ''
          pat['moduleName'] = ''
        } else if (k.startsWith('/')) {
          pat['moduleName'] = ModuleName.root.join('.' + k).path
        } else if (k.endsWith('.js') || k === '') {
          pat['fileName'] = k
        }
        return [k, expect.objectContaining(pat)]
      })
    )
  )
})

test('tree contents', async () => {
  const t = await tree()
  const pages = await run({ module: t.root, moduleName: ModuleName.root })
  expect(
    Object.fromEntries(
      await Promise.all(
        Array.from(pages, async ([name, load]) => {
          return [ModuleName.root.join(name).path, await (await load).body]
        })
      )
    )
  ).toStrictEqual({
    '': 'root',
    'foo/': 'foo',
    'foo/bar/bar/en/bar/': 'bar1',
    'foo/bar/bar/ja/bar/': 'bar2',
    'foo/baz/en/': 'baz1',
    'foo/baz/ja/': 'baz2',
    'foo/qux.txt': 'qux0',
    'foo/qux.txt/': 'qux1',
    'foo/qux.txt/foo/': 'qux2',
    'foo/qux.txt/bar.html': 'qux3',
    'foo/quux/': 'corge0',
    'foo/quux/corge/': 'corge1',
    'foo/grault/garply/': 'garply0',
    'foo/waldo/': 'waldo',
    'foo/fred/': 'fred'
  })
})

test.each([
  ['/foo'],
  ['/foo/bar'],
  ['/foo/bar/'],
  ['/foo/bar/bar'],
  ['/foo/bar/bar/en'],
  ['/foo/bar/bar/en/'],
  ['/foo/bar/bar/en/bar'],
  ['/foo/bar/bar/ja'],
  ['/foo/bar/bar/ja/'],
  ['/foo/bar/bar/ja/bar'],
  ['/foo/baz'],
  ['/foo/baz/en'],
  ['/foo/baz/ja'],
  ['/foo/quux'],
  ['/foo/quux/corge'],
  ['/foo/grault'],
  ['/foo/grault/garply'],
  ['/foo/waldo'],
  ['/foo/fred']
])('intermediate name %s must be undefined', async url => {
  const t = await tree()
  await expect(t.root.findByModuleName(url)).resolves.toBeUndefined()
})

test.each([
  ['', 'root'],
  ['/', 'index.html..js'],
  ['/foo/', 'foo.js'],
  ['/foo/bar/bar/', 'bar/bar.js'],
  ['/foo/bar/bar/en/bar/', 'bar/foo/bar.en.js'],
  ['/foo/bar/bar/ja/bar/', 'bar/foo/bar.ja.js'],
  ['/foo/baz/', 'baz.js'],
  ['/foo/baz/en/', 'index.html..en.js'],
  ['/foo/baz/ja/', 'index.html..ja.js'],
  ['/foo/qux.txt', 'qux/qux.txt..js'],
  ['/foo/qux.txt/', 'qux/index.html..js'],
  ['/foo/qux.txt/foo/', 'qux/foo.js'],
  ['/foo/qux.txt/bar.html', 'qux/bar.html..js'],
  ['/foo/quux/', 'quux/index.html..js'],
  ['/foo/quux/corge/', 'quux/corge.js'],
  ['/foo/grault/', 'grault/index.html..js'],
  ['/foo/grault/garply/', 'grault/garply.js'],
  ['/foo/waldo/', 'waldo.js'],
  ['/foo/fred/', 'fred.js']
] as const)('page %s and %s must be identical', async (url, fileName) => {
  const t = await tree()
  expect(t[url]).toBe(t[fileName])
})

test.each([
  ['index.html..js', 'root'],
  ['foo/index.html..js', 'foo'],
  ['/foo/bar/bar/en/bar/', 'bar1'],
  ['bar/foo/bar.en.js', 'bar1'],
  ['/foo/bar/bar/ja/bar/', 'bar2'],
  ['bar/foo/bar.ja.js', 'bar2'],
  ['/foo/baz/en/', 'baz1'],
  ['/foo/baz/ja/', 'baz2'],
  ['/foo/qux.txt', 'qux0'],
  ['qux/qux.txt..js', 'qux0'],
  ['/foo/qux.txt/', 'qux1'],
  ['qux/index.html..js', 'qux1'],
  ['/foo/qux.txt/foo/', 'qux2'],
  ['qux/foo.js', 'qux2'],
  ['/foo/qux.txt/bar.html', 'qux3'],
  ['qux/bar.html..js', 'qux3'],
  ['/foo/quux/', undefined], // corge0
  ['quux/index.html..js', undefined], // corge0
  ['/foo/quux/corge/', 'corge1'],
  ['quux/corge.js', 'corge1'],
  ['/foo/grault/garply/', 'garply0'],
  ['grault/garply.js', 'garply0'],
  ['/foo/waldo/', 'waldo'],
  ['waldo.js', 'waldo'],
  ['/foo/fred/', 'fred'],
  ['fred.js', 'fred']
] as const)('page %o must have %o as its contents', async (url, body) => {
  const getDefault = async (m: Module): Promise<Content | undefined> =>
    'default' in m ? await m.default : undefined
  const t = await tree()
  const p = t[url]
  expect(p).toBeDefined()
  if (p == null) return
  expect(p.type).toBe('page')
  if (p.type !== 'page') return
  const context = {
    module: p.parent ?? {},
    moduleName: ModuleName.root.join(p.moduleName)
  }
  const m = p.main(context)
  await expect(Promise.resolve(m).then(getDefault)).resolves.toBe(body)
})

test.each([
  [['/foo/baz/en/', '/foo/baz/ja/', '/foo/baz/']],
  [['/foo/bar/bar/en/bar/', '/foo/bar/bar/ja/bar/']],
  [['/foo/', 'foo/index.html..js']]
] as const)('%o are variants of each other', async urls => {
  const t = await tree()
  for (const url of urls) {
    const p = t[url]
    expect(p?.type).toBe('page')
    if (p?.type !== 'page') return
    const a = p.variants().then(Array.from)
    await expect(a).resolves.toStrictEqual(urls.map(i => t[i]))
  }
})

test.each([
  ['', ['/']],
  ['foo/', ['/foo/', 'foo.js']],
  ['foo/bar/bar/', ['/foo/bar/bar/']],
  ['foo/bar/bar/bar/', ['/foo/bar/bar/en/bar/', '/foo/bar/bar/ja/bar/']],
  ['foo/baz/', ['/foo/baz/', '/foo/baz/en/', '/foo/baz/ja/']]
] as const)('stem %o matches with %o', async (stem, urls) => {
  const t = await tree()
  const set = t.root.findByStem(stem).then(Array.from)
  await expect(set).resolves.toStrictEqual(urls.map(i => t[i]))
})

test('subclass', () => {
  type M = Readonly<{ default?: string }>
  class MyPage1 extends Page<M, MyPage1> {
    static override Base = this
    readonly foo: number
    constructor(foo: number) {
      super()
      this.foo = foo
    }
  }
  const page = MyPage1.module(
    { pages: { foo: () => ({ default: 'bar' }) } },
    123
  )
  expect(page.foo).toBe(123)
})

test('generic subclass', () => {
  class MyPage2<X> extends Page<X, MyPage2<X>> {
    static override Base = this
    readonly foo: number
    constructor(foo: number) {
      super()
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
