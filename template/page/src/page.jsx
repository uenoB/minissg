import { Suspense } from 'preact/compat'
import PageClass from '@minissg/page'
import render from './page.jsx?renderer&doctype'
import Root from './Root'
import Nav from './Nav'

export class Page extends PageClass {
  prev
  next

  async render(module) {
    const a = ({ href, ...props }) => (
      <a href={this.find(href).value?.url.value.pathname} {...props} />
    )
    const html = () => (
      <Suspense fallback={null}>
        <Root title={module.frontmatter?.title}>
          <Nav page={this} />
          <module.default components={{ a }} />
        </Root>
      </Suspense>
    )
    return await render(html)
  }
}
