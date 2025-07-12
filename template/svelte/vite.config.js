import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import minissg from 'vite-plugin-minissg'
import minissgSvelte from '@minissg/render-svelte'

export default defineConfig({
  plugins: [
    minissg({
      input: [
        './src/index.html.svelte?render&doctype',
        './src/browser.html.svelte?render&doctype'
      ],
      render: {
        '**/*.svelte': minissgSvelte()
      },
      plugins: [svelte()]
    })
  ]
})
