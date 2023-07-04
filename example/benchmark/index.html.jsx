const sources = import.meta.glob('./posts/**/*.md', { query: { render: '' } })

const posts = new Map(
  Array.from(
    Object.entries(sources).map(([filename, get]) => {
      return [filename.replace(/\.md$/, '/'), { get }]
    })
  )
)

export const get = () => posts
