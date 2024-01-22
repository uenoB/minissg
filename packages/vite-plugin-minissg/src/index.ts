import type { PluginOption } from 'vite'
import { type Options, resolveOptions } from './options'
import { loaderPlugin } from './loader'
import { buildPlugin } from './build'
import { serverPlugin } from './server'
export type { Options, Renderer } from './options'
export type { Content, Module, ModuleName, Context, Entries } from './module'
export type { Awaitable } from './util'

export default function (userOptions?: Options | undefined): PluginOption {
  const options = resolveOptions(userOptions)
  return [
    loaderPlugin(options),
    buildPlugin(options),
    serverPlugin(options),
    options.plugins()
  ]
}
