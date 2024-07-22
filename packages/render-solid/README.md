# @minissg/render-solid

A renderer plugin for combining [Minissg] with [Solid.js].

See [Minissg's README] for details.

## `hydrate` query arguments

`?hydrate` query may have a `without-script` parameter.
To enable hydration, Solid.js requires to insert a hydration script into
a webpage.
@minissg/render-solid do so.
If you would like to avoid this insertion for some reason,
write `?hydrate=without-script` instead of `?hydrate`.

## License

MIT

[Minissg]: https://github.com/uenoB/minissg
[Solid.js]: https://www.solidjs.com
[Minissg's README]: https://github.com/uenoB/minissg/tree/main/packages/vite-plugin-minissg#readme
