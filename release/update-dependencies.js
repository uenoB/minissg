import * as fs from 'node:fs'

const readJson = fileName => JSON.parse(fs.readFileSync(fileName))

export const prepare = (pluginConfig, { nextRelease }) => {
  // nothing to do if this is a prerelease.
  if (nextRelease.channel != null) return
  if (nextRelease.type.startsWith('pre')) return
  if ((nextRelease.type === 'major') !== (pluginConfig.major === true)) return

  const packageJsonList = pluginConfig.packageJsonList
  const packageName = pluginConfig.json.name
  if (packageJsonList == null || packageName == null) return

  const version = nextRelease.version.replace(/^.* /, '')

  packageJsonList.forEach(fileName => {
    const json = readJson(fileName)
    let modified = false
    for (const [key, value] of Object.entries(json)) {
      if (!/^(?:d|devD|peerD)?ependencies$/.test(key)) continue
      for (const [dep, orig] of Object.entries(value)) {
        if (dep !== packageName || !orig.startsWith('^')) continue
        if (key === 'peerDependencies') {
          if (nextRelease.type !== 'major') continue
          value[dep] = `${orig} || ^${version.replace(/[^0-9].*$/, '')}`
        } else {
          value[dep] = `^${version}`
        }
        modified = true
      }
    }
    if (modified) {
      fs.writeFileSync(fileName, JSON.stringify(json, null, 2).concat('\n'))
    }
  })
}
