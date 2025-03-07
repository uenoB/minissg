import ViteLogo from './vite.svg'
import MinissgLogo from './minissg.svg'
import SolidLogo from './solid.svg'
import './Page.css'

export default function Page(props) {
  return (
    <div class="app">
      <div>
        <a href="https://vitejs.dev">
          <img src={ViteLogo} class="logo" alt="Vite" />
        </a>
        <a href="https://github.com/uenoB/minissg">
          <img src={MinissgLogo} class="logo" alt="Minissg" />
        </a>
        <a href="https://www.solidjs.com">
          <img src={SolidLogo} class="logo" alt="Solid" />
        </a>
      </div>
      <h1>Vite + Minissg + Solid</h1>
      {props.children}
      <p>
        Edit <code>src/*.jsx</code> and save to reload.
      </p>
      <p>
        <a href="https://vitejs.dev">Learn Vite</a>
        {' | '}
        <a href="https://github.com/uenoB/minissg">Learn Minissg</a>
        {' | '}
        <a href="https://www.solidjs.com">Learn Solid</a>
      </p>
      <p>
        <a href={import.meta.env.BASE_URL}>Hydrate</a>
        {' | '}
        <a href={import.meta.env.BASE_URL + 'browser.html'}>Browser</a>
      </p>
    </div>
  )
}
