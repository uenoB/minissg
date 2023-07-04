import { readdirSync, readFileSync, rmSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import terserPlugin from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import dtsPlugin from 'rollup-plugin-dts'

const baseURL = new URL('.', import.meta.url)
const baseDir = fileURLToPath(baseURL)
const outDir = fileURLToPath(new URL('dist/', baseURL))
const packageJson = JSON.parse(readFileSync(new URL('package.json', baseURL)))
const renderers = Object.fromEntries(
  readdirSync(path.join(baseDir, 'src/renderer'))
    .filter(i => i.endsWith('.ts'))
    .map(i => [i.replace(/\.ts$/, ''), path.join('src/renderer', i)])
)

const dts = () =>
  dtsPlugin({
    tsconfig: 'tsconfig.json',
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      noEmitOnError: true
    }
  })

const terser = () =>
  terserPlugin({
    ecma: '2020',
    compress: {
      join_vars: false,
      sequences: false,
      lhs_constants: false,
      reduce_funcs: false
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

const cleanup = () => ({
  name: 'cleanup',
  buildStart: () => rmSync(outDir, { recursive: true, force: true })
})

const externalize = map => ({
  name: 'externalize',
  resolveId: id => (id in map ? { id: map[id], external: true } : null)
})

const external = [
  ...Object.keys(packageJson.dependencies),
  ...Object.keys(packageJson.peerDependencies),
  /^node:/
]

const esmOutput = {
  format: 'es',
  sourcemap: true,
  sourcemapExcludeSources: true
}

const cjsOutput = {
  format: 'cjs',
  entryFileNames: '[name].cjs',
  chunkFileNames: '[name].cjs',
  exports: 'named',
  esModule: true,
  sourcemap: true,
  sourcemapExcludeSources: true
}

export default [
  {
    external,
    plugins: [cleanup(), typescript(), terser()],
    input: 'src/index.ts',
    output: [
      { ...esmOutput, dir: outDir },
      { ...cjsOutput, dir: outDir }
    ]
  },
  {
    external,
    plugins: [externalize({ '../index': '../index.js' }), typescript()],
    input: renderers,
    output: { ...esmOutput, dir: path.join(outDir, 'renderer') }
  },
  {
    external,
    plugins: [externalize({ '../index': '../index.cjs' }), typescript()],
    input: renderers,
    output: { ...cjsOutput, dir: path.join(outDir, 'renderer') }
  },
  {
    external,
    plugins: [dts()],
    input: 'src/index.ts',
    output: { dir: outDir }
  },
  {
    external,
    plugins: [externalize({ '../index': '../index.js' }), dts()],
    input: renderers,
    output: { dir: path.join(outDir, 'renderer') }
  }
]
