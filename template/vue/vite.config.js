import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ssg from 'vite-plugin-minissg'
import ssgVue from 'vite-plugin-minissg/renderer/vue'

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
    ssg({
      render: {
        '**/*.vue': ssgVue()
      },
      plugins: () => [vue()]
    })
  ]
})
