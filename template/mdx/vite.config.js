import { defineConfig } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { preact } from '@preact/preset-vite'
import minissg from 'vite-plugin-minissg'
import minissgPreact from '@minissg/render-preact'

export default defineConfig({
  plugins: [
    minissg({
      input: './src/index.html.jsx',
      render: {
        '**/*.{jsx,mdx}': minissgPreact()
      },
      plugins: [
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
