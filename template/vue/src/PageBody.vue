<script setup>
const BASE_URL = import.meta.env.BASE_URL
</script>

<template>
  <div class="app">
    <div>
      <a href="https://vitejs.dev">
        <img src="./vite.svg" class="logo" alt="Vite" />
      </a>
      <a href="https://github.com/uenoB/minissg">
        <img src="./minissg.svg" class="logo" alt="Minissg" />
      </a>
      <a href="https://vuejs.org">
        <img src="./vue.svg" class="logo" alt="Vue" />
      </a>
    </div>
    <h1>Vite + Minissg + Vue</h1>
    <slot />
    <p>Edit <code>src/*.vue</code> and save to reload.</p>
    <p>
      <a href="https://vitejs.dev">Learn Vite</a>
      |
      <a href="https://github.com/uenoB/minissg">Learn Minissg</a>
      |
      <a href="https://vuejs.org">Learn Vue</a>
    </p>
    <p>
      <a :href="BASE_URL">Hydrate</a>
      |
      <a :href="BASE_URL + 'browser.html'">Browser</a>
    </p>
  </div>
</template>

<style scoped>
.app {
  margin: 3em 0;
  text-align: center;
}

.app h1 {
  margin: 0.5em;
  font-size: 3em;
  line-height: 1.1;
}

.logo {
  height: 6em;
  padding: 1em;
  margin: 0 0.3em;
  cursor: pointer;
  border: none;
  border-radius: 0.5em;
  transition: border-color 0.3s;
}

.logo:hover {
  box-shadow: 0 0 0.5em 0 #1bec;
}
</style>
