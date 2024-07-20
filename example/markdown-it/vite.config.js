import { defineConfig } from 'vite'
import minissg from 'vite-plugin-minissg'

export default defineConfig({
  base: '/hoge/',
  build: {
    rollupOptions: {
      input: './index.html.jsx'
    }
  },
  plugins: [
    minissg({
      config: {
        build: {
          minify: true,
          reportCompressedSize: false
        }
      }
    })
  ]
})
