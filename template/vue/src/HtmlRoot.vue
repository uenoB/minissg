<script setup>
const favicon = import.meta.env.BASE_URL + 'favicon.ico'
const props = defineProps({ title: { type: String, default: '' } })
</script>

<template>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1.0" />
      <link rel="icon" type="image/svg+xml" :href="favicon" />
      <title>{{ props.title }}</title>
    </head>
    <body>
      <slot />
    </body>
  </html>
</template>

<style>
body {
  margin: 0;
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  color: #222;
  background-color: #fff;
}

a:link {
  color: #04e;
}

@media screen and (prefers-color-scheme: dark) {
  body {
    color: #eee;
    background-color: #111;
  }

  a:link {
    color: #6bf;
  }
}
</style>
