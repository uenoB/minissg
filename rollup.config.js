import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'rollup-plugin-esbuild'
import terserPlugin from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'

const readDir = url => readdirSync(url).map(i => new URL(`${i}/`, url))
const readJson = url => JSON.parse(readFileSync(new URL('package.json', url)))
const readPackage = url => ({ url, json: readJson(url) })

const baseURL = new URL('.', import.meta.url)
const packages = readDir(new URL('packages/', baseURL)).map(readPackage)
const toRelPath = url => relative(fileURLToPath(baseURL), fileURLToPath(url))

const terser = () =>
  terserPlugin({
    ecma: '2022',
    compress: {
      join_vars: false,
      sequences: false,
      lhs_constants: false,
      reduce_funcs: false,
      keep_fnames: /Middleware$/
    },
    mangle: false,
    output: {
      comments: false,
      beautify: true,
      indent_level: 2,
      semicolons: false,
      preserve_annotations: true
    }
  })

const cleanup = outDir => ({
  name: 'cleanup',
  buildStart: () => rmSync(outDir, { recursive: true, force: true })
})

const externalNames = ({ json }) => [
  ...Object.keys(json.dependencies ?? {}),
  ...Object.keys(json.peerDependencies ?? {})
]

const esmOutput = {
  format: 'es',
  sourcemap: true,
  sourcemapExcludeSources: true
}

const cjsOutput = {
  format: 'cjs',
  entryFileNames: '[name].cjs',
  exports: 'named',
  esModule: true,
  sourcemap: true,
  sourcemapExcludeSources: true
}

const build = pkg => {
  const external = new Set(externalNames(pkg))
  const input = toRelPath(new URL('src/index.ts', pkg.url))
  const outDir = toRelPath(new URL('dist/', pkg.url))
  return [
    {
      external: [...external, /^node:/],
      plugins: [cleanup(outDir), esbuild({ target: 'es2022' }), terser()],
      input,
      output: [
        { ...esmOutput, dir: outDir },
        { ...cjsOutput, dir: outDir }
      ]
    },
    {
      external: [...external, /^node:/],
      plugins: [dts()],
      input,
      output: [
        { dir: outDir, entryFileNames: '[name].d.ts' },
        { dir: outDir, entryFileNames: '[name].d.cts' }
      ]
    }
  ]
}

export default packages.map(build).flat()
