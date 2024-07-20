import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  build: {
    rollupOptions: {
      input: ['./src/index.html.jsx?render', './src/browser.html.jsx?render']
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.jsx': minissgPreact()
      },
      plugins: () => [preact()]
    })
  ]
})
