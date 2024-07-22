import type { Renderer } from '../../vite-plugin-minissg/src/options'
import { js } from '../../vite-plugin-minissg/src/util'

const renderer: Renderer = {
  render: {
    server: () => js`
      import { createComponent } from 'solid-js'
      import { renderToStringAsync, NoHydration } from 'solid-js/web'
      export default async function render(Component) {
        return await renderToStringAsync(() => {
          return createComponent(NoHydration, {
            get children() {
              return createComponent(Component, {})
            }
          })
        })
      }`
  },
  hydrate: {
    server: ({ id, moduleId, parameter }) => {
      const params = parameter.split(',').filter(i => i !== '')
      const withoutScript = params.findIndex(i => i === 'without-script')
      if (withoutScript >= 0) params.splice(withoutScript, 1)
      return js`
        import { Dynamic, Hydration, HydrationScript } from 'solid-js/web'
        import Component from ${moduleId}
        export * from ${moduleId}
        export default props => (
          <Dynamic
            component={${params[0] ?? 'div'}}
            data-hydrate={${id}}
            data-hydrate-args={JSON.stringify(props)}
          >
            <Hydration>
              <Component {...props} />
            </Hydration>
            {${withoutScript < 0} && <HydrationScript />}
          </Dynamic>
        )`
    },
    client: ({ id, moduleId, parameter }) => {
      const params = parameter.split(',').filter(i => i !== '')
      const div = params[0] ?? 'div'
      const selector = `${div}[data-hydrate=${JSON.stringify(id)}]`
      return js`
        import { createComponent, hydrate } from 'solid-js/web'
        import Component from ${moduleId}
        Array.from(document.querySelectorAll(${selector}), elem => {
          const props = JSON.parse(elem.dataset.hydrateArgs)
          // I'm not sure whether this is correct, but it works anyway
          const hk = elem.querySelector('[data-hk]')?.dataset.hk
          const renderId = hk?.replace(/0-0$/, '')
          const options = renderId ? { renderId } : {}
          hydrate(() => createComponent(Component, props), elem, options)
        })`
    }
  }
}

export default (): Renderer => renderer
