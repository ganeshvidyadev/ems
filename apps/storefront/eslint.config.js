const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  { ignores: ['.next/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];
