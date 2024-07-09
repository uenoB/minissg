import { test, expect } from 'vitest'
import { build } from './build'

test('shared image used to yielded an empty chunk', async () => {
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

test('css module yields an empty chunk', async () => {
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
    'assets/style-Bu45y8TD.css': '._hi_1cqqp_1{color:red}\n',
    'assets/style.module-6SzpDZAL.js': '\n',
    'page1.html':
      '<script async type="module" crossorigin src="/assets/style.module-6SzpDZAL.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-Bu45y8TD.css">\n<p class=_hi_1cqqp_1>hello</p>',
    'page2.html':
      '<script async type="module" crossorigin src="/assets/style.module-6SzpDZAL.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-Bu45y8TD.css">\n<p class=_hi_1cqqp_1>hello</p>',
    'page3.html':
      '<script async type="module" crossorigin src="/assets/style.module-6SzpDZAL.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-Bu45y8TD.css">\n<p class=_hi_1cqqp_1>hello</p>',
    'page4.html':
      '<script async type="module" crossorigin src="/assets/style.module-6SzpDZAL.js"></script>\n<link rel="stylesheet" crossorigin href="/assets/style-Bu45y8TD.css">\n<p class=_hi_1cqqp_1>hello</p>'
  })
})

test('single reference to css module yields no empty chunk', async () => {
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
        export default '<p>hello</p>'`,
      'style.module.css': `
        .hi { color: red }`
    })
  ).resolves.toStrictEqual({
    'assets/page1-Bu45y8TD.css': '._hi_1cqqp_1{color:red}\n',
    'page1.html':
      '<link rel="stylesheet" crossorigin href="/assets/page1-Bu45y8TD.css">\n<p class=_hi_1cqqp_1>hello</p>',
    'page2.html': '<p>hello</p>'
  })
})
