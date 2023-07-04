module.exports = {
  extends: ['stylelint-config-standard', 'stylelint-config-recess-order'],
  overrides: [
    {
      files: '**/*.svelte',
      customSyntax: 'postcss-html',
      rules: {
        'selector-pseudo-class-no-unknown': [
          true,
          { ignorePseudoClasses: ['global'] }
        ]
      }
    },
    {
      files: '**/*.vue',
      customSyntax: 'postcss-html'
    }
  ]
}
