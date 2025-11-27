module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig-jest.json',
    },
  },
  testEnvironment: 'jsdom',

  testMatch: [
    '**/test/**/*.(spec|test).js?(x)',
    '**/test/**/*.(spec|test).ts?(x)'
  ],

  coveragePathIgnorePatterns: ['node_modules/', 'dist/', 'src/engine/', 'src/engine/ootk/'],

  testPathIgnorePatterns: ['node_modules/', 'dist/', 'src/engine/'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/test/mock/styleMock.js',
    '\\.(jpg|ico|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/test/mock/fileMock.js',
    './webpack-hot-module': '<rootDir>/test/mock/fileMock.js',
    '^@app/(.*)$': '<rootDir>/src/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  setupFiles: ["jest-canvas-mock", '<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|ootk)/)'
  ],
};