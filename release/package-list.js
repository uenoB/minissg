import * as fs from 'node:fs'

const baseURL = new URL('..', import.meta.url)
const packagesDirURL = new URL('packages/', baseURL)

const packageList = fs.readdirSync(packagesDirURL).map(dirname => {
  const url = new URL(`${dirname}/`, packagesDirURL)
  const dir = url.href.slice(baseURL.href.length).replace(/\/+$/, '')
  const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', url)))
  const releaseJson = JSON.parse(fs.readFileSync(new URL('release.json', url)))
  return { dirname, dir, packageJson, releaseJson }
})

const dependencies = ({ packageJson }) => {
  const result = new Set()
  for (const [key, value] of Object.entries(packageJson)) {
    if (/^(?:d|devD|peerD)?ependencies$/.test(key)) {
      for (const dep of Object.keys(value)) result.add(dep)
    }
  }
  return result
}

packageList.sort((pkg1, pkg2) => {
  const dep1 = dependencies(pkg1)
  const dep2 = dependencies(pkg2)
  const name1 = pkg1.packageJson.name
  const name2 = pkg2.packageJson.name
  if (dep1.has(name1)) return 1
  if (dep2.has(name2)) return -1
  const toKey = name => name.replace(/^(?!@)/, ' ')
  return toKey(name1).localeCompare(toKey(name2), 'en')
})

export { packageList }
