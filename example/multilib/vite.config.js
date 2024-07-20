import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import vue from '@vitejs/plugin-vue'
import ssg from 'vite-plugin-minissg'
import ssgPreact from '@minissg/render-preact'
import ssgReact from '@minissg/render-react'
import ssgSolid from '@minissg/render-solid'
import ssgSvelte from '@minissg/render-svelte'
import ssgVue from '@minissg/render-vue'

const preactPlugin = () => {
  const include = /\/preact\/.*\.jsx(?:\?|$)/
  return [
    {
      enforce: 'pre',
      name: 'preact-import-source',
      transform(code, id) {
        if (include.test(id)) return '// @jsxImportSource preact\n' + code
      }
    },
    preact({ include: [include] }),
    {
      name: 'manipulate-preact-config',
      config(c) {
        if (c.esbuild.jsxImportSource === 'preact') {
          delete c.esbuild.jsxImportSource
        }
        c.resolve.alias = c.resolve.alias.filter(
          i =>
            typeof i.replacement !== 'string' ||
            !i.replacement.startsWith('preact')
        )
      }
    }
  ]
}

const reactPlugin = () => {
  return [react({ include: [/\/react\/.*\.jsx(?:\?|$)/] })]
}

const solidPlugin = () => {
  return [
    solid({
      include: [/\/solid\/[^?]*\.jsx(?:\?|$)/],
      extensions: ['.jsx'],
      ssr: true
    })
  ]
}

const sveltePlugin = () => {
  return [
    svelte({
      configFile: false,
      preprocess: vitePreprocess(),
      compilerOptions: { hydratable: true }
    })
  ]
}

export default defineConfig({
  build: {
    minify: true,
    rollupOptions: {
      input: 'index.html.js'
    }
  },
  plugins: [
    ssg({
      render: {
        '**/react/**/*.jsx': ssgReact(),
        '**/solid/**/*.jsx': ssgSolid(),
        '**/*.jsx': ssgPreact(),
        '**/*.svelte': ssgSvelte(),
        '**/*.vue': ssgVue()
      },
      plugins: () => [
        preactPlugin(),
        reactPlugin(),
        solidPlugin(),
        sveltePlugin(),
        vue()
      ]
    })
  ]
})
