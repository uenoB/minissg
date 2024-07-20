import { defineConfig } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkSmartypants from 'remark-smartypants'
import preact from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  base: '/hoge/',
  build: {
    rollupOptions: {
      input: './index.html.jsx'
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.{jsx,md}': minissgPreact()
      },
      config: {
        build: {
          minify: true,
          reportCompressedSize: false
        }
      },
      plugins: () => [
        preact(),
        mdx({
          jsxImportSource: 'preact',
          remarkPlugins: [
            remarkFrontmatter,
            remarkMdxFrontmatter,
            remarkGfm,
            remarkSmartypants
          ]
        })
      ]
    })
  ]
})
