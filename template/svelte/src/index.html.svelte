<script>
  import Root from './Root.svelte'
  import Page from './Page.svelte'
  import Counter from './Counter.svelte?hydrate'
</script>

<Root title="Vite + MiniSSG + Svelte">
  <Page>
    <Counter />
  </Page>
</Root>
