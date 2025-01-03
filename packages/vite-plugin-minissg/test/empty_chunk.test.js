import { test, expect } from 'vitest'
import { build } from './build'

test('shared image should not yield an empty chunk', async () => {
  await expect(
    build({
      'index.html.js': `
        export const main = () =>
          Object.entries(import.meta.glob('./page*.js')).map(([path, main]) =>
            [path.replace(/\\.js$/, '.html'), { main }])`,
      'page1.js': `
        import svg from './favicon.svg'
        export default \`<img src="\${svg}">\``,
      'page2.js': `
        import svg from './favicon.svg'
        export default \`<img src="\${svg}">\``,
      'page3.js': `
        import svg from './favicon.svg'
        export default \`<img src="\${svg}">\``,
      'page4.js': `
        import svg from './favicon.svg'
        export default \`<img src="\${svg}">\``,
      'favicon.svg': `
        <svg></svg>`
    })
  ).resolves.toStrictEqual({
    'page1.html': '<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page2.html': '<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page3.html': '<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page4.html': '<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">'
  })
})

test(
  'CSS modules used only in server side does not appear in the output,' +
    ' because CSS modules are tree-shaken since Vite 5.2.0',
  async () => {
    await expect(
      build({
        'index.html.js': `
          export const main = () =>
            Object.entries(import.meta.glob('./page*.js')).map(([path, main]) =>
              [path.replace(/\\.js$/, '.html'), { main }])`,
        'page1.js': `
          import { hi } from './style.module.css'
          export default \`<p class=\${hi}>hello</p>\``,
        'page2.js': `
          import { hi } from './style.module.css'
          export default \`<p class=\${hi}>hello</p>\``,
        'page3.js': `
          import { hi } from './style.module.css'
          export default \`<p class=\${hi}>hello</p>\``,
        'page4.js': `
          import { hi } from './style.module.css'
          export default \`<p class=\${hi}>hello</p>\``,
        'style.module.css': `
          .hi { color: red }`
      })
    ).resolves.toStrictEqual({
      'page1.html': '<p class=_hi_1cqqp_1>hello</p>',
      'page2.html': '<p class=_hi_1cqqp_1>hello</p>',
      'page3.html': '<p class=_hi_1cqqp_1>hello</p>',
      'page4.html': '<p class=_hi_1cqqp_1>hello</p>'
    })
  }
)

test('CSS modules used in client side appears in the output', async () => {
  await expect(
    build({
      'index.html.js': `
        import './client.js?client'
        export default '<p>hello</p>'`,
      'client.js': `
        import { hi } from './style.module.css'
        console.log(hi)`,
      'style.module.css': `
        .hi { color: red }`
    })
  ).resolves.toStrictEqual({
    'index.html':
      '<script type="module" crossorigin src="/assets/index-CE29hf46.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/index-CZ0K0HCE.css">\n<p>hello</p>',
    'assets/index-CZ0K0HCE.css': '._hi_1cqqp_1{color:red}\n',
    'assets/index-CE29hf46.js': expect.stringContaining('"_hi_1cqqp_1"')
  })
})
