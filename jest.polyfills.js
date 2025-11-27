// This file runs before the test environment is set up
// Use it for polyfills that need to be available before module imports

// Mock performance API (needed before modules are imported)
// Note: Can't use jest.fn() here as Jest APIs aren't available yet in setupFiles
globalThis.performance = {
  now: () => Date.now(),
  timing: {},
  navigation: {},
  timeOrigin: Date.now(),
  mark: () => { },
  measure: () => { },
  clearMarks: () => { },
  clearMeasures: () => { },
  getEntries: () => [],
  getEntriesByName: () => [],
  getEntriesByType: () => [],
};
