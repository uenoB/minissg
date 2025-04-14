declare module '*?renderer' {
  type Content = NonNullable<import('./dist/index').Content>
  const render: (component: any) => Content | PromiseLike<Content>
  export default render
}

declare module '*?renderer&doctype' {
  const render: (component: any) => Promise<Blob>
  export default render
}

declare module '*?render' {
  const content: PromiseLike<import('./dist/index').Content>
  export default content
}

declare module '*?doctype' {
  const content: PromiseLike<import('./dist/index').Content>
  export default content
}

declare module '*?client' {
  const data: Record<string, import('./dist/index').Json>
  export default data
}

declare module '*?hydrate' {
  const component: any
  export default component
}

declare module '*?hydrate&render' {
  const content: PromiseLike<import('./dist/index').Content>
  export default content
}

declare module '*?render&doctype' {
  const content: PromiseLike<import('./dist/index').Content>
  export default content
}

declare module '*?hydrate&render&doctype' {
  const content: PromiseLike<import('./dist/index').Content>
  export default content
}
