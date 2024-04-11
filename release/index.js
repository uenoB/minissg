import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import * as YAML from 'yaml'
import semanticRelease from 'semantic-release'
import * as commitAnalyzer from '@semantic-release/commit-analyzer'
import * as notesGenerator from '@semantic-release/release-notes-generator'
import * as npm from '@semantic-release/npm'
import * as git from '@semantic-release/git'
import * as github from '@semantic-release/github'
import * as updateDependencies from './update-dependencies.js'
import { gitLsFiles } from './git.js'
import { hookPlugin } from './monorepo.js'

const rootDir = url.fileURLToPath(new URL('..', import.meta.url))
process.chdir(rootDir)

const packageJsonGlobList = YAML.parse(
  fs.readFileSync('pnpm-workspace.yaml').toString('utf8')
).packages.map(i => path.join(i, 'package.json'))

const packageJsonList = gitLsFiles(packageJsonGlobList).map(i =>
  path.join(rootDir, i)
)

const floatUp = (x, a) => a.filter(i => i === x).concat(a.filter(i => i !== x))

const packages = fs.readdirSync('packages')

// iterate for each directory under packages.
// vite-plugin-minissg must be first because other packages depend on it.
for (const name of floatUp('vite-plugin-minissg', packages)) {
  const options = { dir: path.join('packages', name, '/'), name }
  await semanticRelease(
    {
      branches: [
        { name: 'latest' },
        { name: 'next', channel: 'next', prerelease: true }
      ],
      tagFormat: name + '-v<%= version %>',
      plugins: [
        hookPlugin(commitAnalyzer, options),
        hookPlugin(notesGenerator, options),
        hookPlugin(npm, options),
        [hookPlugin(updateDependencies, options), { packageJsonList }],
        [
          hookPlugin(git, { ...options, chdir: false }),
          {
            assets: packageJsonList,
            message: `chore(release): ${name} <%=
                      nextRelease.version %> [skip ci]\n\n<%=
                      nextRelease.notes %>`
          }
        ],
        hookPlugin(github, options)
      ]
    },
    { cwd: rootDir }
  )
}
