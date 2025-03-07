<script>
  let count = $state(0)
  const increment = () => {
    count += 1
  }
</script>

<button class="counter" onclick={increment}>
  count is {count}
</button>

<style>
  .counter {
    padding: 0.5em 1em;
    margin: 1em 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    color: inherit;
    cursor: pointer;
    background-color: #ccc4;
    border: none;
    border-radius: 0.5em;
    transition: border-color 0.3s;
  }

  .counter:hover {
    box-shadow: 0 0 0.5em 0 #1bec;
  }
</style>
