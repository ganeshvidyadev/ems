/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Source uses explicit .js extensions (correct for the emitted CJS); Jest
  // resolves against .ts sources, so strip the extension during tests.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/index.ts'],
  coverageDirectory: '../coverage',
};
