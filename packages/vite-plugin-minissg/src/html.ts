const escape = (s: string): string =>
  s.replace(/[<>"]/g, i => (i === '<' ? '&lt;' : i === '>' ? '&gt;' : '&quot;'))

export const script = (src: string): string =>
  `<script type="module" src="${escape(src)}"></script>`

export const link = (href: string): string =>
  `<link rel="stylesheet" href="${escape(href)}">`

export const injectHtmlHead = (
  html: string | Uint8Array,
  head: string | Uint8Array
): string => {
  if (typeof html !== 'string') html = new TextDecoder().decode(html)
  if (typeof head !== 'string') head = new TextDecoder().decode(head)
  const i = /\s*<\/head\s*>/i.exec(html)?.index ?? 0
  return html.slice(0, i) + head + html.slice(i)
}
