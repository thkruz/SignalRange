import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: ['src/engine/**', 'dist/**', 'coverage/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/no-unresolved': 'error',
    },
  },
];
