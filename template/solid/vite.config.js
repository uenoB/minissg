import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import minissg from 'vite-plugin-minissg'
import minissgSolid from '@minissg/render-solid'

export default defineConfig({
  plugins: [
    minissg({
      input: [
        './src/index.html.jsx?render&doctype',
        './src/browser.html.jsx?render&doctype'
      ],
      render: {
        '**/*.jsx': minissgSolid()
      },
      plugins: [solid({ ssr: true, extensions: ['.jsx'] })]
    })
  ]
})
