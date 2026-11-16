import { AntennaRegistry } from '../../../src/equipment/antenna/antenna-registry';
import { AntennaPageRegistry, createMissionControlApi } from '../../../src/pages/mission-control/antenna-page-registry';
import { builtinPluginManifest } from '../../../src/plugins/plugin-manifest';
import type { PluginApi } from '../../../src/plugins/signal-range-plugin';
import { KU_PHASED_ARRAY_UT, PHASED_ARRAY_KIND } from '../../../src/plugins-builtin/phased-array/phased-array-config';
import { PhasedArrayPlugin } from '../../../src/plugins-builtin/phased-array/phased-array-plugin';

describe('PhasedArrayPlugin', () => {
  beforeEach(() => {
    AntennaRegistry.destroy();
    AntennaPageRegistry.destroy();
  });

  it('registers the Ku user terminal antenna with a core factory and its page', () => {
    const api = {
      antennas: AntennaRegistry.getInstance(),
      missionControl: createMissionControlApi(),
    } as unknown as PluginApi;

    new PhasedArrayPlugin().register(api);

    const entry = AntennaRegistry.getInstance().find(KU_PHASED_ARRAY_UT);

    expect(entry?.config.kind).toBe(PHASED_ARRAY_KIND);
    expect(entry?.source).toBe('plugin:PhasedArray');
    expect(typeof entry?.core).toBe('function');
    expect(AntennaPageRegistry.getInstance().has(PHASED_ARRAY_KIND)).toBe(true);
    expect(AntennaPageRegistry.getInstance().tabLabel(PHASED_ARRAY_KIND)).toBe('Array Control');
  });

  it('reflector kinds keep falling back to ACU Control', () => {
    expect(AntennaPageRegistry.getInstance().has('reflector')).toBe(false);
    expect(AntennaPageRegistry.getInstance().get(undefined)).toBeUndefined();
  });

  it('is in the builtin manifest and enabled by default', () => {
    const d = builtinPluginManifest.find((p) => p.id === 'PhasedArray');

    expect(d?.className).toBe('PhasedArrayPlugin');
    expect(d?.defaultConfig.enabled).toBe(true);
    expect(d?.source).toBe('builtin');
  });
});
