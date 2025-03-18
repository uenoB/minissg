import { defineConfig } from 'vite'
import minissg from 'vite-plugin-minissg'

export default defineConfig({
  base: '/hoge/',
  environments: {
    ssr: {},
    client: {
      build: {
        minify: true,
        reportCompressedSize: false
      }
    }
  },
  plugins: [
    minissg({
      input: './index.html.jsx'
    })
  ]
})
