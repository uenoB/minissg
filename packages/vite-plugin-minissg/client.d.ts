declare module '*?renderer' {
  type Content = NonNullable<import('./dist/index').Content>
  const render: (component: any) => Content | PromiseLike<Content>
  export default render
}

declare module '*?render' {
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

declare module 'virtual:minissg/control' {
  export const peek: <X, A extends readonly unknown[]>(
    f: ((...args: A) => PromiseLike<X> | X) | PromiseLike<X> | X,
    ...args: A
  ) => Promise<X>
}
