import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import minissg from 'vite-plugin-minissg'
import minissgSvelte from '@minissg/render-svelte'

export default defineConfig({
  build: {
    rollupOptions: {
      input: [
        './src/index.html.svelte?render',
        './src/browser.html.svelte?render'
      ]
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.svelte': minissgSvelte()
      },
      plugins: () => [
        svelte({
          configFile: false,
          preprocess: vitePreprocess(),
          compilerOptions: { hydratable: true }
        })
      ]
    })
  ]
})
