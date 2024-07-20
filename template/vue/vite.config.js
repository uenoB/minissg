import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import minissg from 'vite-plugin-minissg'
import minissgVue from '@minissg/render-vue'

export default defineConfig({
  build: {
    minify: true,
    rollupOptions: {
      input: {
        'index.html': './src/index-html.vue?render',
        'browser.html': './src/browser-html.vue?render'
      }
    }
  },
  optimizeDeps: {
    include: ['vue']
  },
  plugins: [
    minissg({
      render: {
        '**/*.vue': minissgVue()
      },
      plugins: () => [vue()]
    })
  ]
})
