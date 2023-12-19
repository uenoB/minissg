import type { Renderer } from '../../vite-plugin-minissg/src/options'
import { js } from '../../vite-plugin-minissg/src/util'

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
const renderer: Renderer = {
  render: {
    server: () => js`
      import { createSSRApp } from 'vue'
      import { renderToString } from 'vue/server-renderer'
      export default async function render(Component) {
        return await renderToString(createSSRApp(Component))
      }`
  },
  hydrate: {
    server: ({ id, moduleId, parameter: div }) => js`
      <template>
        <component :is="is" :data-hydrate="id" :data-hydrate-args="args">
          <Component v-bind="$attrs" />
        </component>
      </template>
      <script>
        import Component from ${moduleId}
        export * from ${moduleId}
        export default {
          inheritAttrs: false,
          components: { Component },
          data() {
            return {
              is: ${div || 'div'},
              id: ${id},
              args: JSON.stringify(this.$attrs)
            }
          }
        }
      </script>`,
    client: ({ id, moduleId, parameter: div }) => js`
      import { createSSRApp } from 'vue'
      import Component from ${moduleId}
      const selector = ${`${div || 'div'}[data-hydrate=${JSON.stringify(id)}]`}
      Array.from(document.querySelectorAll(selector), elem => {
        const props = JSON.parse(elem.dataset.hydrateArgs)
        const app = createSSRApp(Component, props)
        app.mount(elem)
      })`
  }
}

export default (): Renderer => renderer
