/**
 * Terminal app plugin: registers the SkyLink station tab for field stations (phase 40, WP3).
 * Uses only the public PluginApi.
 */
import { type PluginApi, SignalRangePlugin } from '@app/plugins/signal-range-plugin';
import { createSkylinkDashboard, SKYLINK_TAB_ID, SKYLINK_TAB_LABEL } from './skylink-dashboard';

export const TERMINAL_APP_PLUGIN_ID = 'TerminalApp';

export class TerminalAppPlugin extends SignalRangePlugin {
  readonly id = TERMINAL_APP_PLUGIN_ID;

  register(api: PluginApi): void {
    api.missionControl.registerStationTab({
      id: SKYLINK_TAB_ID,
      label: SKYLINK_TAB_LABEL,
      stationClasses: ['field'],
      factory: createSkylinkDashboard,
      isDefault: true,
    });
  }

  override dispose(): void {
    // The host resets the station tab registry on teardown
  }
}
