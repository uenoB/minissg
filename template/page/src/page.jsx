import { Suspense } from 'react'
import PageClass from '@minissg/page'
import render from 'virtual:minissg/self?renderer'
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
    return new Blob(['<!DOCTYPE html>', await render(html)])
  }
}
