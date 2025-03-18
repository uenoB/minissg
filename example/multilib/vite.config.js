import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import vue from '@vitejs/plugin-vue'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'
import minissgReact from '@minissg/render-react'
import minissgSolid from '@minissg/render-solid'
import minissgSvelte from '@minissg/render-svelte'
import minissgVue from '@minissg/render-vue'
import MagicString from 'magic-string'

export default defineConfig({
  environments: {
    ssr: {
      build: {
        minify: true,
        rollupOptions: {
          input: 'index.html.js'
        }
      }
    }
  },
  plugins: [
    minissg({
      render: {
        '**/react/**/*.jsx': minissgReact(),
        '**/solid/**/*.jsx': minissgSolid(),
        '**/preact/**/*.jsx': minissgPreact(),
        '**/*.svelte': minissgSvelte(),
        '**/*.vue': minissgVue()
      },
      plugins: [
        {
          enforce: 'pre',
          name: 'jsx-import-source',
          transform(code, id) {
            const m = id.match(/\/(p?react|solid)\/[^?]*\.jsx(?:\?|$)/)
            if (m == null) return null
            const s = new MagicString(code)
            s.appendLeft(0, `// @jsxImportSource ${m[1]}\n`)
            return { code: s.toString(), map: s.generateMap({ hires: true }) }
          }
        },
        react({
          include: [/\/react\/[^?]*\.jsx(?:\?|$)/]
        }),
        preact({
          include: [/\/preact\/[^?]*\.jsx(?:\?|$)/],
          jsxImportSource: '',
          reactAliasesEnabled: false
        }),
        solid({
          include: [/\/solid\/[^?]*\.jsx(?:\?|$)/],
          extensions: ['.jsx'],
          ssr: true
        }),
        svelte({
          configFile: false,
          preprocess: vitePreprocess(),
          compilerOptions: { hydratable: true }
        }),
        vue()
      ]
    })
  ]
})
