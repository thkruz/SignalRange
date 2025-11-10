// Polyfill for structuredClone in Jest environment
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
  };
}