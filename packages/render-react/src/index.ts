import type { Renderer } from '../../vite-plugin-minissg/src/renderer'
import { js } from '../../vite-plugin-minissg/src/util'

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
const renderer: Renderer = {
  render: {
    server: () => js`
      import { PassThrough } from 'node:stream'
      import { createElement } from 'react'
      import { renderToPipeableStream } from 'react-dom/server'
      export default async function render(Component) {
        const stream = await new Promise((resolve, reject) => {
          const stream = new PassThrough()
          const node = createElement(Component, {})
          const { pipe } = renderToPipeableStream(node, {
            onAllReady: () => {
              pipe(stream)
              resolve(stream)
            },
            onError: e => reject(e)
          })
        })
        const result = []
        for await (const data of stream) result.push(data)
        return result.join('')
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
      import { createElement } from 'react'
      import { hydrateRoot } from 'react-dom/client'
      import Component from ${moduleId}
      const selector = ${`${div || 'div'}[data-hydrate=${JSON.stringify(id)}]`}
      Array.from(document.querySelectorAll(selector), elem => {
        const props = JSON.parse(elem.dataset.hydrateArgs)
        hydrateRoot(elem, createElement(Component, props))
      })`
  }
}

export default (): Renderer => renderer
