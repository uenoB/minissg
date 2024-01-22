import render from 'virtual:minissg/self?renderer'
import Root from './Root'

const pages = import.meta.glob(['./*.{md,mdx}'])

const hrefMap = new Map()
const a = ({ href, ...props }) => (
  <a href={hrefMap.get(href) ?? href} {...props} />
)

export const main = ({ moduleName }) =>
  Object.entries(pages).map(([path, load]) => {
    const relPath = path.replace(/(?:\/index)?\.mdx?$/, '/')
    hrefMap.set(path, import.meta.env.BASE_URL + moduleName.join(relPath).path)
    const main = async () => {
      const md = await load()
      const title = md.frontmatter?.title ?? path
      const root = () => (
        <Root title={title}>
          <md.default components={{ a }} />
        </Root>
      )
      return { default: render(root) }
    }
    return [relPath, { main }]
  })
