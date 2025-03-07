import Root from './Root'
import Page from './Page'
import Counter from './Counter?hydrate'

export default function IndexHtml() {
  return (
    <Root title="Vite + MiniSSG + React">
      <Page>
        <Counter />
      </Page>
    </Root>
  )
}
