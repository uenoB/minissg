import * as path from 'node:path'
import { gitDiffTree } from './git.js'

// interface Options {
//   dir: string
//   name: string
//   chdir?: boolean
// }

const manipulateContext = (context, options) => {
  // context.commits holds the list of commits taken into account.
  if (context.commits != null) {
    // filter out commits unrelated to this package
    const commits = context.commits.filter(commit =>
      gitDiffTree(commit.hash).some(path => path.startsWith(options.dir + '/'))
    )
    context = { ...context, commits }
  }

  // context.nextRelease.version is a part of commit message.
  if (context.nextRelease?.version != null) {
    // insert package name into version number
    const version = `${options.name} ${context.nextRelease.version}`
    context = { ...context, nextRelease: { ...context.nextRelease, version } }
  }

  // override cwd if needed.
  if (options?.chdir !== false) {
    context = { ...context, cwd: path.join(context.cwd, options.dir) }
  }

  return context
}

const hookLifecycleMethod = (origMethod, options) =>
  // lifecycle method has two arguments, pluginConfig and context.
  function (pluginConfig, context) {
    // manipulate context for each package.
    const newContext = manipulateContext(context, options)
    return Reflect.apply(origMethod, this, [pluginConfig, newContext])
  }

export const hookPlugin = (plugin, options) =>
  Object.fromEntries(
    Object.entries(plugin).map(([key, value]) =>
      // hook all the lifecycle methods
      typeof value === 'function'
        ? [key, hookLifecycleMethod(value, options)]
        : [key, value]
    )
  )