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
for (const { dirname, dir, packageJson, releaseJson } of packageList) {
  const options = { ...releaseJson, dir }
  const semanticReleaseOptions = {
    branches: [
      { name: 'latest' },
      { name: 'next', channel: 'next', prerelease: true }
    ],
    tagFormat: dirname + '-v<%= version %>',
    plugins: [
      monorepo(commitAnalyzer, options, 'commit-analyzer'),
      monorepo(
        notesGenerator,
        { dir, versionName: packageJson.name },
        'release-notes-generator'
      ),
      monorepo(npm, options, 'npm'),
      [
        monorepo(updateDependencies, options, 'update-dependencies'),
        { packageName: packageJson.name, packageJsonList: packageJsonList.all }
      ],
      [
        monorepo(git, { ...options, cwd: rootDir }, 'git'),
        {
          assets: [
            ...packageJsonList.example,
            ...packageJsonList.template,
            `${dir}/package.json`
          ],
          message: `chore(release): ${packageJson.name} <%=
                    nextRelease.version %> [skip ci]\n\n<%=
                    nextRelease.notes %>`
        }
      ],
      [
        monorepo(git, { ...options, cwd: rootDir }, 'git'),
        {
          assets: packageJsonList.packages,
          message: `fix: update ${packageJson.name} to version <%=
                    nextRelease.version %>\n\n[skip ci]`
        }
      ],
      [
        monorepo(github, options, 'github'),
        { successComment: false, failComment: false }
      ]
    ]
  }
  await semanticRelease(semanticReleaseOptions, { cwd: rootDir })
}
