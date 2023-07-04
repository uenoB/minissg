import { HydrationScript } from 'solid-js/web'
import Root from './Root'
import App from './App'

export default function IndexHtml() {
  return (
    <Root head={<HydrationScript />}>
      <App />
    </Root>
  )
}
