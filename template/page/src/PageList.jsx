import { pages } from './pages'

export default function PageList() {
  return (
    <ul>
      {pages.children().value.map(([_, page]) => (
        <li key={page.fileName.value}>
          <a href={page.url.value.pathname}>
            {page.load().value.frontmatter.title}
          </a>
        </li>
      ))}
    </ul>
  )
}
