import { GroundStation } from '@app/assets/ground-station/ground-station';
import { LOCK_LOST_LABEL } from '@app/equipment/receiver/rx-signal-quality';
import type { AlarmWithDetail } from '@app/services/alarm-service';
import { AlarmService } from '@app/services/alarm-service';

export type StationStatusLabel = 'OFFLINE' | 'MAINTENANCE' | 'STOWED' | 'DEGRADED' | 'OPERATIONAL';

/** Badge colour of each station status (dashboard-tab.css `.status-badge-*`) */
export const STATION_STATUS_BADGE: Record<StationStatusLabel, string> = {
  OFFLINE: 'status-badge-red',
  MAINTENANCE: 'status-badge-amber',
  STOWED: 'status-badge-gray',
  DEGRADED: 'status-badge-amber',
  OPERATIONAL: 'status-badge-green',
};

/**
 * What the station is doing, for the Dashboard Station Information card and
 * the Mission Overview station card (Phase 32 D16, nats-r7-s11-F1). The first
 * that applies:
 * - OFFLINE: the station is not operational
 * - MAINTENANCE: its antenna is parked in the maintenance mode
 * - STOWED: its antenna is stowed
 * - DEGRADED: an error-severity alarm is up on the station (AlarmService, the
 *   ticker's source), except a lock loss whose carrier is simply gone: after
 *   LOS the pass is over, not the station degraded (nats-eu-r1 s16-F2)
 * - OPERATIONAL otherwise
 */
/** "Carrier lock lost" where every lost modem reads "no carrier": the satellite has set, nothing on the station failed */
function isPassEndLockLoss(alarm: AlarmWithDetail): boolean {
  if (alarm.message !== LOCK_LOST_LABEL || !alarm.detail) return false;

  return alarm.detail.split(';').every((part) => part.trim().endsWith(': no carrier'));
}

export function stationStatusLabel(gs: GroundStation): StationStatusLabel {
  if (!gs.state.isOperational) return 'OFFLINE';

  const mode = gs.antennas[0]?.state?.trackingMode;
  if (mode === 'maintenance') return 'MAINTENANCE';
  if (mode === 'stow') return 'STOWED';

  if (AlarmService.getAlarms(gs).some((alarm) => alarm.severity === 'error' && !isPassEndLockLoss(alarm))) return 'DEGRADED';

  return 'OPERATIONAL';
}
