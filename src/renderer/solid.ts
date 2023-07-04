import { type Renderer, js } from '../index'

const renderer: Renderer = {
  render: {
    server: () => js`
      import { renderToStringAsync, createComponent } from 'solid-js/web'
      export default async function render(Component) {
        return await renderToStringAsync(() => createComponent(Component, {}))
      }`
  },
  hydrate: {
    // Note that solid does not support partial hydration.  To enable
    // hydration, the entire HTML document is made from a solid component.
    // As an unstable experiment, if an element name is given as a parameter
    // of ?hydrate query, it generates a serialized portion of HTML document.
    server: ({ id, moduleId, parameter: div }) => {
      if (div === '') {
        return js`
          export { default } from ${moduleId}
          export * from ${moduleId}`
      } else {
        return js`
          import { renderToString, HydrationScript } from 'solid-js/web'
          import Component from ${moduleId}
          export * from ${moduleId}
          export default function(props) {
            const args = JSON.stringify(props)
            return renderToString(() => (
              <>
                <HydrationScript />
                <${div} data-hydrate={${id}} data-hydrate-args={args}>
                  <Component {...props} />
                </${div}>
              </>
            })
          }`
      }
    },
    client: ({ id, moduleId, parameter: div }) => {
      if (div === '') {
        return js`
          import { createComponent, hydrate } from 'solid-js/web'
          import Component from ${moduleId}
          hydrate(() => createComponent(Component, {}), document)`
      } else {
        return js`
          import { createComponent, hydrate } from 'solid-js/web'
          import Component from ${moduleId}
          const selector = ${`${div}[data-hydrate=${JSON.stringify(id)}]`}
          const elem = document.querySelector(selector)
          if (elem != null) {
            const props = JSON.parse(elem.dataset.hydrateArgs)
            hydrate(() => createComponent(Component, props), elem)
          }`
      }
    }
  }
}

export default (): Renderer => renderer
