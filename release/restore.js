import * as url from 'node:url'
import * as fs from 'node:fs'
import { gitLsFiles } from './git.js'

const rootDir = url.fileURLToPath(new URL('..', import.meta.url))
process.chdir(rootDir)

const packages = gitLsFiles('packages/*/package.json')
const targets = [
  packages,
  gitLsFiles('example/*/package.json'),
  gitLsFiles('template/*/package.json')
].flat()

const pkgs = new Map()

for (const fileName of packages) {
  const json = JSON.parse(fs.readFileSync(fileName))
  pkgs.set(json.name, json.version)
}

for (const fileName of targets) {
  const json = JSON.parse(fs.readFileSync(fileName))
  let update = false
  for (const [key, value] of Object.entries(json)) {
    if (/^(d|devD)ependencies$/.test(key)) {
      for (const [pkgName, version] of Object.entries(value)) {
        const pkgVersion = pkgs.get(pkgName)
        if (pkgVersion != null) {
          const newVersion = `^${pkgVersion}`
          if (version !== newVersion) {
            value[pkgName] = newVersion
            update = true
          }
        }
      }
    }
  }
  if (update) fs.writeFileSync(fileName, JSON.stringify(json, null, 2) + '\n')
}
