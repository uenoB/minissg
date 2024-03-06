import { test, expect } from 'vitest'
import { run, ModuleName } from '../../../vite-plugin-minissg/src/module'
import { type Inst, Page } from '../index'

const tree = async (): Promise<Inst<Page>> => {
  const bar = Page.module({
    pages: {
      'foo/ba.en.js': (): unknown => 'bar1',
      'foo/ba.ja.js': (): unknown => 'bar2'
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
      'bar.md..js': (): unknown => 'qux3',
      'baz.md..js': (): unknown => 'qux4'
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
      'waldo.js': (): unknown => 'waldo0'
    }
  })
  const foo = Page.module({
    pages: {
      '': waldo,
      'bar/bar.js': (): unknown => bar,
      'baz.js': (): unknown => bazModule,
      'foo/index.html..js': (): unknown => 'foo',
      'qux/qux.md..js': qux,
      'quux/index.html..js': (): unknown => quux,
      'grault/index.html..js': (): unknown => grault
    },
    substitutePath: s => s.replace(/^(?:foo|qux)\//, '')
  })
  const prugh = Page.module({
    pages: {
      'foo/waldo.en.js': (): unknown => 'waldo1'
    }
  })
  const root = Page.module<unknown>({
    url: 'http://example.com',
    pages: {
      'index.html..js': (): unknown => 'root',
      'foo.js': (): unknown => foo,
      '': prugh
    }
  })
  const dummyContext = { moduleName: ModuleName.root, module: {} }
  return (await root.main(dummyContext)) as Inst<Page>
}

// root:                             # /                     /
//  'index.html..js': "root"         # index.html..js        /
//  'foo.js':
//   foo:                            # foo.js                foo/
//    substitutePath: /^(?:foo|qux)\//
//    '':
//     waldo:                        #(foo.js                foo/)
//      '':
//       fred:                       #(foo.js                foo/)
//        'fred.js': "fred"          # fred.js               foo/fred/
//      'waldo.js': "waldo0"         # waldo.js              foo/waldo/
//    'bar/bar.js':
//     bar:                          # bar/bar.js            foo/bar/bar/
//      substitutePath: 'foo/'
//      'foo/ba.en.js': "bar1"       # bar/foo/ba.en.js      foo/bar/bar/en/ba/
//      'foo/ba.ja.js': "bar2"       # bar/foo/ba.ja.js      foo/bar/bar/ja/ba/
//    'baz.js':
//     bazModule:
//      baz:                         # baz.js                foo/baz/
//       'index.html..en.js': "baz1" # index.html..en.js     foo/baz/en/
//       'index.html..ja.js': "baz2" # index.html..ja.js     foo/baz/ja/
//    'foo/index.html..js': "foo"    # foo/index.html..js    foo/
//    'qux/qux.md..js':
//     qux:                          # qux/qux.md..js        foo/qux.md
//      '': "qux0"                   #(qux/qux.md..js        foo/qux.md)
//      'index.html..js': "qux1"     # qux/index.html.js     foo/qux.md/
//      'foo.js': "qux2"             # qux/foo.js            foo/qux.md/foo/
//      'bar.md..js': "qux3"         # qux/bar.md..js        foo/qux.md/bar.md
//      'baz.md..js': "qux4"         # qux/baz.md..js        foo/qux.md/baz.md
//    'quux/index.html..js':
//     quux:                         # quux/index.html..js   foo/quux/
//      corge:                       #(quux/index.html..js   foo/quux/)
//       '': "corge0"                #(quux/index.html..js   foo/quux/)
//       'corge.js': "corge1"        # quux/corge.js         foo/quux/corge/
//    'grault/index.html..js':
//     grault:                       # grault/index.html..js foo/grault/
//      garply:                      #(grault/index.html..js foo/grault/)
//       'garply.js': "garply0"      # grault/garply.js      foo/grault/garply/
//  '':
//   plugh:                          # /                     /
//    'foo/waldo.en.js': "waldo1"    # foo/waldo.en.js       en/foo/waldo/

const pageNames: ReadonlyArray<{
  path: ReadonlyArray<string | number>
  fileName: string
  moduleName: string
  stem: string
  variant: string
  content: unknown
}> = [
  // depth first order
  {
    path: [],
    fileName: '',
    moduleName: '',
    stem: '',
    variant: '',
    content: undefined
  },
  {
    path: ['index.html'], // () => 'root'
    fileName: 'index.html..js',
    moduleName: '',
    stem: 'index.html/',
    variant: '',
    content: 'root'
  },
  {
    path: ['foo/'], // () => foo
    fileName: 'foo.js',
    moduleName: 'foo/',
    stem: 'foo/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0], // foo
    fileName: 'foo.js',
    moduleName: 'foo/',
    stem: 'foo/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, ''], // waldo
    fileName: 'foo.js',
    moduleName: 'foo/',
    stem: 'foo/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, '', ''], // fred
    fileName: 'foo.js',
    moduleName: 'foo/',
    stem: 'foo/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, '', '', 'fred/'], // () => 'fred'
    fileName: 'fred.js',
    moduleName: 'foo/fred/',
    stem: 'foo/fred/',
    variant: '',
    content: 'fred'
  },
  {
    path: ['foo/', 0, '', 'waldo/'], // () => 'waldo0'
    fileName: 'waldo.js',
    moduleName: 'foo/waldo/',
    stem: 'foo/waldo/',
    variant: '',
    content: 'waldo0'
  },
  {
    path: ['foo/', 0, 'baz/'], // () => bazModule
    fileName: 'baz.js',
    moduleName: 'foo/baz/',
    stem: 'foo/baz/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'baz/', 0], // baz
    fileName: 'baz.js',
    moduleName: 'foo/baz/',
    stem: 'foo/baz/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'baz/', 0, 'en/index.html'], // () => 'baz1'
    fileName: 'index.html..en.js',
    moduleName: 'foo/baz/en/',
    stem: 'foo/baz/index.html/',
    variant: 'en',
    content: 'baz1'
  },
  {
    path: ['foo/', 0, 'baz/', 0, 'ja/index.html'], // () => 'baz2'
    fileName: 'index.html..ja.js',
    moduleName: 'foo/baz/ja/',
    stem: 'foo/baz/index.html/',
    variant: 'ja',
    content: 'baz2'
  },
  {
    path: ['foo/', 0, 'index.html'], // () => 'foo'
    fileName: 'foo/index.html..js',
    moduleName: 'foo/',
    stem: 'foo/index.html/',
    variant: '',
    content: 'foo'
  },
  {
    path: ['foo/', 0, 'qux.md'], // qux
    fileName: 'qux/qux.md..js',
    moduleName: 'foo/qux.md',
    stem: 'foo/qux.md/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'qux.md', ''], // () => 'qux0'
    fileName: 'qux/qux.md..js',
    moduleName: 'foo/qux.md',
    stem: 'foo/qux.md/',
    variant: '',
    content: 'qux0'
  },
  {
    path: ['foo/', 0, 'qux.md', 'index.html'], // () => 'qux1'
    fileName: 'qux/index.html..js',
    moduleName: 'foo/qux.md/',
    stem: 'foo/qux.md/index.html/',
    variant: '',
    content: 'qux1'
  },
  {
    path: ['foo/', 0, 'qux.md', 'foo/'], // () => 'qux2'
    fileName: 'qux/foo.js',
    moduleName: 'foo/qux.md/foo/',
    stem: 'foo/qux.md/foo/',
    variant: '',
    content: 'qux2'
  },
  {
    path: ['foo/', 0, 'qux.md', 'bar.md'], // () => 'qux3'
    fileName: 'qux/bar.md..js',
    moduleName: 'foo/qux.md/bar.md',
    stem: 'foo/qux.md/bar.md/',
    variant: '',
    content: 'qux3'
  },
  {
    path: ['foo/', 0, 'qux.md', 'baz.md'], // () => 'qux4'
    fileName: 'qux/baz.md..js',
    moduleName: 'foo/qux.md/baz.md',
    stem: 'foo/qux.md/baz.md/',
    variant: '',
    content: 'qux4'
  },
  {
    path: ['foo/', 0, 'quux/index.html'], // () => quux
    fileName: 'quux/index.html..js',
    moduleName: 'foo/quux/',
    stem: 'foo/quux/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'quux/index.html', 0], // quux
    fileName: 'quux/index.html..js',
    moduleName: 'foo/quux/',
    stem: 'foo/quux/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'quux/index.html', 0, 0], // corge
    fileName: 'quux/index.html..js',
    moduleName: 'foo/quux/',
    stem: 'foo/quux/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'quux/index.html', 0, 0, ''], // () => 'corge0'
    fileName: 'quux/index.html..js',
    moduleName: 'foo/quux/',
    stem: 'foo/quux/index.html/',
    variant: '',
    content: 'corge0'
  },
  {
    path: ['foo/', 0, 'quux/index.html', 0, 0, 'corge/'], // () => 'corge1'
    fileName: 'quux/corge.js',
    moduleName: 'foo/quux/corge/',
    stem: 'foo/quux/index.html/corge/',
    variant: '',
    content: 'corge1'
  },
  {
    path: ['foo/', 0, 'grault/index.html'], // () => grault
    fileName: 'grault/index.html..js',
    moduleName: 'foo/grault/',
    stem: 'foo/grault/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'grault/index.html', 0], // grault
    fileName: 'grault/index.html..js',
    moduleName: 'foo/grault/',
    stem: 'foo/grault/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'grault/index.html', 0, 0], // garply
    fileName: 'grault/index.html..js',
    moduleName: 'foo/grault/',
    stem: 'foo/grault/index.html/',
    variant: '',
    content: undefined
  },
  {
    path: ['foo/', 0, 'grault/index.html', 0, 0, 'garply/'], // () => 'garply0'
    fileName: 'grault/garply.js',
    moduleName: 'foo/grault/garply/',
    stem: 'foo/grault/index.html/garply/',
    variant: '',
    content: 'garply0'
  },
  {
    path: [''], // prugh
    fileName: '',
    moduleName: '',
    stem: '',
    variant: '',
    content: undefined
  },
  {
    path: ['', 'en/foo/waldo/'], // () => 'waldo1'
    fileName: 'foo/waldo.en.js',
    moduleName: 'en/foo/waldo/',
    stem: 'foo/waldo/',
    variant: 'en',
    content: 'waldo1'
  }
]

const groupBy = <X, Y>(a: Iterable<X>, f: (x: X) => Y): Array<[X, ...X[]]> => {
  const map = new Map<Y, [X, ...X[]]>()
  for (const x of a) {
    const key = f(x)
    const values = map.get(key)
    values != null ? values.push(x) : map.set(key, [x])
  }
  return Array.from(map.values())
}

const arrayEq = <X>(a: readonly X[], b: readonly X[]): boolean =>
  a.every((x, i) => x === b[i]) && b.every((x, i) => x === a[i])

const arrayStartsWith = <X>(a: readonly X[], b: readonly X[]): boolean =>
  b.every((x, i) => x === a[i])

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

test('root names', async () => {
  const root = await tree()
  expect(root.fileName).toBe('')
  expect(root.stem).toBe('')
  expect(root.variant).toBe('')
  expect(root.moduleName).toBe('')
})

test.each(
  groupBy(pageNames, x => x.fileName)
    .map(g => g[0])
    .map(x => [x.fileName, x] as const)
)('file %o has proper name properties', async (fileName, props) => {
  const root = await tree()
  const page = await root.findByFileName(fileName)
  expect(page).toBeDefined()
  if (page == null) return
  expect(page.type).toBe('page')
  if (page.type !== 'page') return
  expect(page.fileName).toBe(props.fileName)
  expect(page.stem).toBe(props.stem)
  expect(page.variant).toBe(props.variant)
  expect(page.moduleName).toBe(props.moduleName)
  expect(page).toBe(await root.findByPath(props.path))
})

test.each(
  groupBy(pageNames, x => x.moduleName)
    .map(g => g[0])
    .map(x => [x.moduleName, x] as const)
)('page %o has proper name proparties', async (name, props) => {
  const root = await tree()
  const page = await root.findByModuleName(name)
  expect(page).toBeDefined()
  if (page == null) return
  expect(page.fileName).toBe(props.fileName)
  expect(page.stem).toBe(props.stem)
  expect(page.variant).toBe(props.variant)
  expect(page.moduleName).toBe(props.moduleName)
  expect(page).toBe(await root.findByPath(props.path))
})

test.each(
  groupBy(pageNames, x => x.path)
    .map(g => g[0])
    .map(x => [x.path, x] as const)
)('path %o has proper name proparties', async (path, props) => {
  const root = await tree()
  const page = await root.findByPath(path)
  expect(page).toBeDefined()
  if (page == null) return
  expect(page.fileName).toBe(props.fileName)
  expect(page.stem).toBe(props.stem)
  expect(page.variant).toBe(props.variant)
  expect(page.moduleName).toBe(props.moduleName)
})

test.each(
  pageNames
    .map(x => x.moduleName.replace(/\/*$/, ''))
    .filter(i => pageNames.every(x => x.moduleName !== i))
)('page %o must not exist', async name => {
  const root = await tree()
  await expect(root.findByModuleName(name)).resolves.toBeUndefined()
})

test.each(
  groupBy(pageNames, x => x.stem)
    .map(g => g.map(x => g.map(y => [x, y] as const)))
    .flat(2)
    .map(([x, y]) => [x.moduleName, y.moduleName] as const)
)('page %o is in the variants of page %o', async (name1, name2) => {
  const root = await tree()
  const page1 = await root.findByModuleName(name1)
  expect(page1).toBeDefined()
  if (page1 == null) return
  const page2 = await root.findByModuleName(name2)
  expect(page2).toBeDefined()
  if (page2 == null) return
  const variants = await page2.variants()
  expect(variants.has(page1)).toBeTruthy()
})

test.each(
  groupBy(
    pageNames.filter(
      (x, i) =>
        x.stem === '' ||
        pageNames.slice(0, i).every(y => x.moduleName !== y.moduleName)
    ),
    x => x.stem
  )
    .map(g => g.map(x => [x.stem, g.length] as const))
    .flat(1)
)('stem %o has %d variants', async (stem, numVariants) => {
  const root = await tree()
  const set = await root.findByStem(stem)
  expect(set.size).toBe(numVariants)
})

test.each(
  groupBy(pageNames, x => x.moduleName)
    .map(g => g[0])
    .map(x => x.moduleName)
)('page %o is included in its variants', async name => {
  const root = await tree()
  const page = await root.findByModuleName(name)
  expect(page).toBeDefined()
  if (page == null) return
  const set = await page.variants()
  expect(set.has(page)).toBeTruthy()
})

test.each(
  pageNames.map(x => [
    x.path,
    pageNames
      .map(y => y.path)
      .filter(
        y =>
          arrayEq(y, [...x.path, 0]) ||
          arrayEq(y, [...x.path, '']) ||
          ((x.moduleName === '' || x.moduleName.endsWith('/')) &&
            arrayEq(y, [...x.path, 'index.html']))
      )
  ])
)('path(%o).subpages() should be %o', async (path, subpagePaths) => {
  const root = await tree()
  const page = await root.findByPath(path)
  expect(page).toBeDefined()
  if (page == null) return
  const subpages = Array.from(await page.subpages())
  const expectSubpages = await Promise.all(
    subpagePaths.map(async i => await root.findByPath(i))
  )
  expect(subpages).toStrictEqual(expectSubpages)
})

test.each([
  ['', '', ''],
  ['', 'foo/', 'foo/'],
  ['foo/', '', 'foo/'],
  ['foo/', '.', 'foo/'],
  ['foo/', '..', ''],
  ['foo/bar/bar/en/ba/', '../..', 'foo/bar/bar/'],
  ['foo/bar/bar/en/ba/', '../../ja/ba/', 'foo/bar/bar/ja/ba/'],
  ['foo/qux.md/bar.md', '', 'foo/qux.md/bar.md'],
  ['foo/qux.md/bar.md', '.', 'foo/qux.md/'],
  ['foo/qux.md/bar.md', '..', 'foo/'],
  ['foo/qux.md/bar.md', '../..', ''],
  ['foo/qux.md/bar.md', 'bar.md', 'foo/qux.md/bar.md'],
  ['foo/qux.md/bar.md', 'baz.md', 'foo/qux.md/baz.md'],
  ['foo/qux.md/bar.md', '../qux.md', 'foo/qux.md'],
  ['foo/qux.md/bar.md', '/foo/', 'foo/']
] as const)(
  'page(%o).findByModuleName(%o) must be %o',
  async (path1, path2, path3) => {
    const root = await tree()
    const page1 = await root.findByModuleName(path1)
    expect(page1).toBeDefined()
    if (page1 == null) return
    const page3 = await root.findByModuleName(path3)
    await expect(page1.findByModuleName(path2)).resolves.toBe(page3)
  }
)

test.each([
  ['index.html..js', 'index.html..en.js', 'index.html..en.js'],
  ['index.html..js', 'foo/index.html..js', 'foo/index.html..js'],
  ['bar/foo/ba.en.js', 'bar.ja.js', 'bar/foo/bar.ja.js'],
  ['bar/foo/ba.en.js', '../../index.html..js', 'index.html..js'],
  ['bar/foo/ba.en.js', '../bar.js', 'bar/bar.js'],
  ['foo/index.html..js', '/index.html..en.js', 'index.html..en.js'],
  ['foo/index.html..js', '../index.html..en.js', 'index.html..en.js'],
  ['index.html..en.js', 'index.html..ja.js', 'index.html..ja.js'],
  ['quux/corge.js', '../grault/garply.js', 'grault/garply.js'],
  ['grault/garply.js', '../quux/corge.js', 'quux/corge.js']
] as const)(
  'page(%o).findByFileName(%o) must be %o',
  async (path1, path2, path3) => {
    const root = await tree()
    const page1 = await root.findByFileName(path1)
    expect(page1).toBeInstanceOf(Page)
    if (!(page1 instanceof Page)) return
    const page3 = await root.findByFileName(path3)
    await expect(page1.findByFileName(path2)).resolves.toBe(page3)
  }
)

test.each(
  groupBy(pageNames, x => x.moduleName)
    .map(g => [g[0], g.map(x => x.content)] as const)
    .map(x => [x[0].moduleName, x[1].reduce((z, c) => z ?? c)] as const)
)('page %o is rendered as %o', async (name, content) => {
  const fileName = ModuleName.root.join(name).fileName()
  const root = await tree()
  const pages = await run({ module: root, moduleName: ModuleName.root })
  const body = await (await pages.get(fileName))?.body
  expect(body).toBe(content)
})

test.each(
  pageNames
    .filter(x => x.content != null)
    .map(x => [x.path, x.content] as const)
)('path(%o).load() must be %o', async (path, content) => {
  const root = await tree()
  const page = await root.findByPath(path)
  expect(page).toBeDefined()
  if (page == null) return
  await expect(page.load()).resolves.toBe(content)
})

test.each(
  pageNames.map(
    x =>
      [
        x.path,
        pageNames.find(
          y =>
            arrayStartsWith(y.path, x.path) &&
            x.moduleName === y.moduleName &&
            y.content != null
        )?.content
      ] as const
  )
)('path(%o).fetch() must be %o', async (path, content) => {
  const root = await tree()
  const page = await root.findByPath(path)
  expect(page).toBeDefined()
  if (page == null) return
  await expect(page.fetch()).resolves.toBe(content)
})
