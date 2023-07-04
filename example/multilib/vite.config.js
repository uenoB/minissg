import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import vue from '@vitejs/plugin-vue'
import ssg from 'vite-plugin-minissg'
import ssgPreact from 'vite-plugin-minissg/renderer/preact'
import ssgReact from 'vite-plugin-minissg/renderer/react'
import ssgSolid from 'vite-plugin-minissg/renderer/solid'
import ssgSvelte from 'vite-plugin-minissg/renderer/svelte'
import ssgVue from 'vite-plugin-minissg/renderer/vue'

const preactPlugin = () => {
  return [
    preact({ include: [/\/preact\/.*\.jsx(?:\?|$)/] }),
    {
      name: 'cancel-preact-alias',
      config(c) {
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
  return react({ include: [/\/react\/.*\.jsx(?:\?|$)/] })
}

const solidPlugin = () => {
  return [
    solid({
      include: [/\/solid\/[^?]*\.jsx(?:\?|$)/],
      ssr: true
    }),
    {
      name: 'cancel-solid-include',
      config(c) {
        delete c.esbuild.include
        c.esbuild.exclude = [/\/solid\/.*\.jsx(?:\?|$)/]
      }
    }
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
