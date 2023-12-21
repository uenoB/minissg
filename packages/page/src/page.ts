import type { Module, Content } from '../../vite-plugin-minissg/src/module'
import { ModuleName } from '../../vite-plugin-minissg/src/module-name'
import { type Awaitable, lazy } from '../../vite-plugin-minissg/src/util'
import { dig } from './util'

const join = (s1: string, s2: string): string =>
  ModuleName.root.join('./' + s1).join(s2).path

const urlJoin = (s1: URL, s2: string): URL =>
  new URL(ModuleName.root.join('.' + s1.pathname).join(s2).path, s1.origin)

export interface PathInfo {
  stem: string
  variant: string
  relURL: string
}

export interface Source {
  fileName: URL | string
  url: URL | string
  stem?: string | undefined
  variant?: string | undefined
}

export type Bind<ModuleType = unknown> =
  | Iterable<readonly [string, () => Awaitable<ModuleType>]>
  | Record<string, () => Awaitable<ModuleType>>

export type Bound<SomePage extends Page> = Array<
  readonly [string, SomePage | Bound<SomePage>]
>

export const loadSymbol: unique symbol = Symbol('load')
export const bindSymbol: unique symbol = Symbol('bind')
export const rootSymbol: unique symbol = Symbol('root')

export class Root<SomePage extends Page> {
  readonly fileNameMap: Map<string, SomePage>
  readonly urlMap: Map<string, SomePage>
  readonly stemVariantMap: Map<string, Map<string, SomePage>>
  readonly pages: [SomePage, ...SomePage[]]

  constructor(page: SomePage) {
    this.fileNameMap = new Map<string, SomePage>()
    this.urlMap = new Map<string, SomePage>()
    this.stemVariantMap = new Map<string, Map<string, SomePage>>()
    this.pages = [page]
  }

  add(page: SomePage): void {
    this.fileNameMap.set(page.fileName.href, page)
    this.urlMap.set(page.url.href, page)
    if (page.stem != null && page.variant != null) {
      dig(this.stemVariantMap, page.stem).set(page.variant, page)
    }
  }
}

export class Page<ModuleType = unknown> implements Source {
  private [loadSymbol]: PromiseLike<ModuleType> | undefined = undefined
  private [bindSymbol]: Bound<this> = []
  private [rootSymbol]: Root<this> | undefined = undefined
  readonly fileName: URL
  readonly url: URL
  readonly stem: string
  readonly variant: string

  constructor(src: Source) {
    this.fileName = new URL(src.fileName)
    this.url = new URL(src.url)
    this.stem = src.stem ?? ''
    this.variant = src.variant ?? ''
  }

  // can be overriden if this is not preferred
  parsePath(relPath: string): PathInfo {
    const m = /\.?(?:\.([^./]+(?:\.[^./]+)*))?\.[^./]+$/.exec(relPath)
    const variant = m?.[1] ?? ''
    const stem = relPath.slice(0, m?.index ?? relPath.length)
    const slash = /(?:^|\/|\.[^./]*)$/.test(stem) ? '' : '/'
    const relURL = (variant === '' ? stem : variant + '/' + stem) + slash
    return { stem, variant, relURL }
  }

  bind(pages: Bind<ModuleType>, prefix = ''): this {
    this[rootSymbol] ??= new Root(this)
    const items = Symbol.iterator in pages ? pages : Object.entries(pages)
    for (const [path, load] of items) {
      const s = path.startsWith(prefix) ? path.slice(prefix.length) : path
      const local = this.parsePath(s)
      const fileName = new URL(path, this.fileName)
      const url = urlJoin(this.url, local.relURL)
      const stem = join(this.stem, local.stem)
      const variant = join(this.variant, local.variant)
      const ThisPage = this.constructor as new (x: Source) => this
      const page = new ThisPage({ fileName, url, stem, variant })
      page[loadSymbol] = lazy(load)
      page[bindSymbol].push(['', page])
      page[rootSymbol] = this[rootSymbol]
      this[bindSymbol].push([local.relURL, page[bindSymbol]])
      this[rootSymbol].add(page)
      this[rootSymbol].pages.push(page)
    }
    return this
  }

  mkdir(path: string): this {
    this[rootSymbol] ??= new Root(this)
    const base = urlJoin(this.url, '.')
    const url = urlJoin(urlJoin(base, path), '.')
    const relURL = url.pathname.slice(base.pathname.length)
    const stem = join(this.stem, relURL)
    const fileName = this.fileName
    const variant = this.variant
    const ThisPage = this.constructor as new (x: Source) => this
    const page = new ThisPage({ fileName, url, stem, variant })
    page[rootSymbol] = this[rootSymbol]
    this[rootSymbol].pages.push(page)
    this[bindSymbol].push([relURL, page])
    return page
  }

  mount(page: this): this {
    this[rootSymbol] ??= new Root(this)
    page[rootSymbol] ??= new Root(page)
    if (page[rootSymbol].pages[0] !== page) throw Error('already mounted')
    if (this[rootSymbol].pages[0] === page) return this
    const prefixLength = page[rootSymbol].pages[0].url.pathname.length
    for (const subpage of page[rootSymbol].pages) {
      const m = subpage as { -readonly [K in keyof Page]: Page[K] }
      const path = subpage.url.pathname.slice(prefixLength)
      m.url = new URL(path, this.url)
      m.stem = join(this.stem, subpage.stem)
      m.variant = join(this.variant, subpage.variant)
      subpage[rootSymbol] = this[rootSymbol]
      if (subpage[loadSymbol] != null) this[rootSymbol].add(subpage)
      this[rootSymbol].pages.push(subpage)
    }
    const bound = page[loadSymbol] == null ? page : page[bindSymbol]
    this[bindSymbol].push(['', bound])
    return this
  }

  findByFileName(path: string): this | undefined {
    const root = (this[rootSymbol] ??= new Root(this))
    const fileName = path.startsWith('/')
      ? new URL(path.slice(1), root.pages[0].fileName ?? this.fileName)
      : new URL(path, this.fileName)
    return root.fileNameMap.get(fileName.href)
  }

  findByURL(path: string): this | undefined {
    const root = (this[rootSymbol] ??= new Root(this))
    const url = path.startsWith('/')
      ? new URL(path.slice(1), root.pages[0].url ?? this.url)
      : new URL(path, this.url)
    return root.urlMap.get(url.href)
  }

  find(path: string): this | undefined {
    return this.findByURL(path) ?? this.findByFileName(path)
  }

  variants(): ReadonlyMap<string, this> {
    const ret = this[rootSymbol]?.stemVariantMap.get(this.stem)
    return ret ?? new Map([['', this]])
  }

  load(): PromiseLike<ModuleType> | undefined {
    return this[loadSymbol]
  }

  async entries(): Promise<Module> {
    if (this[loadSymbol] == null) return this[bindSymbol]
    const mod = await this.load()
    if (typeof mod !== 'object' || mod == null) return {}
    if (Symbol.iterator in mod || 'entries' in mod) return mod as Module
    return { default: lazy(() => this.render(mod)) }
  }

  // to be overriden for each app
  render(module: ModuleType): Awaitable<Content> {
    return (module as { default: Content }).default
  }
}
