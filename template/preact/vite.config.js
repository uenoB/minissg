import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  plugins: [
    minissg({
      input: [
        './src/index.html.jsx?render&doctype',
        './src/browser.html.jsx?render&doctype'
      ],
      render: {
        '**/*.jsx': minissgPreact()
      },
      plugins: [preact()]
    })
  ]
})
