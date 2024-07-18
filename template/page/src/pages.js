import { Page } from './page'

export const pages = Page.create({
  pages: import.meta.glob('./pages/**/*.md'),
  substitutePath: s => s.slice('./pages'.length)
})

const children = await pages.children()
children.forEach(([_, page], i) => {
  page.prev = children[i - 1]?.[1]
  page.next = children[i + 1]?.[1]
})
