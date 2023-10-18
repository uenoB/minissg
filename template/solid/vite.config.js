import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import ssg from 'vite-plugin-minissg'
import ssgSolid from '@minissg/render-solid'

export default defineConfig({
  build: {
    rollupOptions: {
      input: [
        './src/index.html.jsx?hydrate&render',
        './src/browser.html.jsx?render'
      ]
    }
  },
  plugins: [
    ssg({
      render: {
        '**/*.jsx': ssgSolid()
      },
      plugins: () => [solid({ ssr: true })]
    })
  ]
})
