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
import { packages } from './package-list.js'

const rootDir = url.fileURLToPath(new URL('..', import.meta.url))
process.chdir(rootDir)

const packageJsonGlobList = YAML.parse(
  fs.readFileSync('pnpm-workspace.yaml').toString('utf8')
).packages.map(i => path.join(i, 'package.json'))

const packageJsonList = gitLsFiles(packageJsonGlobList)

// iterate for each directory under packages.
for (const pkg of packages) {
  const options = {
    branches: [
      { name: 'latest' },
      { name: 'next', channel: 'next', prerelease: true }
    ],
    tagFormat: pkg.name + '-v<%= version %>',
    plugins: [
      hookPlugin(commitAnalyzer, pkg),
      hookPlugin(notesGenerator, pkg),
      hookPlugin(npm, { ...pkg, name: null }),
      [hookPlugin(updateDependencies, pkg), { ...pkg, packageJsonList }],
      [
        hookPlugin(git, { ...pkg, cwd: rootDir, name: null }),
        {
          assets: packageJsonList,
          message: `chore(release): ${pkg.name} <%=
                    nextRelease.version %> [skip ci]\n\n<%=
                    nextRelease.notes %>`
        }
      ],
      hookPlugin(github, pkg)
    ]
  }
  await semanticRelease(options, { cwd: rootDir })
}
