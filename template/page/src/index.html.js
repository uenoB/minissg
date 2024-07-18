import { Page } from './page'
import { pages } from './pages'

const top = Page.create({
  pages: import.meta.glob('./*.mdx')
})

const root = Page.create({
  pages: { '': pages, '.': top },
  url: 'https://example.com/'
})

export const main = () => root
