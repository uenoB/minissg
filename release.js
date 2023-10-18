import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as YAML from 'yaml'

import semanticRelease from 'semantic-release'
import * as commitAnalyzer from '@semantic-release/commit-analyzer'
import * as notesGenerator from '@semantic-release/release-notes-generator'
import * as npm from '@semantic-release/npm'
import * as git from '@semantic-release/git'
import * as github from '@semantic-release/github'

const root = fileURLToPath(new URL('.', import.meta.url))

const gitLsFiles = files => {
  const r = spawnSync('git', ['ls-files', '-z', ...files])
  if (r.error != null) throw r.error
  const lines = r.stdout.toString('utf8')
  return lines.split('\0').filter(i => i !== '')
}

const gitDiffTreeCache = new Map()
const gitDiffTree = hash => {
  const cached = gitDiffTreeCache.get(hash)
  if (cached != null) return cached
  const r = spawnSync('git', [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '-r',
    hash
  ])
  if (r.error != null) throw r.error
  const lines = r.stdout.toString('utf8')
  const paths = lines.split('\n').filter(i => i !== '')
  gitDiffTreeCache.set(hash, paths)
  return paths
}

// implemented our own semantic-release-monorepo
const wrapContext = (context, prefix, options) => {
  if (context.commits != null) {
    const commits = context.commits.filter(commit =>
      gitDiffTree(commit.hash).some(path => path.startsWith(prefix))
    )
    context = { ...context, commits }
  }
  if (options?.name != null && context.nextRelease?.version != null) {
    const version = `${options.name} ${context.nextRelease.version}`
    const nextRelease = { ...context.nextRelease, version }
    context = { ...context, nextRelease }
  }
  if (options?.cwd != null) {
    context = { ...context, cwd: options.cwd }
  }
  return context
}

const packageJsonGlobs = YAML.parse(
  readFileSync('pnpm-workspace.yaml').toString('utf8')
).packages.map(i => join(i, 'package.json'))
const packageJsons = gitLsFiles(packageJsonGlobs)

const readJson = fileName => JSON.parse(readFileSync(fileName))

const updatePackageJsons = {
  prepare(_config, { cwd, nextRelease }) {
    const packageName = readJson(resolve(cwd, 'package.json')).name
    packageJsons.forEach(path => {
      const fileName = resolve(root, path)
      const json = readJson(fileName)
      for (const [key, value] of Object.entries(json)) {
        if (!/^(?:d|devD|peerD)?ependencies$/.test(key)) continue
        for (const dep of Object.keys(value)) {
          if (dep !== packageName || !value[dep].startsWith('^')) continue
          if (key === 'peerDependencies') {
            if (nextRelease.type !== 'major') continue
            value[dep] = `${value[dep]} || ^${nextRelease.version}`
          } else {
            value[dep] = `^${nextRelease.version}`
          }
        }
      }
      writeFileSync(fileName, JSON.stringify(json, null, 2).concat('\n'))
    })
  }
}

const precede = (a, x) => [x].concat(a.filter(i => i !== x))
const packages = precede(readdirSync('packages'), 'vite-plugin-minissg')

for (const name of packages) {
  const dir = join('packages', name, '/')

  const wrap = (plugin, ...args) =>
    Object.fromEntries(
      Object.entries(plugin).map(([k, v]) => {
        return [k, (x, context) => v(x, wrapContext(context, dir, ...args))]
      })
    )

  const message = `chore(release): ${name} <%=
    nextRelease.version %> [skip ci]\n\n<%=
    nextRelease.notes %>`

  const options = {
    branches: ['latest'],
    tagFormat: name + '-v<%= version %>',
    plugins: [
      wrap(commitAnalyzer),
      wrap(notesGenerator, { name }),
      wrap(npm),
      wrap(updatePackageJsons),
      [wrap(git, { cwd: root }), { assets: packageJsons, message }],
      wrap(github, { name })
    ]
  }
  const config = { cwd: join(root, dir) }
  await semanticRelease(options, config)
}
