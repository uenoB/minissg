import * as childProcess from 'node:child_process'

export const gitLsFiles = (...files) => {
  const r = childProcess.spawnSync('git', ['ls-files', '-z', ...files])
  if (r.error != null) throw r.error
  const stdout = r.stdout.toString('utf8')
  return stdout.split('\0').filter(i => i !== '')
}

const diffTreeCache = new Map()

export const gitDiffTree = hash => {
  const cached = diffTreeCache.get(hash)
  if (cached != null) return cached
  const r = childProcess.spawnSync('git', [
    'diff-tree',
    '--root',
    '--no-commit-id',
    '--name-only',
    '-r',
    hash
  ])
  if (r.error != null) throw r.error
  const stdout = r.stdout.toString('utf8')
  const paths = stdout.split('\n').filter(i => i !== '')
  diffTreeCache.set(hash, paths)
  return paths
}
