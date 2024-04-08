import { defineConfig } from 'vite'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import preact from '@preact/preset-vite'
import ssg from 'vite-plugin-minissg'
import ssgPreact from '@minissg/render-preact'

export default defineConfig({
  build: {
    rollupOptions: {
      input: './src/index.html.jsx'
    }
  },
  plugins: [
    ssg({
      render: {
        '**/*.jsx': ssgPreact()
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
