/**
 * Terminal app plugin: registers the SkyLink station tab for field stations (phase 40, WP3).
 * Uses only the public PluginApi.
 */
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { type PluginApi, SignalRangePlugin } from '@app/plugins/signal-range-plugin';
import { MODEM_PART_ID } from './modem-app-model';
import { createModemDashboard, EUROSAT_TAB_ID, EUROSAT_TAB_LABEL } from './modem-dashboard';
import { createSkylinkDashboard, SKYLINK_TAB_ID, SKYLINK_TAB_LABEL } from './skylink-dashboard';

export const TERMINAL_APP_PLUGIN_ID = 'TerminalApp';

/** The EuroSat modem is on site only at a forward site whose service paths include the modem (S11 onward) */
export function eurosatAvailable(): boolean {
  const config = PhysicalPlantService.plantOrNull()?.getConfig();

  return config?.site?.mode === 'forward' && !!config.service?.paths.some((p) => p.terminalPartId === MODEM_PART_ID);
}

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
    api.missionControl.registerStationTab({
      id: EUROSAT_TAB_ID,
      label: EUROSAT_TAB_LABEL,
      stationClasses: ['field'],
      factory: createModemDashboard,
      isAvailable: eurosatAvailable,
    });
  }

  override dispose(): void {
    // The host resets the station tab registry on teardown
  }
}
