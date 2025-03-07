<script>
  const { title, children } = $props()
  const favicon = import.meta.env.BASE_URL + 'favicon.ico'
</script>

<html lang="en">
  <svelte:element this={'head'}>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href={favicon} />
    <title>{title}</title>
  </svelte:element>
  <svelte:element this={'body'}>
    {@render children()}
  </svelte:element>
</html>

<style>
  :global(body) {
    margin: 0;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    color: #222;
    background-color: #fff;
  }

  :global(a:link) {
    color: #04e;
  }

  @media screen and (prefers-color-scheme: dark) {
    :global(body) {
      color: #eee;
      background-color: #111;
    }

    :global(a:link) {
      color: #6bf;
    }
  }
</style>
