import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ssg from 'vite-plugin-minissg'
import ssgReact from 'vite-plugin-minissg/renderer/react'

export default defineConfig({
  build: {
    rollupOptions: {
      input: ['./src/index.html.jsx?render', './src/browser.html.jsx?render']
    }
  },
  plugins: [
    ssg({
      render: {
        '**/*.jsx': ssgReact()
      },
      plugins: () => [react()]
    })
  ]
})
