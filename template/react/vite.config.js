import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import minissg from 'vite-plugin-minissg'
import minissgReact from '@minissg/render-react'

export default defineConfig({
  build: {
    rollupOptions: {
      input: ['./src/index.html.jsx?render', './src/browser.html.jsx?render']
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.jsx': minissgReact()
      },
      plugins: () => [react()]
    })
  ]
})
