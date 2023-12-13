import { useState } from 'preact/hooks'
import ViteLogo from './vite.svg'
import MinissgLogo from './minissg.svg'
import MDXLogo from './mdx.svg'
import PreactLogo from './preact.svg'
import { app, logo, counter } from './App.module.css'

export default function App() {
  const [count, setCount] = useState(0)
  const increment = () => {
    setCount(count => count + 1)
  }
  return (
    <div class={app}>
      <div>
        <a href="https://vitejs.dev">
          <img src={ViteLogo} class={logo} alt="Vite" />
        </a>
        <a href="https://github.com/uenoB/vite-plugin-minissg">
          <img src={MinissgLogo} class={logo} alt="Minissg" />
        </a>
        <a href="https://mdxjs.com">
          <img src={MDXLogo} class={logo} alt="MDX" />
        </a>
        <a href="https://preactjs.com">
          <img src={PreactLogo} class={logo} alt="Preact" />
        </a>
      </div>
      <h1>Vite + Minissg + MDX + Preact</h1>
      <div>
        <button class={counter} onClick={increment}>
          count is {count}
        </button>
      </div>
      <p>
        Edit <code>src/*.{'{jsx,mdx}'}</code> and save to reload.
      </p>
      <p>
        <a href="https://vitejs.dev">Learn Vite</a>
        {' | '}
        <a href="https://github.com/uenoB/vite-plugin-minissg">Learn Minissg</a>
        {' | '}
        <a href="https://mdxjs.com">Learn MDX</a>
        {' | '}
        <a href="https://preactjs.com">Learn Preact</a>
      </p>
    </div>
  )
}
