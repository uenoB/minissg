import { ModuleName } from '../../vite-plugin-minissg/src/module'

const dirPath = (path: string): string => path.replace(/(^|\/)[^/]+$/, '$1')

export class PathSteps {
  readonly path: readonly string[]

  static normalize(path: string): string {
    path = path.replace(/(^|\/)(?:\.?(?:\/|$))+/g, '$1')
    for (;;) {
      const s = path.replace(/(^|\/)(?!\.\.(?:\/|$))[^/]+\/\.\.(?:\/|$)/g, '$1')
      if (s === path) return path
      path = s
    }
  }

  private constructor(path: readonly string[]) {
    this.path = path
  }

  static fromRelativeModuleName(name: string): PathSteps {
    if (name === '') return new PathSteps([])
    const { path } = ModuleName.root.join(name)
    return new PathSteps(path === '' ? [''] : path.split('/'))
  }

  static fromRelativeFileName(name: string): PathSteps {
    const path = PathSteps.normalize(name)
    return new PathSteps(path === '' ? [] : path.split('/'))
  }

  toRelativeModuleName(): string {
    return this.path.length === 1 && this.path[0] === ''
      ? '.'
      : this.path.join('/')
  }

  toRelativeFileName(): string {
    return this.path.length === 1 && this.path[0] === ''
      ? ''
      : this.path.join('/')
  }

  get length(): number {
    return this.path.length
  }

  get last(): string | undefined {
    return this.path[this.path.length - 1]
  }

  chop(): PathSteps {
    return new PathSteps(this.path.slice(0, this.path.length - 1))
  }
}

export class FileName {
  readonly path: string

  private constructor(path: string) {
    this.path = path
  }

  static readonly root = Object.freeze(new FileName(''))

  join(path: string): FileName {
    return path === '' ? this : new FileName(dirPath(this.path) + path)
  }

  dirName(): FileName {
    return new FileName(dirPath(this.path))
  }
}
