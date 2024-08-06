import * as url from 'node:url'
import semanticRelease from 'semantic-release'
import * as commitAnalyzer from '@semantic-release/commit-analyzer'
import * as notesGenerator from '@semantic-release/release-notes-generator'
import * as npm from '@semantic-release/npm'
import * as git from '@semantic-release/git'
import * as github from '@semantic-release/github'
import * as updateDependencies from './update-dependencies.js'
import { gitLsFiles } from './git.js'
import { monorepo } from './monorepo.js'
import { packageList } from './package-list.js'

const rootDir = url.fileURLToPath(new URL('..', import.meta.url))
process.chdir(rootDir)

const packageJsonList = {
  packages: gitLsFiles('packages/*/package.json'),
  example: gitLsFiles('example/*/package.json'),
  template: gitLsFiles('template/*/package.json')
}
packageJsonList.all = Object.values(packageJsonList).flat()

// iterate for each directory under packages.
for (const { dirname, dir, json } of packageList) {
  const options = {
    branches: [
      { name: 'latest' },
      { name: 'next', channel: 'next', prerelease: true }
    ],
    tagFormat: dirname + '-v<%= version %>',
    plugins: [
      monorepo(commitAnalyzer, { dir }, 'commit-analyzer'),
      monorepo(
        notesGenerator,
        { dir, versionName: json.name },
        'release-notes-generator'
      ),
      monorepo(npm, { dir }, 'npm'),
      [
        monorepo(updateDependencies, { dir }, 'update-dependencies'),
        { packageName: json.name, packageJsonList: packageJsonList.all }
      ],
      [
        monorepo(git, { dir, cwd: rootDir }, 'git'),
        {
          assets: [
            ...packageJsonList.example,
            ...packageJsonList.template,
            `${dir}/package.json`
          ],
          message: `chore(release): ${json.name} <%=
                    nextRelease.version %> [skip ci]\n\n<%=
                    nextRelease.notes %>`
        }
      ],
      [
        monorepo(git, { dir, cwd: rootDir }, 'git'),
        {
          assets: packageJsonList.packages,
          message: `fix: update ${json.name} to version <%=
                    nextRelease.version %>\n\n[skip ci]`
        }
      ],
      [
        monorepo(github, { dir }, 'github'),
        { successComment: false, failComment: false }
      ]
    ]
  }
  await semanticRelease(options, { cwd: rootDir })
}
