import { vi } from 'vitest';
import { SettingsManager } from '../../src/settings/settings-manager';

describe('SettingsManager', () => {
  const resetUrl = (): void => {
    window.history.replaceState({}, '', '/');
  };

  beforeEach(() => {
    localStorage.clear();
    delete window.settingsOverride;
    resetUrl();
    SettingsManager.destroy();
  });

  afterEach(() => {
    SettingsManager.destroy();
    delete window.settingsOverride;
    resetUrl();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts empty with no override', () => {
    const settings = SettingsManager.getInstance();

    expect(settings.settings.plugins).toEqual({});
    expect(settings.settings.isStrictPluginList).toBe(false);
    expect(settings.settings.language).toBe('en');
    expect(settings.overrideSource).toBeNull();
    expect(settings.isPluginEnabled('Anything')).toBe(false);
  });

  it('takes plugin defaults from the manifest', () => {
    const settings = SettingsManager.getInstance();

    settings.applyPluginDefaults([
      ['A', { enabled: true, order: 10 }],
      ['B', { enabled: false }],
    ]);

    expect(settings.isPluginEnabled('A')).toBe(true);
    expect(settings.isPluginEnabled('B')).toBe(false);
    expect(settings.settings.plugins.A.order).toBe(10);
  });

  it('persists a user toggle across instances', () => {
    const first = SettingsManager.getInstance();

    first.applyPluginDefaults([['A', { enabled: true }]]);
    first.setPluginEnabled('A', false);

    SettingsManager.destroy();
    const second = SettingsManager.getInstance();

    second.applyPluginDefaults([['A', { enabled: true }]]);

    expect(second.isPluginEnabled('A')).toBe(false);
    expect(JSON.parse(localStorage.getItem(SettingsManager.STORAGE_KEY) ?? '{}').plugins.A.enabled).toBe(false);
  });

  it('clearPersisted forgets user toggles but keeps defaults', () => {
    const settings = SettingsManager.getInstance();

    settings.applyPluginDefaults([['A', { enabled: true }]]);
    settings.setPluginEnabled('A', false);
    settings.clearPersisted();

    expect(settings.isPluginEnabled('A')).toBe(true);
  });

  it('survives unreadable persisted JSON', () => {
    localStorage.setItem(SettingsManager.STORAGE_KEY, '{not json');

    expect(() => SettingsManager.getInstance()).not.toThrow();
    expect(SettingsManager.getInstance().settings.plugins).toEqual({});
  });

  it('applies window.settingsOverride above persisted toggles', () => {
    localStorage.setItem(SettingsManager.STORAGE_KEY, JSON.stringify({ plugins: { A: { enabled: false } } }));
    window.settingsOverride = { plugins: { A: { enabled: true } }, language: 'en' };

    const settings = SettingsManager.getInstance();

    settings.applyPluginDefaults([['A', { enabled: false }]]);

    expect(settings.overrideSource).toBe('window');
    expect(settings.isPluginEnabled('A')).toBe(true);
  });

  it('ignores a malformed window override', () => {
    window.settingsOverride = { plugins: 'nope' } as unknown as typeof window.settingsOverride;

    expect(SettingsManager.getInstance().overrideSource).toBeNull();
  });

  it('strict plugin list only enables plugins the override names', () => {
    window.settingsOverride = { isStrictPluginList: true, plugins: { B: { enabled: true } } };

    const settings = SettingsManager.getInstance();

    settings.applyPluginDefaults([
      ['A', { enabled: true }],
      ['B', { enabled: false }],
    ]);

    expect(settings.settings.isStrictPluginList).toBe(true);
    expect(settings.isPluginEnabled('A')).toBe(false);
    expect(settings.isPluginEnabled('B')).toBe(true);
  });

  it('reads ?settingsOverride= and prefers it over the window override', () => {
    const encoded = SettingsManager.encodeOverride({ isStrictPluginList: true, plugins: { Url: { enabled: true } } });

    window.history.replaceState({}, '', `/campaigns/nats/scenarios/nats-sandbox?settingsOverride=${encoded}`);
    window.settingsOverride = { plugins: { Win: { enabled: true } } };

    const settings = SettingsManager.getInstance();

    expect(settings.overrideSource).toBe('url');
    expect(settings.isPluginEnabled('Url')).toBe(true);
    expect(settings.isPluginEnabled('Win')).toBe(false);
  });

  it('warns and falls back when the URL override is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    window.history.replaceState({}, '', '/?settingsOverride=%%%not-base64');
    window.settingsOverride = { plugins: { Win: { enabled: true } } };

    const settings = SettingsManager.getInstance();

    expect(warn).toHaveBeenCalled();
    expect(settings.overrideSource).toBe('window');
  });

  it('encodes and decodes an override losslessly, including non-ASCII', () => {
    const override = { plugins: { Ünïcode: { enabled: true, order: 3 } }, isStrictPluginList: false, language: 'en' };
    const encoded = SettingsManager.encodeOverride(override);

    expect(encoded).not.toMatch(/[+/=]/u);
    expect(SettingsManager.decodeOverride(encoded)).toEqual(override);
  });

  it('decodes garbage and wrong shapes to null', () => {
    expect(SettingsManager.decodeOverride('!!!')).toBeNull();
    expect(SettingsManager.decodeOverride(SettingsManager.encodeOverride([] as unknown as Record<string, never>))).toBeNull();
    expect(SettingsManager.decodeOverride(btoa('{"isStrictPluginList":"yes"}'))).toBeNull();
  });
});
