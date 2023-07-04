import { useState } from 'preact/hooks'

export default function Count({ class: className }) {
  const [count, setCount] = useState(0)
  const increment = () => {
    setCount(count => count + 1)
  }
  return (
    <button class={className} onClick={increment}>
      count is {count}
    </button>
  )
}
