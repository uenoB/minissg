export default function Anchor({ href, ...props }) {
  if (href != null) href = href.replace(/^\//, import.meta.env.BASE_URL)
  return <a {...{ href, ...props }} />
}
