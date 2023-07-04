export const get = () => ({
  'preact/index.html': {
    get: () => import('../../template/preact/src/index.html.jsx?render')
  },
  'preact/browser.html': {
    get: () => import('../../template/preact/src/browser.html.jsx?render')
  },
  'react/index.html': {
    get: () => import('../../template/react/src/index.html.jsx?render')
  },
  'react/browser.html': {
    get: () => import('../../template/react/src/browser.html.jsx?render')
  },
  'solid/index.html': {
    get: () => import('../../template/solid/src/index.html.jsx?render')
  },
  'solid/browser.html': {
    get: () => import('../../template/solid/src/browser.html.jsx?render')
  },
  'svelte/index.html': {
    get: () => import('../../template/svelte/src/index.html.svelte?render')
  },
  'svelte/browser.html': {
    get: () => import('../../template/svelte/src/browser.html.svelte?render')
  },
  'vue/index.html': {
    get: () => import('../../template/vue/src/index-html.vue?render')
  },
  'vue/browser.html': {
    get: () => import('../../template/vue/src/browser-html.vue?render')
  },
  '': { default: indexHtml() }
})

const indexHtml = () => `
<html>
  <head>
    <meta charset="utf-8">
    <title>minissg-example-multilib</title>
  </head>
  <body>
    <h1>minissg-example-multilib</h1>
    <h2>Hydrate</h2>
    <ul>
      <li><a href="preact/">Preact</a></li>
      <li><a href="react/">React</a></li>
      <li><a href="solid/">Solid</a></li>
      <li><a href="svelte/">Svelte</a></li>
      <li><a href="vue/">Vue</a></li>
    </ul>
    <h2>Browser</h2>
    <ul>
      <li><a href="preact/browser.html">Preact</a></li>
      <li><a href="react/browser.html">React</a></li>
      <li><a href="solid/browser.html">Solid</a></li>
      <li><a href="svelte/browser.html">Svelte</a></li>
      <li><a href="vue/browser.html">Vue</a></li>
    </ul>
  </body>
</html>
`
