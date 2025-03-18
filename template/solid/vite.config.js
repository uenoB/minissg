import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import minissg from 'vite-plugin-minissg'
import minissgSolid from '@minissg/render-solid'

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
        '**/*.jsx': minissgSolid()
      },
      plugins: () => [solid({ ssr: true, extensions: ['.jsx'] })]
    })
  ]
})
