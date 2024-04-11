import * as path from 'node:path'
import * as fs from 'node:fs'

const readJson = fileName => JSON.parse(fs.readFileSync(fileName))

export const prepare = (pluginConfig, { cwd, nextRelease }) => {
  // nothing to do if this is a prerelease.
  if (nextRelease.tpe.startsWith('pre')) return

  const packageJsonList = pluginConfig.packageJsonList ?? []
  const packageName = readJson(path.join(cwd, 'package.json')).name

  packageJsonList.forEach(fileName => {
    const json = readJson(fileName)
    let modified = false
    for (const [key, value] of Object.entries(json)) {
      if (!/^(?:d|devD|peerD)?ependencies$/.test(key)) continue
      for (const [dep, ver] of Object.entries(value)) {
        if (dep !== packageName || !ver.startsWith('^')) continue
        if (key === 'peerDependencies') {
          if (nextRelease.type !== 'major') continue
          value[dep] = `${ver} || ^${nextRelease.version}`
        } else {
          value[dep] = `^${nextRelease.version}`
        }
        modified = true
      }
    }
    if (modified) {
      fs.writeFileSync(fileName, JSON.stringify(json, null, 2).concat('\n'))
    }
  })
}
