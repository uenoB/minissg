import { test, expect } from 'vitest'
import { build } from './build'

/* eslint-disable max-len */

test('empty chunk due to asset', async () => {
  await expect(
    build({
      'index.html.js': `
        export const entries = () =>
          Object.entries(import.meta.glob('./page*.js')).map(([path, load]) =>
            [path.replace(/\\.js$/, '.html'), { entries: load }])`,
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
    'assets/favicon-w40geAFS.js': '\n',
    'page1.html':
      '<script async type="module" crossorigin src="/assets/favicon-w40geAFS.js"></script>\n\n<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page2.html':
      '<script async type="module" crossorigin src="/assets/favicon-w40geAFS.js"></script>\n\n<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page3.html':
      '<script async type="module" crossorigin src="/assets/favicon-w40geAFS.js"></script>\n\n<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">',
    'page4.html':
      '<script async type="module" crossorigin src="/assets/favicon-w40geAFS.js"></script>\n\n<img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e">'
  })
})

test('empty chunk due to module css', async () => {
  await expect(
    build({
      'index.html.js': `
        export const entries = () =>
          Object.entries(import.meta.glob('./page*.js')).map(([path, load]) =>
          [path.replace(/\\.js$/, '.html'), { entries: load }])`,
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
    'assets/style-buOcvEww.css': '._hi_1cqqp_1{color:red}\n',
    'assets/style.module-cXDODbZU.js': '\n',
    'page1.html':
      '<script async type="module" crossorigin src="/assets/style.module-cXDODbZU.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-buOcvEww.css">\n\n<p class=_hi_1cqqp_1>hello</p>',
    'page2.html':
      '<script async type="module" crossorigin src="/assets/style.module-cXDODbZU.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-buOcvEww.css">\n\n<p class=_hi_1cqqp_1>hello</p>',
    'page3.html':
      '<script async type="module" crossorigin src="/assets/style.module-cXDODbZU.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-buOcvEww.css">\n\n<p class=_hi_1cqqp_1>hello</p>',
    'page4.html':
      '<script async type="module" crossorigin src="/assets/style.module-cXDODbZU.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-buOcvEww.css">\n\n<p class=_hi_1cqqp_1>hello</p>'
  })
})
