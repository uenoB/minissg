import { test, expect } from 'vitest'
import { build } from './build'
import ssg from '../src/index'

test('README: Hello, World', async () => {
  await expect(
    build({
      'index.html.js': `
        export default \`<!DOCTYPE html>
        <html>
          <head><title>My first Minissg site</title></head>
          <body><h1>Hello, Vite + Minissg!</h1></body>
        </html>\`;`
    })
  ).resolves.toStrictEqual({
    'index.html':
      '<!DOCTYPE html>\n<html>\n  <head><title>My first Minissg site</title></head>\n  <body><h1>Hello, Vite + Minissg!</h1></body>\n</html>'
  })
})

test('README: Multiple Page Generation 1', async () => {
  await expect(
    build(
      {
        'index.html.js': `
        export default \`<!DOCTYPE html>
        <html>
          <head><title>My first Minissg site</title></head>
          <body><h1>Hello, Vite + Minissg!</h1></body>
        </html>\`;`,
        'hello.txt.js': `
        export default "Hello\\n";`
      },
      dir => ({
        environments: {
          ssr: {
            build: {
              rollupOptions: {
                input: [dir('index.html.js'), dir('hello.txt.js')]
              }
            }
          }
        },
        plugins: [ssg()]
      })
    )
  ).resolves.toStrictEqual({
    'index.html':
      '<!DOCTYPE html>\n<html>\n  <head><title>My first Minissg site</title></head>\n  <body><h1>Hello, Vite + Minissg!</h1></body>\n</html>',
    'hello.txt': 'Hello\n'
  })
})

test('README: Multiple Page Generation 2', async () => {
  await expect(
    build({
      'index.html.js': `
        export const main = () => ({
          'index.html':
            {
              default: \`<!DOCTYPE html>
                <html>
                  <head><title>My first Minissg site</title></head>
                  <body><h1>Hello, Vite + Minissg!</h1></body>
                </html>\`
            },
          'hello.txt': { default: "Hello\\n" }
        })`
    })
  ).resolves.toStrictEqual({
    'index.html':
      '<!DOCTYPE html>\n        <html>\n          <head><title>My first Minissg site</title></head>\n          <body><h1>Hello, Vite + Minissg!</h1></body>\n        </html>',
    'hello.txt': 'Hello\n'
  })
})
