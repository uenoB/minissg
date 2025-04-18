import type { PluginOption } from 'vite'
import { type Options, resolveOptions } from './options'
import { type ServerResult, loaderPlugin } from './loader'
import { buildPlugin } from './build'
import { serverPlugin } from './server'
export type { Options } from './options'
export type { Renderer } from './renderer'
export type { Content, Module, ModuleName, Context, Main } from './module'
export type { Awaitable, Json } from './util'

export default function (userOptions?: Options): PluginOption {
  const options = resolveOptions(userOptions)
  const server: ServerResult = {}
  const loader = loaderPlugin(options, server)
  const build = buildPlugin(options, server)
  return [loader.pre, serverPlugin(), options.plugins, build, loader.post]
}
