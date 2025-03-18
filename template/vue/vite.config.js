import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import minissg from 'vite-plugin-minissg'
import minissgVue from '@minissg/render-vue'

export default defineConfig({
  plugins: [
    minissg({
      input: {
        'index.html': './src/index-html.vue?render&doctype',
        'browser.html': './src/browser-html.vue?render&doctype'
      },
      render: {
        '**/*.vue': minissgVue()
      },
      plugins: [vue()]
    })
  ],
  optimizeDeps: {
    include: ['vue']
  }
})
