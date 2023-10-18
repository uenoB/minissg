import { isCSSRequest } from 'vite'

const escape = (s: string): string =>
  s.replace(/[<>"]/g, i => (i === '<' ? '&lt;' : i === '>' ? '&gt;' : '&quot;'))

export const scriptsHtml = (src: Iterable<string>, link = false): string =>
  Array.from(src, i =>
    link && isCSSRequest(i)
      ? `<link rel="stylesheet" href="${escape(i)}">\n`
      : `<script type="module" src="${escape(i)}"></script>\n`
  ).join('')

export const injectHtmlHead = (
  html: string | Uint8Array,
  head: string | Uint8Array
): string => {
  if (typeof html !== 'string') html = new TextDecoder().decode(html)
  if (typeof head !== 'string') head = new TextDecoder().decode(head)
  const i = /\s*<\/head\s*>/i.exec(html)?.index ?? 0
  return html.slice(0, i) + head + html.slice(i)
}
