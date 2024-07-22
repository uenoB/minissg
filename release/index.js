import * as url from 'node:url'
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

const packageJsonList = {
  packages: gitLsFiles('packages/*/package.json'),
  example: gitLsFiles('example/*/package.json'),
  template: gitLsFiles('template/*/package.json')
}
packageJsonList.all = Object.values(packageJsonList).flat()

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
      [
        hookPlugin(updateDependencies, pkg),
        { ...pkg, packageJsonList: packageJsonList.all }
      ],
      [
        hookPlugin(git, { ...pkg, cwd: rootDir, name: null }),
        {
          assets: [
            ...packageJsonList.example,
            ...packageJsonList.template,
            `packages/${pkg.name}/package.json`
          ],
          message: `chore(release): ${pkg.name} <%=
                    nextRelease.version %> [skip ci]\n\n<%=
                    nextRelease.notes %>`
        }
      ],
      [
        hookPlugin(git, { ...pkg, cwd: rootDir, name: null }),
        {
          assets: packageJsonList.packages,
          message: `fix: update ${pkg.name} to version <%=
                    nextRelease.version %>\n\n[skip ci]`
        }
      ],
      hookPlugin(github, pkg)
    ]
  }
  await semanticRelease(options, { cwd: rootDir })
}
