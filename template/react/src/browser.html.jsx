import Root from './Root'
import Page from './Page'
import './browser?client'

export default function BrowserHtml() {
  return (
    <Root title="Vite + MiniSSG + React">
      <Page>
        <div id="counter" />
      </Page>
    </Root>
  )
}
