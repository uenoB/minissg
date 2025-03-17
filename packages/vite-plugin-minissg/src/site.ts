import { createHmac } from 'node:crypto'
import { type Environment, normalizePath, isCSSRequest } from 'vite'
import debug, { type Debugger } from 'debug'
import { Query } from './query'

const hasUrlQuery = Query.Class('url').test
const hasInlineQuery = Query.Class('inline').test
const hasRawQuery = Query.Class('raw').test

const createDebug = (namespace: string): Debugger | undefined => {
  const d = debug(namespace)
  return d.enabled ? d : undefined
}

export class Site<Env extends Environment = Environment> {
  readonly env: Env
  readonly projectRoot: string
  readonly debug = {
    module: createDebug('minissg:module'),
    loader: createDebug('minissg:loader'),
    build: createDebug('minissg:build'),
    server: createDebug('minissg:server')
  }

  constructor(env: Env) {
    this.env = env
    this.projectRoot = normalizePath(this.env.config.root).replace(/\/*$/, '/')
  }

  isAsset(moduleId: string): boolean {
    if (hasRawQuery(moduleId)) return false // Vite makes ?raw precede ?url
    if (isCSSRequest(moduleId) && !hasInlineQuery(moduleId)) return true
    if (hasUrlQuery(moduleId) || moduleId.endsWith('.html')) return true
    return this.env.config.assetsInclude(moduleId.replace(/[?#].*$/s, ''))
  }

  canonical(moduleId: string): string {
    if (moduleId.startsWith(this.projectRoot)) {
      moduleId = moduleId.slice(this.projectRoot.length)
    }
    return moduleId.replace(/[?#].*$/s, '')
  }

  scriptId(moduleId: string): string {
    moduleId = this.canonical(moduleId)
    const hmac = createHmac('sha256', '--MINISSG--').update(moduleId)
    return hmac.digest('base64url').slice(0, 8)
  }

  rollupInput(): Map<string, string> {
    let input = this.env.config.build.rollupOptions.input
    if (input == null) return new Map<string, string>()
    if (typeof input === 'string') input = [input]
    const fallbackName = (s: string): string =>
      s.replace(/^.*\/|(?:\.[^./?#]*)?(?:[?#].*)?$/gs, '')
    const entries = Array.isArray(input)
      ? input.map(i => [fallbackName(normalizePath(i)), i] as const)
      : Object.entries(input)
    return new Map(entries)
  }
}
