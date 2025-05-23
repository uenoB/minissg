import './Root.css'

const favicon = import.meta.env.BASE_URL + 'favicon.ico'

export default function Root({ title, children }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href={favicon} />
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
