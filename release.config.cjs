module.exports = {
  branches: ['latest'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        publishCmd: (() => {
          const file = 'package.json'
          return `(rm ${file} && jq 'del(.scripts,.pnpm)' > ${file}) < ${file}`
        })()
      }
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/exec',
      {
        prepareCmd: (() => {
          const from = String.raw`\(^ *"vite-plugin-minissg": *\)"[^"]*"`
          const to = '\\1"^${nextRelease.version}"'
          const files = 'example/*/package.json template/*/package.json'
          return `sed -i~ 's/${from}/${to}/' ${files}`
        })()
      }
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'package.json',
          'example/*/package.json',
          'template/*/package.json'
        ]
      }
    ],
    '@semantic-release/github'
  ]
}
