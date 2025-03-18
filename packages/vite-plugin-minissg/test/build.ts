import * as fs from 'node:fs'
import * as path from 'node:path'
import { tmpdir } from 'node:os'
import * as vite from 'vite'
import ssg from '../src/index'

const find = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(i => {
    const name = path.join(dir, i.name)
    return i.isDirectory() ? find(name) : [name]
  })

type Files = Record<string, string>

export const indent = (src: string): string => {
  const level = /^(?:\s(?!^))+(?=\S)/m.exec(src)?.[0] ?? ''
  const re = new RegExp(String.raw`^${level}|(?:\s(?!^))+$`, 'mg')
  return src.replace(re, '').trimStart()
}

export const indentFiles = (files: Files): Files => {
  const result: Files = {}
  for (const [name, content] of Object.entries(files)) {
    result[name] = indent(content)
  }
  return result
}

export const build = async (
  files: Files,
  configFn?: (dir: (fileName: string) => string) => vite.InlineConfig
): Promise<Files> => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'minissg-'))
  try {
    let firstInput
    for (const [fileName, content] of Object.entries(files)) {
      if (firstInput == null) firstInput = fileName
      fs.writeFileSync(path.join(dir, fileName), indent(content))
    }
    if (firstInput == null) return {}
    const input = firstInput
    configFn ??= dir => ({
      environments: {
        ssr: { build: { rollupOptions: { input: dir(input) } } }
      },
      plugins: [ssg()]
    })
    const dirFn = (fileName: string): string => path.join(dir, fileName)
    const logLevel: vite.LogLevel = 'silent'
    const config = { ...configFn(dirFn), root: dir, logLevel }
    await (await vite.createBuilder(config)).buildApp()
    const distDir = path.join(dir, 'dist')
    const dist: Files = {}
    for (const fileName of find(distDir).sort()) {
      const relPath = path.relative(distDir, fileName)
      dist[relPath] = fs.readFileSync(fileName, 'utf8')
    }
    return dist
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
}
