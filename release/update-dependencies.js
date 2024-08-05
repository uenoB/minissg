import * as fs from 'node:fs'

export const prepare = (pluginConfig, { nextRelease }) => {
  // nothing to do if this is a prerelease.
  if (nextRelease.channel != null) return
  if (nextRelease.type.startsWith('pre')) return

  // packageJsonList and packageName must be given.
  const packageJsonList = pluginConfig.packageJsonList
  const packageName = pluginConfig.packageName
  if (packageJsonList == null || packageName == null) return

  packageJsonList.forEach(fileName => {
    const json = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8' }))
    let modified = false
    for (const [key, value] of Object.entries(json)) {
      if (/^(?:d|devD|peerD)?ependencies$/.test(key)) {
        for (const [dep, versions] of Object.entries(value)) {
          if (dep === packageName && versions.startsWith('^')) {
            if (key === 'peerDependencies') {
              if (nextRelease.type === 'major') {
                const major = nextRelease.version.replace(/[^0-9].*$/, '')
                value[dep] = `${versions} || ^${major}`
              }
            } else {
              value[dep] = `^${nextRelease.version}`
            }
            modified = true
          }
        }
      }
    }
    if (modified) {
      fs.writeFileSync(fileName, JSON.stringify(json, null, 2).concat('\n'))
    }
  })
}
