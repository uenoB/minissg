import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: [
            './src/index.html.jsx?render&doctype',
            './src/browser.html.jsx?render&doctype'
          ]
        }
      }
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.jsx': minissgPreact()
      },
      plugins: [preact()]
    })
  ]
})
