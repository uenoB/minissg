const sources = import.meta.glob('./posts/**/*.md', { query: { render: '' } })

const posts = Array.from(
  Object.entries(sources).map(([filename, main]) => {
    return [filename.replace(/\.md$/, '/'), { main }]
  })
)

export const main = () => posts
