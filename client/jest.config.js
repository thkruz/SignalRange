module.exports = {
  testEnvironment: 'jsdom',
  testMatch: [
    '**/test/?(*.)+(spec|test).js?(x)',
    '**/test/?(*.)+(spec|test).ts?(x)'
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/test/mock/styleMock.js',
    '\\.(jpg|ico|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/test/mock/fileMock.js',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  setupFiles: ["jest-canvas-mock"],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest'
  }
};