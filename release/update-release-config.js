import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { init, parse } from 'es-module-lexer'
import { gitLsFiles } from './git.js'
import { packageList } from './package-list.js'

const getIncludes = async dir => {
  const set = new Set()
  const files = await gitLsFiles(dir)
  let fileName
  while ((fileName = files.shift())) {
    if (!fileName.endsWith('.ts')) continue
    if (fileName.endsWith('.test.ts')) continue
    const src = (await fs.readFile(fileName)).toString()
    await init
    for (const { n } of parse(src)[0]) {
      if (n == null) continue
      if (!n.startsWith('.')) continue
      let id = path.join(path.dirname(fileName), n)
      if (id.startsWith(dir)) continue
      if (!id.endsWith('.ts')) id += '.ts'
      set.add(id)
      files.push(id)
    }
  }
  return Array.from(set).sort((x, y) => x.localeCompare(y))
}

for (const { dir } of packageList) {
  const includes = await getIncludes(dir)
  const outFile = path.join(dir, 'release.json')
  const json = includes.length === 0 ? {} : { includes }
  await fs.writeFile(outFile, JSON.stringify(json, null, 2) + '\n')
}
