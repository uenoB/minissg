<script setup>
import HtmlRoot from './HtmlRoot.vue'
import PageBody from './PageBody.vue'
import CounterButton from './CounterButton.vue?hydrate'
</script>

<template>
  <HtmlRoot title="Vite + MiniSSG + Vue">
    <PageBody>
      <CounterButton />
    </PageBody>
  </HtmlRoot>
</template>
