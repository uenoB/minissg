import { useState } from 'react'
import ViteLogo from './vite.svg'
import MinissgLogo from './minissg.svg'
import ReactLogo from './react.svg'
import './App.css'

export default function App() {
  const [count, setCount] = useState(0)
  const increment = () => {
    setCount(count => count + 1)
  }
  return (
    <div className="app">
      <div>
        <a href="https://vitejs.dev">
          <img src={ViteLogo} className="logo" alt="Vite" />
        </a>
        <a href="https://github.com/uenoB/minissg">
          <img src={MinissgLogo} className="logo" alt="Minissg" />
        </a>
        <a href="https://react.dev">
          <img src={ReactLogo} className="logo" alt="React" />
        </a>
      </div>
      <h1>Vite + Minissg + React</h1>
      <div>
        <button className="counter" onClick={increment}>
          count is {count}
        </button>
      </div>
      <p>
        Edit <code>src/*.jsx</code> and save to reload.
      </p>
      <p>
        <a href="https://vitejs.dev">Learn Vite</a>
        {' | '}
        <a href="https://github.com/uenoB/minissg">Learn Minissg</a>
        {' | '}
        <a href="https://react.dev">Learn React</a>
      </p>
      <p>
        <a href={import.meta.env.BASE_URL}>Hydrate</a>
        {' | '}
        <a href={import.meta.env.BASE_URL + 'browser.html'}>Browser</a>
      </p>
    </div>
  )
}
