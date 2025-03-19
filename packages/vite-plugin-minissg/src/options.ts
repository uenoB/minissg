import type { FilterPattern, PluginOption } from 'vite'
import { createFilter, normalizePath } from 'vite'
import { type Awaitable, type Null, isNotNull } from './util'

export interface HydrateArg {
  id: string // unique identifier of this component
  moduleId: string // JSON-stringified module name of the original file
  parameter: string // argument given to ?hydrate query
}

export interface Renderer {
  readonly render?: {
    readonly server?: (arg: { parameter: string }) => Awaitable<string>
    readonly client?: (arg: { parameter: string }) => Awaitable<string>
  }
  readonly hydrate?: {
    readonly server: (arg: HydrateArg) => Awaitable<string>
    readonly client: (arg: HydrateArg) => Awaitable<string>
  }
}

type MapItem<K extends string, X> = {
  readonly include?: FilterPattern | Null
  readonly exclude?: FilterPattern | Null
} & Partial<Readonly<Record<K, X | Null>>>
type Mappable<K extends string, X> = Record<string, X> | Iterable<MapItem<K, X>>

class FilterMap<K extends string, X extends object> {
  private readonly cases: ReadonlyArray<readonly [(s: string) => boolean, X]>

  constructor(key: K, cases: Mappable<K, X>) {
    const items =
      Symbol.iterator in cases
        ? Array.from(cases, i => [i.include, i[key], i.exclude] as const)
        : Object.entries(cases)
    this.cases = items
      .map(([include, value, exclude]) => {
        if (value == null) return null
        return [createFilter(include ?? null, exclude ?? null), value] as const
      })
      .filter(isNotNull)
  }

  match(id: string): { key: number; value: X } | undefined {
    id = id.replace(/[?#].*/s, '')
    const i = this.cases.findIndex(i => i[0](id))
    const hit = this.cases[i]
    return hit != null ? { key: i, value: hit[1] } : undefined
  }

  get(key: number): X | undefined {
    return this.cases[key]?.[1]
  }
}

type Input = string | string[] | Record<string, string>

export interface Options {
  readonly render?: Mappable<'renderer', Readonly<Renderer>> | Null
  readonly clean?: boolean | Null
  readonly input?: Input | Null
  readonly plugins?: PluginOption
}

export interface ResolvedOptions {
  readonly render: FilterMap<'renderer', Readonly<Renderer>>
  readonly clean: boolean
  readonly input: Iterable<readonly [string, string]>
  readonly plugins: PluginOption
}

const resolveInput = (input: Input): Array<readonly [string, string]> => {
  if (typeof input === 'string') input = [input]
  const fallbackName = (s: string): string =>
    s.replace(/^.*\/|(?:\.[^./?#]*)?(?:[?#].*)?$/gs, '')
  return Array.isArray(input)
    ? input.map(i => [fallbackName(normalizePath(i)), i] as const)
    : Object.entries(input)
}

export const resolveOptions = (options: Options | Null): ResolvedOptions => {
  const render = new FilterMap('renderer', options?.render ?? [])
  const clean = options?.clean ?? true
  const input = options?.input != null ? resolveInput(options.input) : []
  const plugins = options?.plugins ?? []
  return { render, clean, input, plugins }
}
