import { createSignal } from 'solid-js'
import './Counter.css'

export default function Counter() {
  const [count, setCount] = createSignal(0)
  const increment = e => {
    e.preventDefault()
    setCount(count() + 1)
  }
  return (
    <button class="counter" onClick={increment}>
      count is {count()}
    </button>
  )
}
