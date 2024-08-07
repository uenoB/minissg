import { defineConfig } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import preact from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  build: {
    rollupOptions: {
      input: './src/index.html.jsx'
    }
  },
  plugins: [
    minissg({
      render: {
        '**/*.jsx': minissgPreact()
      },
      plugins: () => [
        preact(),
        mdx({
          mdxExtensions: ['.mdx', '.mdx?MINISSG-COPY'],
          jsxImportSource: 'preact',
          remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter]
        })
      ]
    })
  ]
})
