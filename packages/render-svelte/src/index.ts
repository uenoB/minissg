import type { Renderer } from '../../vite-plugin-minissg/src/options'
import { js } from '../../vite-plugin-minissg/src/util'

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
const renderer: Renderer = {
  render: {
    server: () => js`
      import { render as svelteRender } from 'svelte/server'
      export default function render(Component) {
        const { html, head } = svelteRender(Component)
        const i = /\s*<\/head\s*>/.exec(html)?.index ?? 0
        return html.slice(0, i) + head + html.slice(i)
      }`
  },
  hydrate: {
    server: ({ id, moduleId, parameter: div }) => js`
      <script module>
        import Component from ${moduleId}
        export * from ${moduleId}
      </script>
      <svelte:element
        this={${div || 'div'}}
        data-hydrate={${id}}
        data-hydrate-args={JSON.stringify($$props)}>
        <Component {...$$props} />
      </svelte:element>`,
    client: ({ id, moduleId, parameter: div }) => js`
      import { hydrate } from 'svelte'
      import Component from ${moduleId}
      const selector = ${`${div || 'div'}[data-hydrate=${JSON.stringify(id)}]`}
      Array.from(document.querySelectorAll(selector), elem => {
        const props = JSON.parse(elem.dataset.hydrateArgs)
        hydrate(Component, { target: elem, hydrate: true, props })
      })`
  }
}

export default (): Renderer => renderer
