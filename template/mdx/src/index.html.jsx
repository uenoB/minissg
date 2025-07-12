import render from './index.html.jsx?renderer&doctype'
import Root from './Root.mdx'

const pages = import.meta.glob(['./[a-z0-9]*.{md,mdx}'])

const paths = new Map(
  Object.keys(pages).map(path => {
    return [path, path.replace(/(?:\/index)?\.mdx?$/, '/')]
  })
)

const a = moduleName => {
  const a = ({ href, ...props }) => {
    const linkTo = paths.has(href)
      ? import.meta.env.BASE_URL + moduleName.join(paths.get(href)).path
      : href
    return <a href={linkTo} {...props} />
  }
  return a
}

export const main = ({ moduleName }) =>
  Object.entries(pages).map(([path, load]) => {
    const main = async () => {
      const md = await load()
      const root = () => (
        <Root title={md.frontmatter?.title ?? path}>
          <md.default components={{ a: a(moduleName) }} />
        </Root>
      )
      return { default: await render(root) }
    }
    return [paths.get(path), { main }]
  })
