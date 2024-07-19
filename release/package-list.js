import * as fs from 'node:fs'

const baseURL = new URL('..', import.meta.url)
const packagesDirURL = new URL('packages/', baseURL)

const packages = fs.readdirSync(packagesDirURL).map(name => {
  const url = new URL(`${name}/`, packagesDirURL)
  const dir = url.href.slice(baseURL.href.length).replace(/\/+$/, '')
  const json = JSON.parse(fs.readFileSync(new URL('package.json', url)))
  return { name, dir, json }
})

const dependencies = ({ json }) => {
  const result = new Set()
  for (const [key, value] of Object.entries(json)) {
    if (!/^(?:d|devD|peerD)?endencies$/.test(key)) continue
    for (const dep of Object.keys(value)) result.add(dep)
  }
  return result
}

packages.sort((pkg1, pkg2) => {
  const dep1 = dependencies(pkg1)
  const dep2 = dependencies(pkg2)
  const name1 = pkg1.json.name
  const name2 = pkg2.json.name
  if (dep1.has(name2)) return 1
  if (dep2.has(name1)) return -1
  if (name1.startsWith('@') && !name2.startsWith('@')) return 1
  if (name2.startsWith('@') && !name1.startsWith('@')) return -1
  return name1.localeCompare(name2, 'en')
})

export { packages }
