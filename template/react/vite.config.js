import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import minissg from 'vite-plugin-minissg'
import minissgReact from '@minissg/render-react'

export default defineConfig({
  plugins: [
    minissg({
      input: [
        './src/index.html.jsx?render&doctype',
        './src/browser.html.jsx?render&doctype'
      ],
      render: {
        '**/*.jsx': minissgReact()
      },
      plugins: [react()]
    })
  ]
})
