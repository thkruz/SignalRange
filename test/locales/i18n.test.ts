import { vi } from 'vitest';
import { addLocaleBundle, currentLanguage, DEFAULT_LOCALE, hasLocaleKey, resetLocales, SUPPORTED_LOCALES, setLanguage, t7e } from '../../src/locales/i18n';

describe('i18n', () => {
  beforeEach(() => {
    resetLocales();
  });

  afterEach(() => {
    resetLocales();
    vi.restoreAllMocks();
  });

  it('bundles English only and starts there', () => {
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toEqual(['en']);
    expect(currentLanguage()).toBe(DEFAULT_LOCALE);
  });

  it('translates a bundled key', () => {
    expect(t7e('loadout.title')).toBe('Station Loadout');
  });

  it('interpolates {{params}}', () => {
    expect(t7e('loadout.sourcePlugin', { name: 'ExamplePlugin' })).toBe('plugin: ExamplePlugin');
  });

  it('leaves an unknown placeholder untouched', () => {
    addLocaleBundle('en', { test: { greeting: 'Hi {{name}}, {{missing}}' } });

    expect(t7e('test.greeting', { name: 'Ted' })).toBe('Hi Ted, {{missing}}');
  });

  it('returns the key and warns once for a missing key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(t7e('nope.nothing')).toBe('nope.nothing');
    expect(t7e('nope.nothing')).toBe('nope.nothing');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns the key when the path resolves to an object rather than a string', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(t7e('loadout')).toBe('loadout');
  });

  it('merges a plugin bundle without clobbering host keys', () => {
    addLocaleBundle('en', { plugins: { ExamplePlugin: { antennaName: 'Example 4.5m Ka-Band' } } });

    expect(t7e('plugins.ExamplePlugin.antennaName')).toBe('Example 4.5m Ka-Band');
    expect(t7e('loadout.title')).toBe('Station Loadout');
    expect(hasLocaleKey('plugins.ExamplePlugin.antennaName')).toBe(true);
  });

  it('lets a later bundle override an earlier one', () => {
    addLocaleBundle('en', { plugins: { A: { x: 'first' } } });
    addLocaleBundle('en', { plugins: { A: { x: 'second', y: 'kept' } } });

    expect(t7e('plugins.A.x')).toBe('second');
    expect(t7e('plugins.A.y')).toBe('kept');
  });

  it('does not let a bundle mutate the caller object later', () => {
    const bundle = { plugins: { B: { label: 'before' } } };

    addLocaleBundle('en', bundle);
    bundle.plugins.B.label = 'after';

    expect(t7e('plugins.B.label')).toBe('before');
  });

  it('rejects an unbundled language and keeps the current one', () => {
    expect(setLanguage('fr')).toBe(false);
    expect(currentLanguage()).toBe('en');
    expect(setLanguage('en')).toBe(true);
  });

  it('resets to the bundled English only', () => {
    addLocaleBundle('en', { plugins: { C: { z: 'z' } } });
    resetLocales();

    expect(hasLocaleKey('plugins.C.z')).toBe(false);
    expect(hasLocaleKey('loadout.title')).toBe(true);
  });

  it('ignores __proto__ in a plugin bundle instead of polluting Object.prototype', () => {
    addLocaleBundle('en', JSON.parse('{"__proto__": {"polluted": "yes"}, "plugins": {"P": {"__proto__": {"polluted": "yes"}, "ok": "fine"}}}'));

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(t7e('plugins.P.ok')).toBe('fine');
  });
});
