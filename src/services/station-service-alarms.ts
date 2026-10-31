/**
 * @file Station service alarms (Phase 35 E5, nats-eu s04-F6/F7, s07-F6)
 * @description Alarms for station services that are not equipment on a ground
 * station: the COMSEC traffic key (a singleton CryptoModule) and the element
 * set the station predicts passes from. AlarmService appends
 * `collectStationServiceAlarms(assetId)` to each operational station's alarms,
 * so these reach the ticker, the Dashboard Active Alarms list and the Ops Log
 * raise/clear lines the same way equipment alarms do.
 */

import { CryptoModule } from '@app/equipment/crypto';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { AggregatedAlarm } from '@app/events/events';
import { SimulationManager } from '@app/simulation/simulation-manager';

/** Fixed label of the traffic-key mismatch error */
export const TRAFFIC_KEY_MISMATCH_LABEL = 'Traffic key mismatch';
/** Fixed label of the stale ephemeris warning */
export const EPHEMERIS_STALE_LABEL = 'Ephemeris stale';
/** Equipment type the Dashboard files these under */
export const STATION_SERVICE_EQUIPMENT_TYPE = 'SVC';

export interface StationServiceAlarm extends Pick<AggregatedAlarm, 'severity' | 'message' | 'equipmentType' | 'equipmentIndex'> {
  detail?: string;
}

/** COMSEC key faults: mismatch and expiry are errors, a pending rotation is a warning. */
export function collectCryptoKeyAlarms(): StationServiceAlarm[] {
  if (!CryptoModule.hasInstance()) return [];
  const crypto = CryptoModule.getInstance();
  const tx = crypto.getTxState();
  const rx = crypto.getRxState();
  const alarms: StationServiceAlarm[] = [];
  const base = { equipmentType: STATION_SERVICE_EQUIPMENT_TYPE, equipmentIndex: 0 };
  if (tx.encryptionKeyStatus === 'Mismatch' || rx.decryptionKeyStatus === 'Mismatch') {
    alarms.push({ ...base, severity: 'error', message: TRAFFIC_KEY_MISMATCH_LABEL, detail: `TX ${tx.encryptionKeyId}, RX ${rx.decryptionKeyId}: decryption failing` });
  } else if (tx.encryptionKeyStatus === 'Expired' || rx.decryptionKeyStatus === 'Expired') {
    alarms.push({ ...base, severity: 'error', message: 'Traffic key expired', detail: tx.encryptionKeyId });
  } else if (tx.encryptionKeyStatus === 'Pending Rotation' || rx.decryptionKeyStatus === 'Pending Rotation') {
    alarms.push({ ...base, severity: 'warning', message: 'Key rotation pending', detail: tx.encryptionKeyId });
  }
  return alarms;
}

/** One warning per spacecraft whose element set on file no longer describes its orbit. */
export function collectEphemerisAlarms(): StationServiceAlarm[] {
  if (!SimulationManager.hasInstance()) return [];
  const stale = SimulationManager.getInstance()
    .satellites.filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite && sat.isPredictionStale)
    .map((sat) => sat.name);
  if (stale.length === 0) return [];

  return [
    {
      severity: 'warning',
      message: EPHEMERIS_STALE_LABEL,
      equipmentType: STATION_SERVICE_EQUIPMENT_TYPE,
      equipmentIndex: 1,
      detail: `${stale.join(', ')}: element set predates the manoeuvre`,
    },
  ];
}

/** Every station-service alarm for one station (the services are shared across the scenario's stations). */
export function collectStationServiceAlarms(assetId: string): (StationServiceAlarm & { assetId: string })[] {
  return [...collectCryptoKeyAlarms(), ...collectEphemerisAlarms()].map((alarm) => ({ ...alarm, assetId }));
}
