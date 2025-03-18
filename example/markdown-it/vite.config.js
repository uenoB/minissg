import { defineConfig } from 'vite'
import minissg from 'vite-plugin-minissg'

export default defineConfig({
  base: '/hoge/',
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: './index.html.jsx'
        }
      }
    },
    client: {
      build: {
        minify: true,
        reportCompressedSize: false
      }
    }
  },
  plugins: [minissg()]
})
