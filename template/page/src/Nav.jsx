const LinkPage = ({ page }) => (
  <a href={page.url.value.pathname}>{page.load().value?.frontmatter?.title}</a>
)

export default function Nav({ page }) {
  return (
    (page.prev != null || page.next != null) && (
      <nav>
        <ul>
          {page.prev && (
            <li>
              prev: <LinkPage page={page.prev} />
            </li>
          )}
          {page.next && (
            <li>
              next: <LinkPage page={page.next} />
            </li>
          )}
        </ul>
      </nav>
    )
  )
}
