# vite-plugin-minissg

[Minissg] (pronounce it as "missing" 😄) is a minimum-sized,
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
any of your favorite technologies including [React], [Preact],
[Solid], [Svelte], [Vue], [Markdown], [MDX], and even any combination
of them, in exchange of a little effort to write some JS code and some
configurations in `vite.config.js`.

The core part of Minissg consists only about 1,100 lines of code in
TypeScript (actually, this README has more lines than Minissg).
This small codebase allows you to easily understand what Minissg does
and does not.
Including this point, Minissg aims to be not an opinionated framework,
but a _transparent atmosphere_, which does not lead you to anything
but maximum freedom of static site programming.

* [Migration from Minissg 4 to 5](#migration-from-minissg-4-to-5)
* [Getting Started](#getting-started)
* [Getting Started from Scratch](#getting-started-from-scratch)
  * [Hello, World](#hello-world)
  * [Previewing and Dev Server](#previewing-and-dev-server)
  * [Multiple Page Generation](#multiple-page-generation)
  * [Using a Component Library](#using-a-component-library)
  * [Authoring with Markdown](#authoring-with-markdown)
* [How It Works](#how-it-works)
  * [Vite Runs Twice](#vite-runs-twice)
  * [Module Tree](#module-tree)
  * [Static Routing](#static-routing)
  * [Renderers](#renderers)
  * [DOCTYPE Insertion](#doctype-insertion)
  * [Style Sheets](#style-sheets)
  * [Client-side Code](#client-side-code)
  * [Partial Hydration](#partial-hydration)
* [Advanced Features](#advanced-features)
  * [Configuring Each Run Differently](#configuring-each-run-differently)
  * [Generating Data for Client-side Code](#generating-data-for-client-side-code)
  * [Renderer for a Module Itself](#renderer-for-a-module-itself)
  * [User-defined Renderers and Hydration](#user-defined-renderers-and-hydration)
  * [Mixing Components of Different Systems](#mixing-components-of-different-systems)
  * [Contextual Information of Modules](#contextual-information-of-modules)
  * [Manipulating the Effect of Dynamic Imports](#manipulate-the-effect-of-dynamic-imports)
  * [Debugging Server-side Code](#debugging-server-side-code)
* [Plugin Options](#plugin-options)
* [Tips and Notes](#tips-and-notes)
* [License](#license)

## Migration from Minissg 4 to 5

Minissg 5 is reconstructed on top of Vite 6's environment API.
Because of this, how to write `vite.config.js` has been changed without
backward compatibility.
Users of Minissg 4 should take the following into account:
* Use the `input` option of Minissg plugin instead of
  `build.rollupOptions.input` to specify the entry scripts.
* Use `environments.client` instead of the `config` plugin option.
* The `plugins` option now takes an array, not a function.

## Getting Started

Template projects using Minissg with Preact, React, Solid, Svelte, Vue,
and MDX are available in this repository.
See [template directory](./template/) for the full list of templates.
You can start your project with one of these templates by downloading
it.
For example,  by using [tiged]:

```bash
tiged uenob/minissg/template/preact my_project
```

After that, change directory to the new directory and install all
dependencies by the `npm` command:

```bash
cd my_project
npm install
```

The following scripts are initially available:
* `npm run build` for static site generation for production.
* `npm run serve` for preview of the build result.
* `npm run dev` for starting Vite's dev server.

## Getting Started from Scratch

### Hello, World

To start a Minissg project without any template,
install Vite and Minissg by your favorite package manager:

```bash
npm install vite vite-plugin-minissg
```

And then, put Minissg in the `plugins` list of `vite.config.js`
and specify at least one entry script in its `input` option.

```js
import { defineConfig } from "vite"
import minissg from "vite-plugin-minissg"

export default defineConfig({
  plugins: [
    minissg({
      input: "./index.html.js" // put a script file here.
    })
  ]
})
```

Write the following code and save it in `index.html.js`:

```js
export default `<!DOCTYPE html>
<html>
  <head><title>My first Minissg site</title></head>
  <body><h1>Hello, Vite + Minissg!</h1></body>
</html>`;
```

We are now ready to build a site.
Run `vite build` by your favorite package manager:

```bash
npx vite build
```

Vite runs twice automatically with the following message and generates
an `index.html` file in `dist` directory:

```
vite v6.2.2 building SSR bundle for production...
✓ 3 modules transformed.
dist/assets/index.html-DzLWOVMS.js  0.19 kB
dist/index.js                       0.26 kB
dist/assets/lib-CBp2c9DY.js         0.53 kB
✓ built in 40ms
vite v6.2.2 building for production...
✓ 3 modules transformed.
dist/index.html  0.13 kB │ gzip: 0.12 kB
✓ built in 21ms
```

The content of `dist/index.html` should be something like the
following, which is exactly same as the string literal written in
`index.html.js`:

```html
<!DOCTYPE html>
<html>
  <head><title>My first Minissg site</title></head>
  <body><h1>Hello, Vite + Minissg!</h1></body>
</html>
```

### Previewing and Dev Server

You can use Vite's dev server and preview server for the website
development.
To view your site with live reloading, run Vite's Dev Server
by the following command:

```bash
npx vite
```

To preview the production site generated by `vite build`, execute the
following command:

```bash
npx vite preview
```

See Vite's manual for details of these commands.

### Multiple Page Generation

To generate multiple pages, do one of the following:

1. Write a new file, say `hello.txt.js`,

   ```js
   export default "Hello\n";
   ```

   and add it to the `input` option.

   ```js
   import { defineConfig } from "vite"
   import minissg from "vite-plugin-minissg"

   export default defineConfig({
     plugins: [
       minissg({
         input: ["./index.html.js", "./hello.txt.js"]
       })
     ]
   })
   ```

2. Define `main` function in `index.html.js` instead of the `default`
   export and indicate multiple routes in it.

   ```js
   export const main = () => ({
     'index.html':
       {
         default: `<!DOCTYPE html>
           <html>
             <head><title>My first Minissg site</title></head>
             <body><h1>Hello, Vite + Minissg!</h1></body>
           </html>`
       },
     'hello.txt': { default: "Hello\n" }
   });
   ```

### Using a Component Library

The page construction can be done with a component library.
For your convenience, Minissg provides _renderers_ that
serialize components into HTML file contents.
Here, we use [React] to do the same thing as the above.
First of all, install React and its Vite plugin by the following
command:

```bash
npm install react react-dom @vitejs/plugin-react @minissg/render-react
```

Write `vite.config.js` as follows:

```js
import { defineConfig } from "vite"
import minissg from "vite-plugin-minissg"
import react from "@vitejs/plugin-react"  // ADDED
import minissgReact from "@minissg/render-react"  // ADDED

export default defineConfig({
  plugins: [
    minissg({
      input: "./index.html.jsx?render",  // MODIFIED. NOTE: "./" is mandatory
      render: {
        "**/*.jsx": minissgReact()       // ADDED
      },
      plugins: [react()]                 // ADDED
    })
  ]
})
```

Plugins combined with Minissg must be put in Minissg's `plugins` option,
not in the `plugins` array of `vite.config.js`.

The above config includes three important changes from the previous
one:
1. Specify a `*.jsx` file in `input` with `?render` query.
   The `?render` query indicates that the component exported by this
   file must be serialized by the renderer specified in Minissg's
   `render` option.
2. Associate `*.jsx` files to the renderer of React components
   (`minissgReact`) by setting Minissg's `render` option.
3. Add the React plugin to Minissg's `plugins` option of the above
   form, not in that of Vite's config.
   The plugins put here are enabled in both the server-side and
   client-side run of Vite.

Write `index.html.jsx` like this:

```jsx
export default function() {
  return (
    <html>
      <head><title>My first Minissg site</title></head>
      <body><h1>Hello, Vite + Minissg + React!</h1></body>
    </html>
  )
};
```

Run `vite build` and find `dist/index.html` created from the JSX file.

### Authoring with Markdown

Minissg does not provide any capability to deal with Markdown files,
but you can combine it with your favorite Markdown libraries.
Say [@mdx-js/rollup] for such a Markdown processor.
The Vite config must be extended as follows:

```js
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"           // ADDED
import minissg from "vite-plugin-minissg"
import minissgReact from "@minissg/render-react"

export default defineConfig({
  plugins: [
    minissg({
      input: "./index.html.md?render",    // MODIFIED
      render: {
        "**/*.{jsx,md}": minissgReact()   // MODIFIED
      },
      plugins: [
        react(),
        mdx()                             // ADDED
      ]
    })
  ]
})
```

Then, write a markdown file named `index.html.md` with the following
content:

```markdown
# My first Minissg site
Hello, Vite + Minissg + MDX!
```

And execute `vite build` to generate the page.

## How It Works

### Vite Runs Twice

Minissg actually does the following:

1. Run Vite in SSR environment and bundle all the files specified in
   the `input` option into a single JavaScript program.
2. Traverse file dependencies in the generated program and determine
   the set of client-side codes and style sheets for each page to be
   generated.
3. Execute the generated program and obtain the list of pages and
   their contents to be generated.
4. Run Vite again in client environment to generate client-side codes,
   style sheets, and assets.

In what follows, we refer to the first and second run of Vite as
_server-side run_ and _client-side run_, respectively.
We also refer to the program generated by or given to the first run
as _server-side code_.

For integrity between the two runs, Minissg loads server-side code
not only in server-side run but also client-side run.
Loading server-side code in client-side run is needed to yield assets
that are referred only from server-side code or are generated by some
server-side plugins and used in client-side code.
Assets generated in server-side run are all discarded for integrity.
Only the files generated by client-side run are left in the
destination site.

### Module Tree

Server-side code consists of a collection of _modules_, which
constitute the hierarchy of files in the website to be generated.
The variation of a module is defined as follows in TypeScript:

```typescript
type Module =
  | { main: (context: Readonly<Context>) => Module | PromiseLike<Module> }
  | { default: Content | PromiseLike<Content> }
  | Record<string, Module | PromiseLike<Module>>
  | Iterable<readonly [string, Module | PromiseLike<Module>]>;

export type Content =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | null
  | undefined
```

The definition of `Context` will be given later in
[Contextual Information of Modules](#contextual-information-of-modules)
section.

The `Module` type is the type of modules expected by Minissg.
Intuitively:

1. A module may have `main` function that returns another module.
   This allows the module to delegate file generation to another
   module, which is possibly dynamically created.
2. A module may also have `default` value that gives Minissg the
   content of a destination file.
   The content can be given in several forms including string,
   Uint8Array, ArrayBuffer, and Blob.
   Except for nullish values, `Content` can be included in an argument
   of `Blob` constructor.
   This allows modules to generate any kind of files from various
   sources; for example, a module can download something by fetch
   API and pass its response as a Blob to Minissg.
   The `null` or `undefined` content means "not found."
   If a module have both `main` and `default`, `main` has precedence
   and `default` is ignored.
3. A module may also be an Iterable object that enumerates multiple
   routing.
   In this case, each item in the Iterable object must be a pair
   (array with two elements) of a string and module, where the string
   is a relative path that will be joined with the name of currently
   requested file.
   See [Static Routing](#static-routing) section below for the details
   of name concatination.

Empty modules are simply ignored.

Through the `main` functions and mapping objects, the collection of
modules constitute a tree structure.
The root of this tree is the _top-level module_, which is a virtual
module generated in accordance with Minissg's `input` option.
The top-level module is constructed depending on the structure of
`input` by the following rules:

1. If `input` is a single string, the top-level module is a singleton
   mapping from the name of the given file to the module provided by the file.
   For example,
   ```js
   { input: "./index.html.js" }
   ```
   means that `index.html.js` is the module providing the content of
   `index.html` file.
   This is semantically equivalent to the following module:
   ```js
   { "index.html": { main: () => import("./index.html.js") } }
   ```
2. If it is an array of strings, the top-level modules is a mapping
   from their names to their modules.
   For example,
   ```js
   { input: ["./index.html.js", "./hello.txt.js"] }
   ```
   means the following module:
   ```js
   {
     "index.html": { main: () => import("./index.html.js") },
     "hello.txt": { main: () => import("./hello.txt") }
   }
   ```
3. If it is an object, Minissg uses it as the mapping from names to
   modules.
   For example, if the following config is given,
   ```js
   { input: { "index.html": "./index.js" } }
   ```
   Minissg uses `index.js` to generate `index.html`, i.e., the
   top-level module should look like the following:
   ```js
   { "index.html": { main: () => import("./index.js") } }
   ```

### Static Routing

Each module is uniquely associated to a name of a destination file.
In what follows, we refer to such a name as the _name_ of a module.

The name of the top-level module is always `index.html`.
For other modules, which must be child modules of a module,
their names are computed from the name of their parent module by the
following rule:

1. The name of the module returned by `main` function is same
   as that of the module owning the `main` function.
2. The name of a module associated to a relative path in a parent
   module is obtained by appending the relative path to the end of the
   name of the parent module.
   The appending is done with equating path fragment `index.html` with
   empty fragment.
   Detailed procedure of this appending is the following:
   1. If the name of the parent module ends with `index.html` fragment,
      eliminate it.
   2. If the relative path includes `.` fragment, eliminate all of
      them.
   2. If the name of the parent module does not end with `/`
      and the relative path is not empty, add `/` to the beginning of
      the relative path.
   4. Concatenate the output of the parent module and the relative
      path in this order.
   5. If the concatenation result ends with `/`, append `index.html`
      to the end of it.

For static site generation, Minissg visits all of the modules
reachable from the top-level module.
During this traversal, Minissg calls all `main` functions
to determine the entire set of modules.
After that, for each module that have effective `default` value,
Minissg generates a file whose name is the name of the module and
whose content is the `default` value.

Note that the name of a module is not always unique.
If two modules has the same name and effective `default` values, the
first-visited one precedes another.
Strictly speaking, the precedence is determined by the pre-order of
the entire module tree.
Intuitively, the order of precedence is the order of modules appearing
in a parent module.

A simple but powerful way to organize multiple modules is to use
Vite's `import.meta.glob` feature.
The following example defines the `main` function that
includes all of the `*.md` files in the `pages` directory to
generate `*/index.html` files from them.

```js
const mdFiles = import.meta.glob("./**/*.md", { query: { render: "" } });

// transform filenames *.md to */ and make modules with import functions
const modules = Object.entries(mdFiles).map(([filename, main]) => {
  return [filename.replace(/\.md$/, "/"), { main }]
});

export const main = () => modules;
```

By exploiting the fact that `index.html` and `./` fragments in a
relative path are ignored, you can overlay a module tree with other
trees.
This is useful to separate files for each concern regardless of the
hierarchy of destination files.
A typical example is, as shown below, to separate the top page from
other pages that are generated from Markdown files.

```js
export const main = () => ({
  // Only the top page has a special construction.
  'index.html': { main: () => import("./index.jsx") },
  // But others have the same layout and generated in the same way.
  '.': { main: () => import("./pages.js") }
});
```

### Renderers

Renderer is a Minissg's feature that transforms the default export
of a file to a content of a generated file.
To apply a renderer to a file, add `?render` query to the import
referring to the file.

For example, suppose that we are using Minissg with React.
We usually write a React component as a separate file, say
`Count.jsx`, like the following:

```jsx
import { useState } from "react";

export default function Count({ init }) {
  const [count, setCount] = useState(init ?? 0);
  return (
    <button onClick={() => setCount(c => c + 1)}>
      count is {count}
    </button>
  );
};
```

The default export of this file is a React component, which is a
function, not of type `Content` given in the above type
definitions.
Therefore, without any additional conversion, Minissg cannot generate
a file from this module.
The purpose of renderers is to provide this kind of conversion.
By applying the renderer for React components to this file, we
obtain the serialized string of this component.

To apply a renderer to a file, add `?render` query to its import like
this:

```js
import content from "./Count.jsx?render";
```

The `content` variable contains a PromiseLike object of a string
that can be accepted by Minissg as a file content.

The association between files and their renderers is given in
Minissg's `render` option in `vite.config.js`.
The `render` option associates a glob pattern to a renderer.
Minissg searches for a renderer of a particular file in accordance with
this association.
See [Plugin Options](#plugin-options) section for details of the
`render` option.

Minissg provides several renderers for popular component systems
in separate packages.
To use renderers, install the following packages and import them in
`vite.config.js`:

* `@minissg/render-preact` for [Preact] components.
* `@minissg/render-react` for [React] components.
* `@minissg/render-solid` for [Solid] components.
* `@minissg/render-svelte` for [Svelte] components.
* `@minissg/render-vue` for [Vue] components.

Note that using renderers is not essential;
you can avoid it by writing your own serializer by your hand and
include it in server-side code.
You can even write custom renderers and give it to Minissg through
Minissg's `render` option.
See [User-defined Renderer and Hydration](#user-defined-renderer-and-hydration)
section for details.

### DOCTYPE Insertion

HTML files should start with `<!DOCTYPE html>` but `?render` does not emit it.
To add `<!DOCTYPE html>` at the beginning of the result of `?render`,
use `?render&doctype` query instead of `?render`.

For example, suppose that we have `index.html.jsx` of the following code:

```jsx
export default () => (
  <html>
    <head><title>hello</title></head>
    <body>world</body>
  </html>
);
```

and import this file as follows:

```javascript
import content from "./index.html.jsx?render&doctype";
```

The value of `content` is shown below:

``` html
<!DOCTYPE html><html><head><title>hello</title></head><body>world</doby></html>
```

If we don't have `doctype` query in the `import`, `<!DOCTYPE html>` at the
beginning of the above is lost.

`render` always precedes `doctype` in the query; therefore,
`?render&doctype` and `?doctype&render` has the same meaning.

### Style Sheets

Each generated HTML file may have static links to CSS files.
The set of style sheets of each page is the set of all of the `*.css`
files (or other style sheet files supported by Vite) imported in
server-side code in the middle of loading the module corresponding to
the file.

While this looks similar to Vite's default handing of style sheets,
Minissg provides more;
if a dynamic import occurs in the middle of the path to a module,
dynamically imported `*.css` files are also included in the set of
style sheets of that module.
The set of style sheets is computed independently for each module.
For example, suppose the following three files:

1. `index.html.js`
   ```js
   import "./index.css";
   export const main = () => ({
     "foo.html" => { main: () => import("./foo.html.js") },
     "bar.html" => { main: () => import("./bar.html.js") }
   });
   ```
2. `foo.html.js`
   ```js
   import "./foo.css";
   export default "<!DOCTYPE html><html> ... </html>";
   ```
3. `bar.html.js`
   ```js
   import "./bar.css";
   export default "<!DOCTYPE html><html> ... </html>";
   ```

The `index.html.js` file provides the route to two modules
`foo.html` and `bar.html` provided by `foo.html.js` and `bar.html.js`,
respectively.
The `foo.html.js` and `bar.html.js` have `default` export and
consequently `foo.html` and `bar.html` are generated as a result.
The set of style sheets of these two HTML files depends on the path of
execution to these modules as follows.

1. Regardless of the two modules, `index.html.js` must be executed
   and therefore `index.css` is inevitably imported.
   Consequently, a link to `index.css` is included in both `foo.html`
   and `bar.html`.
2. `foo.css` is imported only when `foo.html.js` is dynamically
   imported.
   Hence, `foo.css` is additionally included in `foo.html`.
   Since dynamic import of `foo.html.js` is not relevant to
   `bar.html`, `foo.css` is not included in `bar.html`.
3. Similarly, `bar.css` is included only in `bar.html`.

As a result, the following two links are included in `foo.html`:

```html
<link rel="stylesheet" href="index.css">
<link rel="stylesheet" href="foo.css">
```

and are the following in `bar.html`:

```html
<link rel="stylesheet" href="index.css">
<link rel="stylesheet" href="bar.css">
```

Note that these tags are not what is included exactly in the final
output.
Vite transforms `*.css` files, bundles them appropriately,
and then injects the optimized result in the generated HTML files.

### Client-side Code

All the modules in server-side code are just for server-side file
generation and therefore are not left in the output.
To include some code in the generated site in order to execute it
on client side, import it in server-side code with `?client` query.

For example, suppose the following two files:

1. `index.html.js`
   ```js
   import "./foo.js?client";
   export default `<!DOCTYPE html>
   <html><head><title>Hello</title></head><body></body></html>`;
   ```
2. `foo.js`
   ```js
   document.body.appendChild(document.createTextNode('Hi!'));
   ```

By building the site up with `index.html.js`, we find `dist/index.html`
that refers a script like the following:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Hello</title>
    <script type="module" src="/assets/foo-fd50dfe5.js"></script>
  </head>
  <body></body>
</html>
```

The set of scripts to be included in each page is determined by the
same manner as style sheets;
all the imports with `?client` query executed during loading a module
is included in the output of that module.

The client-side code is processed by Vite as well as server-side code.
This means that you can write client-side code in any language
that Vite (or one of its plugin) supports.
Vite translates client-side code and minifies all its chunks as usual.
Minissg does not throw anything more at Vite, but does not take
anything more from Vite.

### Partial Hydration

Minissg provides a simple partial hydration mechanism
in the sense of [island architecture] for several component systems.
To enable partial hydration for a component, import the component
with `?hydrate` query.
The code imported with `?hydrate` query is included in both
server-side and client-side code to embed its initial view in the
static file and to hydrate the view in the web browsers.

As an example, here we attempt to use the `Count.jsx` presented in
[Renderers](#renderers) section.
At first, To enable partial hydration feature for `*.jsx` files,
associate `**/*.jsx` to React renderer in Minissg plugin's `render`
option.

By importing `Count.jsx` with `?hydrate` query as follows, we turn on
the hydration of this component:

```jsx
import Count from "./Count.jsx?hydrate";

export default function() {
  return <html><head></head><body><Count init={3} /></body></html>;
};
```

This results in the following output:

```html
<html>
  <head>
    <script type="module" src="/assets/hydrate-7c5f4dec.js"></script>
  </head>
  <body>
    <div data-hydrate="g_zZoKsE" data-hydrate-args="{&quot;init&quot;:3}">
      <button>count is 3</button>
    </div>
  </body>
</html>
```

The `/assets/hydrate-7c5f4dec.js` file is the top-level client-side
code that hydrates the `Count` component.
It searches for the element with `data-hydrate="g_zZoKsE"` attribute
for the target of hydration, where `"g_zZoKsE"` is the unique
identifier of the `Count` component.
The `data-hydrate-args` attribute holds the serialized argument of
`Count` component, which is passed to the component for hydration.

Note that this is not the only way for hydration in Minissg.
You can hydrate a component in a different way than `?hydrate` by
writing it in your program.
Minissg does not force you anything.

## Advanced Features

### Configuring Each Run Differently

As described above, Vite runs twice for static site generation.
The two runs are for different purposes and therefore may have
different settings.
The top-level config of `vite.config.js` is shared in both runs.
To configure a specific run, use the `environments` config of
`vite.config.js`.
The server-side and client-side runs are in `ssr` and `client`
environment, respectively.
For example, to turn on the sourcemap generation only in server-side run,
write `vite.config.js` as follows:

```js
import { defineConfig } from "vite"

export default defineConfig({
  environment: {
    ssr: {
      build: {
        sourcemap: true // enable sourcemap generation only in server-side run
      }
    }
  },
  plugins: [
    minissg({
      input: "./index.html.js"
    })
  ]
})
```

The order of environemnt settings in the `environemnt` config is significant.
Minissg requires that `ssr` environment must precede to `client` environment;
therefore, `ssr` must appear at first and then `client` appears in
`environment`.

### Generating Data for Client-side Code

Minissg allows server-side code to generate specific data for each
client-side code.
For this purpose, importing with `?client` query provides us with a
mutable object that holds data to be passed to the client-side code.
Client-side code can refer to such data by importing a virtual module
named `virtual:minissg/self?client`.

Suppose that we have a client-side code `foo.js` and attempt to pass
some data to it from server-side code.
This can be done by manipulating the default export of
`foo.js?client`.
For example, the following code

```js
import data from "./foo.js?client";

data["bar"] = "baz";
```

puts a string `"baz"` with the key `"bar"` in the object to be passed
to `foo.js`.
Minissg serialize this object in JSON and generate a client-side
module that provides the JSON object.
Because of this implementation, the values put in this object must be
serializable by `JSON.stringify`.

In client-side code, import `virtual:minissg/self?client` in `foo.js`
to have an access to the object passed from the server-side code.
For example, in `foo.js`, the following client-side code

```js
import data from "virtual:minissg/self?client";

console.log(data["bar"]);
```

will print `baz` in the web browser's console.

The object imported by `?client` query has `id` property as its
initial content.
The value of the `id` property is a string of a unique identifier of
this client-side module.
You can overwrite or delete it if it is not needed.
A supposed usage of `id` is to find particular HTML elements
generated by server-side code from client-side code.

### Renderer for a Module Itself

Sometimes it is convenient if a module can obtain the renderer
associated to itself.
A special module named `virtual:minissg/self?renderer` provides it.
The default export of `virtual:minissg/self?renderer` is the rendering
function of the importer.
The actual type of the rendering function depends on its definition.

A typical example of using this feature is that a module has multiple
children of the same type and renders them in the same way.
The following is an example of JSX file that aggregates MDX files:

```jsx
import render from "virtual:minissg/self?renderer";

// common layout for all MDX files
const Layout = ({ children }) => {
  return <html><head></head><body>{children}</body></html>;
};

const pages = import.meta.glob("./**/*.mdx");
const modules = Object.entries(pages).map(([filename, load]) => {
  const main = async () => {
    // load an MDX file and compose it with Layout.
    const Component = await load();
    const Page = () => <Layout><Component /></Layout>;
    // serialize the composed component.
    return render(Page);
  };
  return [filename.replace(/mdx$/, "html"), { main }]
});

export const main = () => modules;
```

### User-defined Renderers and Hydration

A renderer is actually an object representing a collection of
functions that return code in a string.
Minissg calls one of these function in accordance with `?render`
and/or `?hydrate` queries to obtain the code that implements the
feature specified by those queries.
The type of renderers is given below in TypeScript:

```typescript
type Renderer = {
  render?: {
    server?: (arg: { parameter: string }) => string | PromiseLike<string>;
    client?: (arg: { parameter: string }) => string | PromiseLike<string>;
  };
  hydrate?: {
    server: (arg: HydrateArg) => string | PromiseLike<string>;
    client: (arg: HydrateArg) => string | PromiseLike<string>;
  };
};

type HydrateArg = {
  id: string;
  moduleId: string;
  parameter: string;
};
```

A renderer can provide two properties `render` and `hydrate`, which
are associated to `?render` and `?hydrate` queries, respectively.
Both of them may have two variants: `server` for server-side code
generation, and `client` for client-side.
All of the functions in a renderer must return a string of the source
code of an ES6 module.
Except for `hydrate.server`, the code must be written in vanilla
JavaScript.
The code returned by `hydrate.client` must be written in the same
language as the file that `?hydrate` query is given.

Each function in `render` must return a string of the source code of
an ES6 module whose default export is the rendering function, which
serializes the given data or component into a format specified in
the `Content` type described in [Module Tree](#module-tree) section.
The `render` functions takes one argument, namely `parameter`, which
holds the value of `?render` query.

The code generated by `hydrate.server` must be a component that wraps
the original component with hydration target container.
The `hydrate.server` function is given an argument of `HydrateArg`
type, which has three properties:
`id` for a unique identifier of this component,
`moduleId` for the identifier of the original file, and
`parameter` for the value of `?hydrate` query.
Both `hydrate.server` and `hydrate.client` functions are called with
the identical argument for each import.

The code generated by `hydrate.client` must be a JS code that can be
embedded in an `<script type="module">` element of an HTML document.
The code must import the same component as server-side code,
determine the target element of hydration, and perform the hydration.

### Mixing Components of Different Systems

Minissg never dismiss any mixture of different component systems not
only in a single site but even in a single page.
Since string is the most common representation of components,
by applying renderers to components, serializing them into strings,
and combining them as strings,
you can freely mix any component of different component systems in a
page.

This is obviously true even if the partial hydration feature is used.
Vite and Rollup's bundling mechanism and Minissg's `?hydrate` feature
computes the dependencies of files and libraries appropriately.
As a natural result, the generated site includes the minimum set of
library codes and hydration wrappers.

### Contextual Information of Modules

The `main` function of a module is given an object that offers the
following information:
* `module`: The module itself.
* `moduleName`: The full name of the module.
  This would be convenient to compute the canonical URL of each
  module.
  This is a `ModuleName`, which is a class having a property `path`
  and three instance methods `fileName`, `join`, and `isIn`.
  It is ensured that the `path` property does not start with `/`.
* `request`: information for dynamic routing and server-side
  rendering.
  If it is given, the `main` function may dynamically create and return
  a module depending on it.
  Note that Minissg is a static site generator, not a web application
  framework.
  Currently, we do not have any plan to enhance this feature.
* `path`: relative path string from the parent module, or `undefined` if
  the module is either the root or made by the `main` function of the
  parent module.
* `parent`: the context of the parent module, or `undefined` if this
  module is the root of the module tree.
* `loaded`: the set of Vite's module identifiers that are dynamically
  imported in the current context.
  See [Manipulating the Effect of Dynamic Imports](#manipulating-the-effect-of-dynamic-imports)
  for the usage of this information.

The type of the argument of the `main` function, `Context`,
is defined as follows in TypeScript:

```typescript
type Context = {
  moduleName: ModuleName;
  module: Module;
  request?: Readonly<Request> | undefined;
  path?: string | undefined;
  parent?: Readonly<Context> | undefined;
  loaded?: Set<string> | undefined;
}

type Request = {
  requestName: ModuleName;
  incoming: import("node:http").IncomingMessage;
}

type ModuleName = {
  readonly path: string
  fileName(): string
  join(path: string): ModuleName;
  isIn(other: ModuleName): boolean;
}
```

### Manipulating the Effect of Dynamic Imports

As described in [Style Sheets](#style-sheets) section,
Minissg exploits the effect of dynamic imports to associate style sheets
and other assets to the generated pages.
However, we sometimes want fine-grained control over the set of assets
imported, such as importing some modules without associating them with
any specific assets.
Typical examples include the case when you want to read the frontmatter
of an MDX module regardless of any relationship between the module and
current page.

For this purpose, Minissg makes `loaded` set public in the `Context`
structure.
By manipulating the `loaded` set, you can manipulate the set of assets
associated to the current context.
For example, the following function ignores assets loaded during the
execution of the given function:

```js
function peek(context, f) {
  const { loaded } = context
  const original = new Set(loaded ?? [])  // save the current loaded set
  try {
    f()  // this may add some modules in the loaded set
  } finally {
    loaded.clear()  // revert the loaded set to the saved set
    for (const i of original) loaded.add(i)
  }
}
```

### Debugging Server-side Code

When an error occurred during the execution of server-side code,
Vite prints the current stack trace and then aborts.
Source map helps you find where the error occurred in server-side
code.

To make source maps available in `vite build`, the following settings
are needed:

1. Turn on `environment.ssr.build.sourcemap` in `vite.config.js` in
   order to provide the sourcemaps of server-side code.
2. Set `NODE_OPTIONS` environment variable to `--enable-source-maps`.

Note that the `enviornment.ssr.build.sourcemap` option changes the
build result.
If you do not want to include source maps in your product,
turn it on only in the development mode.

Sometimes you maybe want to check the generated code by server-side
run.
To prevent Vite from removing it, set Minissg's `clean` option to
`false`.
This is just for development use; `clean` should not be `false` in
production mode.

## Plugin Options

### `input`

| type                                           | default |
|------------------------------------------------|---------|
| `string \| string[] \| Record<string, string>` | `[]`    |

The `input` option specifies Minissg's entry scripts.
Setting this option is practically mandatory;
without this, Minissg does not produce anything.

### `clean`

| type      | default     |
|-----------|-------------|
| `boolean` | `true`      |

The `clean` option is the flag indicating whether or not Minissg
removes intermediate chunks, such as server-side code.

This is provided for debugging.
See [Debugging Server-side Code](#debugging-server-side-code) section
for details.

### `plugins`

| type                                 | default     |
|--------------------------------------|-------------|
| `import("vite").PluginOptions`       | `() => []`  |

The `plugins` option has an array of plugins used in combination with
Minissg.
The `plugins` array of `vite.config.js` must be a singleton.
For example, do not write as follows:

``` js
export default defineConfig({
  plugins: [
    minissg({ input: "./index.html.js" }),
    react() // NG
  ]
})
```

The above must be written as follows:

``` js
export default defineConfig({
  plugins: [
    minissg({
      input: "./index.html.js",
      plugins: [react()]
    }),
  ]
})
```

### `render`

| type                                               | default   |
|----------------------------------------------------|-----------|
| `Record<string, Renderer> \| Iterable<RenderItem>` | `{}`      |

This associates source files to renderers.
The association must be specified in one of the following forms:

1. An object whose property names are glob patterns and values are
   renderers.
2. An array of objects, each of which is of the following type:
   ```typescript
   type RenderItem = {
     include?: (string | RegExp)[] | string | RegExp | null | undefined;
     exclude?: (string | RegExp)[] | string | RegExp | null | undefined;
     renderer?: Renderer | null | undefined;
   }
   ```
   The `renderer` is associated to files that matches with `include`
   but does not match with `exclude`.

## Tips and Notes

* It is possible to import the same file both in server-side and
  client-side, but it may cause some problems in building related to
  some Rollup plugins.
  Minissg sometimes add `?MINISSG-COPY` query at the end of file
  names and duplicate codes in order to separate server-side codes
  from client-side resources.
  This changes the suffix of a file name, preventing some Rollup
  plugins from accepting a file with a particular suffix.
  Examples of such plugins include `@mdx-js/rollup`.
  For example, applying partial hydration to an MDX component usually
  cause this issue.

  If you encounter this issue and want to avoid it, configure plugins
  so that they can accept files even with the `?MINISSG-COPY` suffix.
  For example, set the following options to `@mdx-js/rollup`:

  ```js
  mdx({ mdxExtensions: ['.mdx', '.mdx?MINISSG-COPY' ] })
  ```

* Minissg often prevents Vite's optimizeDeps feature from working as
  expected for some reasons including the following:
  * Minissg sets a virtual module to `build.rollupOptions.input` and
    therefore optimizeDeps cannot find the actual entry scripts.
  * Even if optimizeDeps can find entries, those in Minissg is for
    server-side codes, whereas optimizeDeps is for client-side codes.
  * Minissg introduces virtual modules on the boundary between
    server-side and client-side.
    Because optimizeDeps does not dive into virtual modules, it cannot
    reach any client-side codes.
  Hence, Minissg avoids optimizeDeps by default by giving an empty
  array to `optimizeDeps.entries` option.

  To make optimizeDeps with Minissg work as expected, you should need
  to list package names to be optimized in `optimizeDeps.include`
  options.
  For example, if you use Vue in your project and apply optimizeDeps
  to it, add the following to `vite.config.js`:

  ```js
  export default defineConfig({
    optimizedeps: { include: ['vue'] }
  })
  ```

  Some Vite plugins, such as [@vitejs/plugin-react] and
  [@preact/preset-vite], add an appropriate list of packages to
  `optimizeDeps.include` automatically.

* Minissg preserves the Vite's original HTML support.
  Actually, Minissg deals with HTML files in the same way as asset
  files.
  If an HTML file is found in `build.rollupOptions.input` or an
  `import`, it is transformed by Vite (and its plugins) and included
  in the destination site as expected.

* CSS modules in server-side code usually does not work as expected.
  Since Vite 5.2.0, CSS modules are tree-shaken: if a CSS module is imported
  but not referred from any client-side code, the CSS module is eliminated
  completely by tree-shaking at client side run.

  Even if we could turn off the tree-shaking, an empty JS chunk would be
  generated unexpectedly.
  Such an empty chunk appears because of the following reason.
  The JS code generated from a CSS module is so simple that minifier can
  remove it at all when it is not used.
  While the content of the chunk corresponding to the CSS module becomes
  empty by minifier, the chunk itself cannot be removed because tree-shaking
  is turned off.

  To avoid confusion, it is recommended not to use CSS module with Minissg.
  Instead of CSS modules, use another technologies for modular styling
  such as [linaria].

## License

MIT

[Minissg]: https://github.com/uenoB/minissg
[tiged]: https://github.com/tiged/tiged
[React]: https://react.dev
[@mdx-js/rollup]: https://mdxjs.com/packages/rollup/
[@vitejs/plugin-react]: https://github.com/vitejs/vite-plugin-react
[@preact/preset-vite]: https://github.com/preactjs/preset-vite
[Preact]: https://preactjs.com
[Solid]: https://www.solidjs.com
[Svelte]: https://svelte.dev
[Vue]: https://vuejs.org
[MDX]: https://mdxjs.com
[Markdown]: https://commonmark.org
[island architecture]: https://jasonformat.com/islands-architecture/
[`--enable-source-maps` option]: https://nodejs.org/api/cli.html#--enable-source-maps
[linaria]: https://linaria.dev
