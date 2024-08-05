import * as path from 'node:path'
import picomatch from 'picomatch'
import { gitDiffTree } from './git.js'

const manipulateContext = (context, { dir, includes, versionName, cwd }) => {
  // context.commits holds the list of commits taken into account.
  if (dir != null && context.commits != null) {
    // filter out commits unrelated to this package
    const match = picomatch([`${dir}/**/*`, ...(includes ?? [])])
    const commits = context.commits.filter(commit =>
      gitDiffTree(commit.hash).some(match)
    )
    context = { ...context, commits }
  }

  // context.nextRelease.version is a part of commit message.
  if (versionName != null && context.nextRelease?.version != null) {
    // insert package name into version number
    const version = `${versionName} ${context.nextRelease.version}`
    context = { ...context, nextRelease: { ...context.nextRelease, version } }
  }

  // override cwd if needed.
  if (dir != null || cwd != null) {
    context = { ...context, cwd: cwd ?? path.join(context.cwd, dir) }
  }

  return context
}

const hookLifecycleMethod = (origMethod, options, pluginName) => {
  // lifecycle method has two arguments, pluginConfig and context.
  const hooked = function (pluginConfig, context) {
    // manipulate context for each package.
    const newContext = manipulateContext(context, options)
    return Reflect.apply(origMethod, this, [pluginConfig, newContext])
  }
  // set pluginName if given.
  if (pluginName != null && pluginName !== '') {
    const config = Object.create(null)
    config.value = pluginName
    if (options.dir != null) config.value += `:${options.dir}`
    config.enumerable = true
    Reflect.defineProperty(hooked, 'pluginName', config)
  }
  return hooked
}

export const monorepo = (plugin, options, pluginName) =>
  Object.fromEntries(
    Object.entries(plugin).map(([key, value]) =>
      // hook all the lifecycle methods
      typeof value === 'function'
        ? [key, hookLifecycleMethod(value, options, pluginName)]
        : [key, value]
    )
  )
