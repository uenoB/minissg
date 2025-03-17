import type { PluginOption } from 'vite'
import { type Options, resolveOptions } from './options'
import { loaderPlugin } from './loader'
import { buildPlugin } from './build'
import { serverPlugin } from './server'
export type { Options, Renderer } from './options'
export type { Content, Module, ModuleName, Context, Main } from './module'
export type { Awaitable, Json } from './util'

export default function (userOptions?: Options): PluginOption {
  const options = resolveOptions(userOptions)
  const loader = loaderPlugin(options)
  return [
    loader.pre,
    buildPlugin(options),
    serverPlugin(),
    options.plugins(),
    loader.post
  ]
}
