import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import minissg from 'vite-plugin-minissg'
import minissgSolid from '@minissg/render-solid'

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
    minissg({
      render: {
        '**/*.jsx': minissgSolid()
      },
      plugins: () => [solid({ ssr: true, extensions: ['.jsx'] })]
    })
  ]
})
