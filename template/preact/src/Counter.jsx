import { useState } from 'preact/hooks'
import './Counter.css'

export default function Counter() {
  const [count, setCount] = useState(0)
  const increment = () => {
    setCount(count => count + 1)
  }
  return (
    <button class="counter" onClick={increment}>
      count is {count}
    </button>
  )
}
