const sources = import.meta.glob('./posts/**/*.md', { query: { render: '' } })

const posts = Array.from(
  Object.entries(sources).map(([filename, entries]) => {
    return [filename.replace(/\.md$/, '/'), { entries }]
  })
)

export const entries = () => posts
