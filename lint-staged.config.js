export default {
  '*.{js,cjs,jsx}': ['prettier -c', 'eslint'],
  '*.ts': ['prettier -c', () => 'tsc', 'eslint', () => 'vitest run'],
  '*.json': ['prettier -c'],
  '*.css': ['prettier -c', 'stylelint'],
  '*.{svelte,vue}': ['prettier -c', 'eslint', 'stylelint']
}
