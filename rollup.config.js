import * as fs from 'node:fs'
import * as path from 'node:path'
import esbuild from 'rollup-plugin-esbuild'
import terserPlugin from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { packageList } from './release/package-list.js'

const terser = () =>
  terserPlugin({
    ecma: 2022,
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
  buildStart: () => fs.rmSync(outDir, { recursive: true, force: true })
})

const copyLicense = dir => ({
  name: 'copyFiles',
  closeBundle() {
    fs.copyFileSync('LICENSE', path.join(dir, 'LICENSE'))
  }
})

const externalNames = ({ packageJson }) => [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {})
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
  const input = path.join(pkg.dir, 'src/index.ts')
  const outDir = path.join(pkg.dir, 'dist/')
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
      plugins: [dts(), copyLicense(pkg.dir)],
      input,
      output: [
        { dir: outDir, entryFileNames: '[name].d.ts' },
        { dir: outDir, entryFileNames: '[name].d.cts' }
      ]
    }
  ]
}

export default packageList.map(build).flat()
