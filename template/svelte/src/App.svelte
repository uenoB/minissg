<script>
  import ViteLogo from './vite.svg'
  import MinissgLogo from './minissg.svg'
  import SvelteLogo from './svelte.svg'

  let count = $state(0)
  const increment = () => {
    count += 1
  }
</script>

<div class="app">
  <div>
    <a href="https://vitejs.dev">
      <img src={ViteLogo} class="logo" alt="Vite" />
    </a>
    <a href="https://github.com/uenoB/minissg">
      <img src={MinissgLogo} class="logo" alt="Minissg" />
    </a>
    <a href="https://svelte.dev">
      <img src={SvelteLogo} class="logo" alt="Svelte" />
    </a>
  </div>
  <h1>Vite + Minissg + Svelte</h1>
  <div>
    <button class="counter" onclick={increment}>
      count is {count}
    </button>
  </div>
  <p>Edit <code>src/*.svelte</code> and save to reload.</p>
  <p>
    <a href="https://vitejs.dev">Learn Vite</a>
    | <a href="https://github.com/uenoB/minissg">Learn Minissg</a>
    | <a href="https://svelte.dev">Learn Svelte</a>
  </p>
  <p>
    <a href={import.meta.env.BASE_URL}>Hydrate</a>
    | <a href={import.meta.env.BASE_URL + 'browser.html'}>Browser</a>
  </p>
</div>

<style>
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
  }

  .counter {
    padding: 0.5em 1em;
    margin: 1em 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    background-color: #ccc4;
  }

  .logo,
  .counter {
    cursor: pointer;
    border: none;
    border-radius: 0.5em;
    transition: border-color 0.3s;
  }

  .logo:hover,
  .counter:hover {
    box-shadow: 0 0 0.5em 0 #1bec;
  }
</style>
