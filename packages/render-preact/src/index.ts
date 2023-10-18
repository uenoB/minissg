import type { Renderer } from '../../vite-plugin-minissg/src/options'
import { js } from '../../vite-plugin-minissg/src/utils'

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
const renderer: Renderer = {
  render: {
    server: () => js`
      import { h } from 'preact'
      import { render as renderToString } from 'preact-render-to-string'
      import prepass from 'preact-ssr-prepass'
      export default async function render(Component) {
        const node = h(Component, {})
        await prepass(node)
        return renderToString(node)
      }`
  },
  hydrate: {
    server: ({ id, moduleId, parameter: div }) => js`
      import Component from ${moduleId}
      export * from ${moduleId}
      export default function(props) {
        const Div = ${div || 'div'}
        const args = JSON.stringify(props)
        return (
          <Div data-hydrate={${id}} data-hydrate-args={args}>
            <Component {...props} />
          </Div>
        )
      }`,
    client: ({ id, moduleId, parameter: div }) => js`
      import { h, hydrate } from 'preact'
      import Component from ${moduleId}
      const selector = ${`${div || 'div'}[data-hydrate=${JSON.stringify(id)}]`}
      Array.from(document.querySelectorAll(selector), elem => {
        hydrate(h(Component, JSON.parse(elem.dataset.hydrateArgs)), elem)
      })`
  }
}

export default (): Renderer => renderer
