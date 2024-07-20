import * as url from 'node:url'
import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

const rootDir = url.fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    alias: [
      {
        find: /^@minissg\/([^/]+)$/,
        replacement: path.join(rootDir, 'packages', '$1', 'src')
      }
    ]
  }
})
