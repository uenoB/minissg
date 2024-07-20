# Minissg

Minissg (pronounce it as "missing" 😄) is a minimum-sized,
configurable, and zero-JS static site generator, provided as a Vite
plugin.

Unlike fully-featured frameworks, it aims to bring the bare
functionality of JS and Vite, including its extensibility and
performance, into static site generation.
Minissg is carefully designed just as a Vite plugin, not as a
framework, so that it does not hide anything in JS and Vite from the
users.
With Minissg, any decision and convention for static site generation
are up to you; for example, you can write your static webpages with
any combination of your favorite JS technologies in exchange of a
little effort to write some JS code and some configurations in
`vite.config.js`.

See [packages/vite-plugin-minissg/README.md] for details.

## Packages

This is a monorepo containing Minissg and its related packages.

* [vite-plugin-minissg](packages/vite-plugin-minissg)
* [@minissg/async](packages/async)
* [@minissg/page](packages/page)
* [@minissg/render-preact](packages/render-preact)
* [@minissg/render-react](packages/render-react)
* [@minissg/render-solid](packages/render-solid)
* [@minissg/render-svelte](packages/render-svelte)
* [@minissg/render-vue](packages/render-vue)

## License

MIT

[packages/vite-plugin-minissg/README.md]: packages/vite-plugin-minissg/README.md
