import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import standard from 'eslint-config-standard'
import reactRecommended from 'eslint-plugin-react/configs/recommended.js'
const rc = new FlatCompat({ baseDirectory: fileURLToPath(import.meta.url) })

const modificationToStandardJs = {
  // Turn off rules in `standard` conflicting with Prettier
  indent: 'off',
  'space-before-function-paren': [
    'error',
    {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }
  ],
  'generator-star-spacing': 'off',
  'yield-star-spacing': 'off',
  // make some rules more strict
  'no-unused-vars': [
    'error',
    {
      ...standard.rules['no-unused-vars'][1],
      args: 'all',
      argsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_'
    }
  ]
}

const modificationToStandardTs = {
  ...(() => {
    const rules = {}
    for (const [k, v] of Object.entries(modificationToStandardJs)) {
      const tsk = `@typescript-eslint/${k}`
      rules[tsk in typescriptEslint.configs.all.rules ? tsk : k] = v
    }
    return rules
  })(),
  // Turn off rules in `standard` conflicting with Prettier
  '@typescript-eslint/member-delimiter-style': [
    'error',
    {
      multiline: { delimiter: 'none' },
      singleline: { delimiter: 'semi', requireLast: false }
    }
  ],
  // make some rules more permissive
  '@typescript-eslint/no-invalid-void-type': [
    'error',
    { allowAsThisParameter: true }
  ]
}

const expand = config => {
  const { extends: ext, ...rest } = config
  const configs = Array.isArray(ext) ? ext : [ext]
  const selector = {}
  if (rest.files != null) selector.files = rest.files
  if (rest.ignores != null) selector.ignores = rest.ignores
  const extensions = rc.extends(...configs).map(c => ({ ...c, ...selector }))
  return [...extensions, rest]
}

export default [
  {
    ignores: ['**/dist/**/*', 'packages/vite-plugin-minissg/client.d.ts']
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      'max-len': ['error', { code: 80 }]
    }
  },
  js.configs.recommended,
  ...expand({
    extends: [
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
      'plugin:@typescript-eslint/strict'
    ],
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: fileURLToPath(new URL('tsconfig.json', import.meta.url))
      }
    }
  }),
  ...expand({
    extends: 'standard',
    files: ['**/*.{js,jsx}'],
    rules: modificationToStandardJs
  }),
  ...expand({
    extends: 'standard-with-typescript',
    files: ['**/*.ts'],
    rules: modificationToStandardTs
  }),
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ...reactRecommended,
    settings: { react: { version: '16.0' } },
    files: ['**/*.jsx']
  },
  {
    files: ['**/*.jsx'],
    rules: {
      'react/jsx-uses-react': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off'
    }
  },
  {
    files: ['**/template/{mdx,preact,solid}/**/*.jsx'],
    rules: {
      'react/no-unknown-property': ['error', { ignore: ['class'] }]
    }
  },
  ...expand({
    extends: 'plugin:svelte/recommended',
    files: ['**/*.svelte']
  }),
  ...expand({
    extends: 'plugin:vue/vue3-recommended',
    files: ['**/*.vue'],
    rules: {
      // Turn off rules conflicting with Prettier
      'vue/html-self-closing': ['error', { html: { void: 'always' } }],
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off'
    }
  })
]
