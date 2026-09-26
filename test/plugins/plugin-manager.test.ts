import { vi } from 'vitest';
import { AntennaRegistry } from '../../src/equipment/antenna/antenna-registry';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { resetLocales, t7e } from '../../src/locales/i18n';
import type { PluginDescriptor } from '../../src/plugins/plugin-descriptor';
import { PluginManager } from '../../src/plugins/plugin-manager';
import { type PluginApi, SignalRangePlugin } from '../../src/plugins/signal-range-plugin';
import { SettingsManager } from '../../src/settings/settings-manager';

vi.mock('../../src/router', () => ({
  Router: {
    getInstance: vi.fn(() => ({ addRoute: vi.fn() })),
  },
}));

vi.mock('../../src/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: vi.fn(() => ({ registerCampaign: vi.fn() })),
  },
}));

declare const global: Record<string, unknown>;

/** A plugin class whose behaviour the descriptor controls. */
function pluginClass(id: string, onRegister?: (api: PluginApi) => void | Promise<void>): new () => SignalRangePlugin {
  return class extends SignalRangePlugin {
    readonly id = id;

    async register(api: PluginApi): Promise<void> {
      await onRegister?.(api);
    }
  };
}

function descriptor(id: string, mod: Record<string, unknown>, overrides: Partial<PluginDescriptor> = {}): PluginDescriptor {
  return {
    id,
    import: async () => mod,
    className: id,
    defaultConfig: { enabled: true },
    source: 'external',
    ...overrides,
  };
}

describe('PluginManager', () => {
  beforeEach(() => {
    global.__APP_VERSION__ = '1.1.0-test';
    localStorage.clear();
    delete window.settingsOverride;
    window.history.replaceState({}, '', '/');
    PluginManager.destroy();
    SettingsManager.destroy();
    AntennaRegistry.destroy();
    EventBus.destroy();
    resetLocales();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    PluginManager.destroy();
    SettingsManager.destroy();
    AntennaRegistry.destroy();
    EventBus.destroy();
    resetLocales();
    delete window.settingsOverride;
    vi.restoreAllMocks();
  });

  it('is ready immediately when the manifest has nothing loadable in this build', async () => {
    const manager = PluginManager.getInstance();

    manager.setManifest([{ id: 'PrivateOnly', privateImport: undefined, privateClassName: 'X', defaultConfig: { enabled: true }, alwaysEnabled: true, source: 'private' }]);

    expect(manager.isReady).toBe(true);

    const readyEvents: unknown[] = [];

    EventBus.getInstance().on(Events.PLUGINS_READY, (data) => readyEvents.push(data));
    await manager.loadAll();

    expect(readyEvents).toEqual([{ loaded: [], failed: [] }]);
    expect(manager.list()).toEqual([expect.objectContaining({ id: 'PrivateOnly', enabled: true, loaded: false, unavailable: true, source: 'private' })]);
  });

  it('the real manifest has nothing loadable in the OSS test build', () => {
    expect(PluginManager.getInstance().isReady).toBe(true);
    expect(PluginManager.getInstance().manifest.map((d) => d.id)).toContain('Authoring');
  });

  it('loads locales, instantiates the class, and passes a working api to register()', async () => {
    const seen: string[] = [];
    const Plugin = pluginClass('Fake', (api) => {
      seen.push(api.t7e('plugins.Fake.antennaName'));
      api.antennas.register('FAKE_ANT', { ...api.antennas.get('C_BAND_9M_VORTEK'), name: 'fake' }, { source: 'plugin:Fake' });
      expect(api.engineVersion).toBe('1.1.0-test');
      expect(api.isPrivate).toBe(false);
      expect(api.settings).toBe(SettingsManager.getInstance());
      expect(api.events).toBe(EventBus.getInstance());
    });
    const manager = PluginManager.getInstance();

    manager.setManifest([
      descriptor(
        'Fake',
        { Fake: Plugin },
        { locales: { en: async () => ({ default: { plugins: { Fake: { antennaName: 'Fake Antenna' } } } }) }, meta: { version: '0.1.0' } as PluginDescriptor['meta'] }
      ),
    ]);

    expect(manager.isReady).toBe(false);

    const readyEvents: { loaded: string[]; failed: string[] }[] = [];

    EventBus.getInstance().on(Events.PLUGINS_READY, (data) => readyEvents.push(data));
    await manager.ready;

    expect(seen).toEqual(['Fake Antenna']);
    expect(t7e('plugins.Fake.antennaName')).toBe('Fake Antenna');
    expect(AntennaRegistry.getInstance().find('FAKE_ANT')?.source).toBe('plugin:Fake');
    expect(manager.has('Fake')).toBe(true);
    expect(manager.get('Fake')).toBeInstanceOf(Plugin);
    expect(manager.isReady).toBe(true);
    expect(readyEvents).toEqual([{ loaded: ['Fake'], failed: [] }]);
    expect(manager.list()).toEqual([expect.objectContaining({ id: 'Fake', loaded: true, enabled: true, version: '0.1.0' })]);
  });

  it('accepts a plain object locale bundle as well as a JSON module', async () => {
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('Plain', { Plain: pluginClass('Plain') }, { locales: { en: async () => ({ plugins: { Plain: { hello: 'hi' } } }) } })]);
    await manager.loadAll();

    expect(t7e('plugins.Plain.hello')).toBe('hi');
  });

  it('loadAll is idempotent', async () => {
    const register = vi.fn();
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('Once', { Once: pluginClass('Once', register) })]);

    const first = manager.loadAll();
    const second = manager.loadAll();

    expect(second).toBe(first);
    await first;
    await manager.ready;

    expect(register).toHaveBeenCalledTimes(1);
    expect(() => manager.setManifest([])).toThrow(/before loadAll/u);
  });

  it('skips plugins the settings disable and reports them', async () => {
    const register = vi.fn();
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('Off', { Off: pluginClass('Off', register) }, { defaultConfig: { enabled: false } })]);

    expect(manager.isReady).toBe(true);
    await manager.loadAll();

    expect(register).not.toHaveBeenCalled();
    expect(manager.list()).toEqual([expect.objectContaining({ id: 'Off', enabled: false, loaded: false })]);
  });

  it('honours a persisted user toggle over the manifest default', async () => {
    SettingsManager.getInstance().setPluginEnabled('Toggled', false);

    const register = vi.fn();
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('Toggled', { Toggled: pluginClass('Toggled', register) })]);
    await manager.loadAll();

    expect(register).not.toHaveBeenCalled();
  });

  it('strict plugin list loads only the override list plus alwaysEnabled entries', async () => {
    window.settingsOverride = { isStrictPluginList: true, plugins: { B: { enabled: true } } };

    const calls: string[] = [];
    const manager = PluginManager.getInstance();

    manager.setManifest([
      descriptor('A', { A: pluginClass('A', () => void calls.push('A')) }),
      descriptor('B', { B: pluginClass('B', () => void calls.push('B')) }, { defaultConfig: { enabled: false } }),
      descriptor('Infra', { Infra: pluginClass('Infra', () => void calls.push('Infra')) }, { alwaysEnabled: true, defaultConfig: { enabled: false } }),
    ]);
    await manager.loadAll();

    expect(calls.sort()).toEqual(['B', 'Infra']);
  });

  it('registers in manifest order, then by order, and one failure does not stop the rest', async () => {
    const calls: string[] = [];
    const manager = PluginManager.getInstance();

    manager.setManifest([
      descriptor('Late', { Late: pluginClass('Late', () => void calls.push('Late')) }, { defaultConfig: { enabled: true, order: 100 } }),
      descriptor('Boom', {
        Boom: pluginClass('Boom', () => {
          throw new Error('kaboom');
        }),
      }),
      descriptor('Early', { Early: pluginClass('Early', () => void calls.push('Early')) }, { defaultConfig: { enabled: true, order: -1 } }),
    ]);

    const readyEvents: { loaded: string[]; failed: string[] }[] = [];

    EventBus.getInstance().on(Events.PLUGINS_READY, (data) => readyEvents.push(data));
    await manager.loadAll();

    expect(calls).toEqual(['Early', 'Late']);
    expect(readyEvents).toEqual([{ loaded: ['Early', 'Late'], failed: ['Boom'] }]);
    expect(manager.list().find((p) => p.id === 'Boom')).toEqual(expect.objectContaining({ loaded: false, error: 'kaboom' }));
    expect(manager.has('Boom')).toBe(false);
  });

  it('records a module that fails to import or lacks the named export', async () => {
    const manager = PluginManager.getInstance();

    manager.setManifest([
      descriptor('NoExport', { Wrong: pluginClass('NoExport') }),
      descriptor(
        'BadImport',
        {},
        {
          import: async () => {
            throw new Error('chunk 404');
          },
        }
      ),
    ]);
    await manager.loadAll();

    const rows = manager.list();

    expect(rows.find((p) => p.id === 'NoExport')?.error).toMatch(/no export named "NoExport"/u);
    expect(rows.find((p) => p.id === 'BadImport')?.error).toBe('chunk 404');
  });

  it('warns when the class id disagrees with the manifest id but still loads it', async () => {
    const warn = vi.mocked(console.warn);
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('ManifestId', { ManifestId: pluginClass('ClassId') })]);
    await manager.loadAll();

    expect(manager.has('ManifestId')).toBe(true);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('reports id "ClassId"'))).toBe(true);
  });

  it('disposes every plugin on destroy()', async () => {
    const dispose = vi.fn();
    const Plugin = class extends SignalRangePlugin {
      readonly id = 'Disposable';

      register(): void {
        // nothing
      }

      dispose(): void {
        dispose();
      }
    };
    const manager = PluginManager.getInstance();

    manager.setManifest([descriptor('Disposable', { Disposable: Plugin })]);
    await manager.loadAll();
    PluginManager.destroy();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
