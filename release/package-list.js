import * as fs from 'node:fs'

const baseURL = new URL('..', import.meta.url)
const packagesDirURL = new URL('packages/', baseURL)

const packageList = fs.readdirSync(packagesDirURL).map(dirname => {
  const url = new URL(`${dirname}/`, packagesDirURL)
  const dir = url.href.slice(baseURL.href.length).replace(/\/+$/, '')
  const json = JSON.parse(fs.readFileSync(new URL('package.json', url)))
  return { dirname, dir, json }
})

const dependencies = ({ json }) => {
  const result = new Set()
  for (const [key, value] of Object.entries(json)) {
    if (/^(?:d|devD|peerD)?ependencies$/.test(key)) {
      for (const dep of Object.keys(value)) result.add(dep)
    }
  }
  return result
}

packageList.sort((pkg1, pkg2) => {
  const dep1 = dependencies(pkg1)
  const dep2 = dependencies(pkg2)
  if (dep1.has(pkg1.json.name)) return 1
  if (dep2.has(pkg2.json.name)) return -1
  const toKey = name => name.replace(/^(?!@)/, ' ')
  return toKey(pkg1.json.name).localeCompare(toKey(pkg2.json.name), 'en')
})

export { packageList }
