const QUERY_RE = (pat: string): RegExp =>
  RegExp(String.raw`^([^?]*)\?(?:([^#]*?)&)?(${pat})(?:=([^#]*?))?(&|#|$)`)
type Opt<X> = X | undefined
type Matched<Name> = [string, string, Opt<string>, Name, Opt<string>, string]
type Match<Name> = Matched<Name> & { index: number; input: string }

const op = (c: string, t: string, e = ''): string => (c !== '' ? t : e)

const prepend = (id: string, k: string, v: string): string =>
  id.replace(/\?|(?=#)|$/, m => `?${k}${op(v, '=')}${v}${op(m, '&')}`)

export class Query<Name extends string = string> {
  private readonly m: Readonly<Match<Name>>

  private constructor(m: Match<Name>) {
    this.m = m
  }

  get value(): string {
    return this.m[4] ?? ''
  }

  remove(): string {
    const q = this.m[2] == null && this.m[5] !== '&' ? '' : '?'
    const a = this.m[2] != null && this.m[5] === '&' ? '&' : this.m[5]
    const post = this.m.input.slice(this.m[0].length)
    return `${this.m[1]}${q}${this.m[2] ?? ''}${a}${post}`
  }

  static Class<Name extends string>(name: Name): QueryClass<Name> {
    const RE = QUERY_RE(name)
    const match = (id: string): Query<Name> | undefined => {
      const m = RE.exec(id)
      return m != null ? new Query(m as Match<Name>) : undefined
    }
    const add = (id: string, value?: Opt<string>): string =>
      prepend(match(id)?.remove() ?? id, name, value ?? '')
    return { match, add, test: RE.test.bind(RE) }
  }
}

export interface QueryClass<Name extends string> {
  readonly match: (id: string) => Query<Name> | undefined
  readonly add: (id: string, value?: Opt<string>) => string
  readonly test: (id: string) => boolean
}
