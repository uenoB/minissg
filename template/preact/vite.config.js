import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import ssg from 'vite-plugin-minissg'
import ssgPreact from 'vite-plugin-minissg/renderer/preact'

export default defineConfig({
  build: {
    rollupOptions: {
      input: ['./src/index.html.jsx?render', './src/browser.html.jsx?render']
    }
  },
  plugins: [
    ssg({
      render: {
        '**/*.jsx': ssgPreact()
      },
      plugins: () => [preact()]
    })
  ]
})
