/**
 * Phased array plugin: the first in-tree builtin plugin. Uses only the public
 * PluginApi: registers the Ku user terminal antenna (with its headless core)
 * and the Array Control page for `kind: 'phased-array'`.
 */
import type { AntennaCoreFactory } from '@app/equipment/antenna/antenna-registry';
import { type PluginApi, SignalRangePlugin } from '@app/plugins/signal-range-plugin';
import { ARRAY_CONTROL_TAB_LABEL, createArrayControlPage } from './array-control-page';
import { KU_PHASED_ARRAY_UT, KU_PHASED_ARRAY_UT_CONFIG, PHASED_ARRAY_KIND, PHASED_ARRAY_PLUGIN_ID } from './phased-array-config';
import { PhasedArrayCore } from './phased-array-core';

/** Builds the headless phased array core Mission Control uses for this config id. */
export const createPhasedArrayCore: AntennaCoreFactory = (parentId, configId, initialState, teamId, serverId) => {
  const core = new PhasedArrayCore(configId, initialState, teamId, serverId);

  core.buildHeadless(parentId);

  return core;
};

export class PhasedArrayPlugin extends SignalRangePlugin {
  readonly id = PHASED_ARRAY_PLUGIN_ID;

  register(api: PluginApi): void {
    api.antennas.register(KU_PHASED_ARRAY_UT, KU_PHASED_ARRAY_UT_CONFIG, { source: `plugin:${this.id}`, core: createPhasedArrayCore });
    api.missionControl.registerAntennaPage(PHASED_ARRAY_KIND, createArrayControlPage, { tabLabel: ARRAY_CONTROL_TAB_LABEL });
  }

  override dispose(): void {
    // Registrations are keyed by plugin id/kind; the host resets the registries on teardown
  }
}
