import { ModuleName } from '../../vite-plugin-minissg/src/module'
import type { Null } from '../../vite-plugin-minissg/src/util'

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

  static empty = new PathSteps([])

  static fromRelativeModuleName(path: string | Null): PathSteps {
    if (path == null || path === '') return new PathSteps([])
    try {
      path = ModuleName.root.join('./' + path).path
    } catch {}
    return new PathSteps(path === '' ? [''] : path.split('/'))
  }

  static fromRelativeFileName(name: string | Null): PathSteps {
    const path = PathSteps.normalize(name ?? '')
    return new PathSteps(path === '' ? [] : path.split('/'))
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

export interface RelPath {
  moduleName: string
  stem: string
  variant: string
  fileName: string
}

export const concatName = (
  base: ModuleName | Null,
  path: string | Null
): ModuleName => (base ?? ModuleName.root).join(path ?? '')

export const concatFileName = (
  base: FileName | Null,
  path: string | Null
): FileName => (base ?? FileName.root).join(path ?? '')
