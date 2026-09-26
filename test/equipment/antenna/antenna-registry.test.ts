import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { ANTENNA_CONFIGS, type AntennaConfig } from '../../../src/equipment/antenna/antenna-configs';
import { createAntenna } from '../../../src/equipment/antenna/antenna-factory';
import { AntennaRegistry } from '../../../src/equipment/antenna/antenna-registry';
import { AntennaUIHeadless } from '../../../src/equipment/antenna/antenna-ui-headless';

vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
    })),
    destroy: vi.fn(),
  },
}));

const pluginConfig: AntennaConfig = {
  ...ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.KA_BAND_1M8],
  name: 'Plugin 4.5m Ka',
  diameter: 4.5,
};

describe('AntennaRegistry', () => {
  beforeEach(() => {
    AntennaRegistry.destroy();
    document.body.innerHTML = '<div id="test-parent"></div>';
  });

  afterEach(() => {
    AntennaRegistry.destroy();
    document.body.innerHTML = '';
  });

  it('is seeded with every built-in config, in declaration order', () => {
    const registry = AntennaRegistry.getInstance();
    const ids = registry.list().map((e) => e.id);

    expect(ids).toEqual(Object.keys(ANTENNA_CONFIGS));
    expect(registry.list().every((e) => e.source === 'builtin')).toBe(true);
    expect(registry.get(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK)).toBe(ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK]);
    expect(AntennaRegistry.isBuiltin('C_BAND_9M_VORTEK')).toBe(true);
    expect(AntennaRegistry.isBuiltin('NOPE')).toBe(false);
  });

  it('registers a plugin config after the built-ins', () => {
    const registry = AntennaRegistry.getInstance();

    registry.register('PLUGIN_KA_4M5', pluginConfig, { source: 'plugin:ExamplePlugin' });

    const entry = registry.find('PLUGIN_KA_4M5');

    expect(entry?.source).toBe('plugin:ExamplePlugin');
    expect(registry.has('PLUGIN_KA_4M5')).toBe(true);
    expect(registry.get('PLUGIN_KA_4M5').name).toBe('Plugin 4.5m Ka');
    expect(registry.list().at(-1)?.id).toBe('PLUGIN_KA_4M5');
  });

  it('refuses to replace a built-in', () => {
    expect(() => AntennaRegistry.getInstance().register('C_BAND_9M_VORTEK', pluginConfig, { source: 'plugin:X' })).toThrow(/built in/u);
  });

  it('refuses a second owner for the same id but lets the owner re-register', () => {
    const registry = AntennaRegistry.getInstance();

    registry.register('SHARED', pluginConfig, { source: 'plugin:A' });

    expect(() => registry.register('SHARED', pluginConfig, { source: 'plugin:B' })).toThrow(/plugin:A/u);
    expect(() => registry.register('SHARED', { ...pluginConfig, name: 'v2' }, { source: 'plugin:A' })).not.toThrow();
    expect(registry.get('SHARED').name).toBe('v2');
  });

  it('validates ids', () => {
    const registry = AntennaRegistry.getInstance();

    expect(() => registry.register('9bad', pluginConfig)).toThrow(/must start with a letter/u);
    expect(() => registry.register('has space', pluginConfig)).toThrow();
  });

  it('unregisters plugin ids but never built-ins', () => {
    const registry = AntennaRegistry.getInstance();

    registry.register('TEMP', pluginConfig, { source: 'plugin:A' });

    expect(registry.unregister('TEMP')).toBe(true);
    expect(registry.has('TEMP')).toBe(false);
    expect(registry.unregister('C_BAND_9M_VORTEK')).toBe(false);
    expect(registry.unregister('NEVER_EXISTED')).toBe(false);
  });

  it('names the installed plugin antennas when an id is unknown', () => {
    const registry = AntennaRegistry.getInstance();

    expect(() => registry.get('MISSING')).toThrow(/No plugin antennas are registered/u);

    registry.register('PLUGIN_KA_4M5', pluginConfig, { source: 'plugin:ExamplePlugin' });

    expect(() => registry.get('MISSING')).toThrow(/PLUGIN_KA_4M5 \(plugin:ExamplePlugin\)/u);
  });

  it('is a fresh registry after destroy()', () => {
    AntennaRegistry.getInstance().register('TEMP', pluginConfig, { source: 'plugin:A' });
    AntennaRegistry.destroy();

    expect(AntennaRegistry.getInstance().has('TEMP')).toBe(false);
  });

  describe('createAntenna integration', () => {
    it('builds a headless antenna from a plugin config', () => {
      AntennaRegistry.getInstance().register('PLUGIN_KA_4M5', pluginConfig, { source: 'plugin:ExamplePlugin' });

      const antenna = createAntenna('test-parent', 'headless', 'PLUGIN_KA_4M5');

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
      expect(antenna.config.name).toBe('Plugin 4.5m Ka');
    });

    it('uses the plugin core factory for the headless variant only', () => {
      const core = vi.fn(
        (parentId: string, configId: string, initialState: Record<string, unknown>, teamId: number, serverId: number) =>
          new AntennaUIHeadless(parentId, configId, initialState, teamId, serverId)
      );

      AntennaRegistry.getInstance().register('PLUGIN_KA_4M5', pluginConfig, { source: 'plugin:ExamplePlugin', core });

      const headless = createAntenna('test-parent', 'headless', 'PLUGIN_KA_4M5', { isPowered: true }, 2, 3);

      expect(core).toHaveBeenCalledWith('test-parent', 'PLUGIN_KA_4M5', { isPowered: true }, 2, 3);
      expect(headless.config.diameter).toBe(4.5);

      createAntenna('test-parent', 'basic', 'PLUGIN_KA_4M5');

      expect(core).toHaveBeenCalledTimes(1);
    });

    it('throws a readable error for an unknown id', () => {
      expect(() => createAntenna('test-parent', 'headless', 'NOT_REGISTERED')).toThrow(/Unknown antenna config "NOT_REGISTERED"/u);
    });
  });
});
