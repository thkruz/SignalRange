// This file runs before the test environment is set up
// Use it for polyfills that need to be available before module imports

// Mock performance API (needed before modules are imported)
// Note: Can not use jest.fn() here as Jest APIs are not available yet in setupFiles
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

// Mock fetch API (jsdom does not provide it)
// This placeholder allows jest.spyOn(global, fetch) to work in tests
if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = () => Promise.reject(new Error("fetch not mocked"));
}
