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
  environments: {
    ssr: {},
    client: {
      build: {
        minify: true,
        reportCompressedSize: false
      }
    }
  },
  plugins: [
    minissg({
      input: './index.html.jsx',
      render: {
        '**/*.{jsx,md}': minissgPreact()
      },
      plugins: [
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
