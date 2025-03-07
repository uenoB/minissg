<script setup>
import HtmlRoot from './HtmlRoot.vue'
import PageBody from './PageBody.vue'
import './browser?client'
</script>

<template>
  <HtmlRoot title="Vite + MiniSSG + Vue">
    <PageBody>
      <div id="counter" />
    </PageBody>
  </HtmlRoot>
</template>
