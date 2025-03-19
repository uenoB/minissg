import type { Awaitable } from './util'

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
