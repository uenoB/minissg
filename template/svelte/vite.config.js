import { defineConfig } from 'vite'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import ssg from 'vite-plugin-minissg'
import ssgSvelte from '@minissg/render-svelte'

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
    ssg({
      render: {
        '**/*.svelte': ssgSvelte()
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
