import { test, expect } from 'vitest'
import type { Module, Content } from '../../../vite-plugin-minissg/src/module'
import { Page, pathSteps, type Asset } from '../page'

const undef = Promise.resolve(undefined)

interface Pages {
  root: Page
  [k: `/${string}`]: Page | undefined
  [k: `${string}.js`]: Page | Asset | undefined
}

const tree = async (): Promise<Pages> => {
  let fooPage: Page | undefined
  let barPage: Page | undefined
  let bazPage: Page | undefined
  let quxPage: Page | undefined
  const bar = (): Module => ({
    entries: context =>
      (barPage ??= Page.new({
        context,
        pages: { 'foo/bar.en.js': () => 'bar1', 'foo/bar.ja.js': () => 'bar2' },
        substPath: s => s.slice('foo/'.length)
      }))
  })
  const baz = (): Module => ({
    entries: context =>
      (bazPage ??= Page.new({
        context,
        pages: {
          'index.html..en.js': () => 'baz1',
          'index.html..ja.js': () => 'baz2'
        }
      }))
  })
  const qux = (): Module => ({
    entries: context =>
      (quxPage ??= Page.new({
        context,
        pages: {
          '': () => 'qux0',
          'index.html..js': () => 'qux1',
          'foo.js': () => 'qux2',
          'bar.html..js': () => 'qux3'
        }
      }))
  })
  const foo = (): Module => ({
    entries: context =>
      (fooPage ??= Page.new<unknown>({
        context,
        pages: {
          'bar/bar.js': bar,
          'baz.js': baz,
          'foo/index.html..js': () => 'foo',
          'qux/qux.html..js': qux
        },
        substPath: s => s.replace(/^(?:foo|qux)\//, '')
      }))
  })
  const p = Page.new<unknown>({
    url: 'http://example.com',
    pages: { 'foo.js': foo, 'index.html..js': () => 'root' }
  })
  return {
    root: p,
    '/': await p.findByURL(''),
    '/foo/': await p.findByURL('/foo/'),
    '/foo/bar/bar/en/bar/': await p.findByURL('/foo/bar/bar/en/bar/'),
    '/foo/bar/bar/ja/bar/': await p.findByURL('/foo/bar/bar/ja/bar/'),
    '/foo/baz/en/': await p.findByURL('/foo/baz/en/'),
    '/foo/baz/ja/': await p.findByURL('/foo/baz/ja/'),
    '/foo/qux.html': await p.findByURL('/foo/qux.html'),
    '/foo/qux.html/': await p.findByURL('/foo/qux.html/'),
    '/foo/qux.html/foo/': await p.findByURL('/foo/qux.html/foo/'),
    '/foo/qux.html/bar.html': await p.findByURL('/foo/qux.html/bar.html'),
    'index.html..js': await p.findByFileName('index.html..js'),
    'foo.js': fooPage,
    'foo/index.html..js': await p.findByFileName('foo/index.html..js'),
    'bar/bar.js': barPage,
    'bar/foo/bar.en.js': await p.findByFileName('bar/foo/bar.en.js'),
    'bar/foo/bar.ja.js': await p.findByFileName('bar/foo/bar.ja.js'),
    'baz.js': bazPage,
    'index.html..en.js': await p.findByFileName('index.html..en.js'),
    'index.html..ja.js': await p.findByFileName('index.html..ja.js'),
    'qux/qux.html..js': await p.findByFileName('qux/qux.html..js'),
    'qux/index.html..js': await p.findByFileName('qux/index.html..js'),
    'qux/foo.js': await p.findByFileName('qux/foo.js'),
    'qux/bar.html..js': await p.findByFileName('qux/bar.html..js')
  } as const
}

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
  expect(pathSteps('/')).toStrictEqual([''])
  expect(pathSteps('foo')).toStrictEqual(['foo'])
  expect(pathSteps('/foo')).toStrictEqual(['foo'])
  expect(pathSteps('foo/')).toStrictEqual(['foo', ''])
  expect(pathSteps('/foo/')).toStrictEqual(['foo', ''])
  expect(pathSteps('foo/bar')).toStrictEqual(['foo', 'bar'])
  expect(pathSteps('foo/bar/')).toStrictEqual(['foo', 'bar', ''])
})

test('new without argument', () => {
  const p = new Page()
  expect(p.url).toBe('file:///')
  expect(p.fileName).toBe('')
  expect(p.variant).toBe('')
  expect(p.moduleName.path).toBe('')
  expect(p.parent).toBeUndefined()
  expect(p.root).toBe(p)
  expect(p.load()).toBeUndefined()
})

test('new with url', () => {
  const p = new Page({ url: 'http://example.com/foo/' })
  expect(p.url).toBe('http://example.com/foo/')
})

test('page as context', () => {
  const p1 = new Page()
  const p2 = new Page({ context: p1 })
  expect(p2.parent).toBe(p1)
})

test('tree', async () => {
  const t = await tree()
  expect(t).toStrictEqual(
    Object.fromEntries(
      Object.entries(t).map(([k]) => {
        const pat: Record<string, unknown> = {}
        pat['root'] = t.root
        if (k === 'root') {
          pat['fileName'] = ''
          pat['moduleName'] = expect.objectContaining({ path: '' })
        } else if (k.startsWith('/')) {
          pat['moduleName'] = expect.objectContaining({ path: k.slice(1) })
        } else {
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
  ['/foo/baz/ja']
])('page %s must be undefined', async url => {
  const t = await tree()
  await expect(t.root.findByURL(url)).resolves.toBeUndefined()
})

test.each([
  ['/', 'index.html..js'],
  ['/foo/', 'foo/index.html..js'],
  ['/foo/bar/bar/en/bar/', 'bar/foo/bar.en.js'],
  ['/foo/bar/bar/ja/bar/', 'bar/foo/bar.ja.js'],
  ['/foo/baz/en/', 'index.html..en.js'],
  ['/foo/baz/ja/', 'index.html..ja.js'],
  ['/foo/qux.html', 'qux/qux.html..js'],
  ['/foo/qux.html/', 'qux/index.html..js'],
  ['/foo/qux.html/foo/', 'qux/foo.js'],
  ['/foo/qux.html/bar.html', 'qux/bar.html..js']
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
  ['/foo/qux.html', 'qux0'],
  ['/foo/qux.html/', 'qux1'],
  ['/foo/qux.html/foo/', 'qux2'],
  ['/foo/qux.html/bar.html', 'qux3']
] as const)('page %o must have %o as its contents', async (url, body) => {
  const getDefault = async (m: Module): Promise<Content | undefined> =>
    'default' in m ? await m.default : undefined
  const t = await tree()
  await expect(t[url]?.entries().then(getDefault) ?? undef).resolves.toBe(body)
})

test.each([
  ['/foo/baz/en/', '/foo/baz/ja/'],
  ['/foo/bar/bar/en/bar/', '/foo/bar/bar/ja/bar/'],
  ['/foo/']
] as const)('%o must have %o as variants', async (...urls) => {
  const t = await tree()
  const undef = Promise.resolve(undefined)
  for (const url of urls) {
    await expect(
      t[url]?.variants().then(Array.from) ?? undef
    ).resolves.toStrictEqual(urls.map(i => t[i]))
  }
})
