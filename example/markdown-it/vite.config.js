import { defineConfig } from 'vite'
import ssg from 'vite-plugin-minissg'

export default defineConfig({
  base: '/hoge/',
  build: {
    rollupOptions: {
      input: './index.html.jsx'
    }
  },
  plugins: [
    ssg({
      config: {
        build: {
          minify: true,
          reportCompressedSize: false
        }
      }
    })
  ]
})
