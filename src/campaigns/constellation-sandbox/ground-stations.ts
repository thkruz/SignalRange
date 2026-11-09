import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { KU_SAT_NORAD } from './satellites';

/**
 * Constellation Sandbox ground stations.
 *
 * Both stations reuse the Galway Ku receive chain (LNB LO 13100 MHz, so
 * IF = 13100 MHz - RF) and change only the dish, the pointing, the OMT receive
 * polarization (V at zero skew, matching the GEO carriers) and the analyzer window.
 *
 * Cedar Mesa (CM-01), 36.0 N 105.0 W, 2100 m: 2.4 m Ku dish program-tracking
 * KU-SAT 1 at az 168.1 / el 47.5. A small dish has wide sidelobes, so Starlink
 * passes well away from the beam still raise the noise floor.
 *
 * High Desert (HD-01), same site, 3 m Ku dish parked on the southern sky for the
 * GEO belt survey. The dish slews at 0.2 deg/s, so a sweep takes patience.
 */

type FrontEnd = {
  omt: { rxPolarization: string; effectiveRxPol: string };
  filter: { bandwidthIndex: number; bandwidth: MHz };
};

function buildStation(
  id: string,
  name: string,
  antennaKey: (typeof ANTENNA_CONFIG_KEYS)[keyof typeof ANTENNA_CONFIG_KEYS],
  antennaState: Partial<AntennaState>,
  analyzerCenterHz: number,
  analyzerSpanHz: number,
  rxModemMHz: number,
  rxModemBwMHz: number,
  filterIndex: number,
  filterBwMHz: number
): GroundStationConfig {
  const base = structuredClone(galwayGroundStation) as unknown as GroundStationConfig & {
    rfFrontEnds: FrontEnd[];
    spectrumAnalyzers: Array<Record<string, unknown>>;
    transmitters: Array<{ modems: Array<{ ifSignal: { signalId: string; noradId: number } }> }>;
    receivers: Array<{ modems: Array<Record<string, unknown>> }>;
  };

  base.id = id;
  base.name = name;
  base.location = { latitude: 36.0, longitude: -105.0, elevation: 2100 };
  base.antennas = [antennaKey];
  base.antennaConfigKey = antennaKey;
  base.antennasState = [antennaState];

  const fe = base.rfFrontEnds[0];

  fe.omt.rxPolarization = 'V';
  fe.omt.effectiveRxPol = 'V';
  fe.filter.bandwidthIndex = filterIndex;
  fe.filter.bandwidth = filterBwMHz as MHz;

  Object.assign(base.spectrumAnalyzers[0], {
    centerFrequency: analyzerCenterHz as Hertz,
    span: analyzerSpanHz as Hertz,
    rbw: 1e6 as Hertz,
    referenceLevel: -60 as dBm,
    minAmplitude: -110 as dBm,
    maxAmplitude: -50 as dBm,
  });

  const tx = base.transmitters[0].modems[0].ifSignal;

  tx.signalId = `${id}-CMD`;
  tx.noradId = KU_SAT_NORAD;

  Object.assign(base.receivers[0].modems[0], {
    frequency: rxModemMHz as MHz,
    bandwidth: rxModemBwMHz as MHz,
    modulation: 'QPSK',
    fec: '3/4',
  });

  return base as GroundStationConfig;
}

export const cedarMesaGroundStation = buildStation(
  'CM-01',
  'Cedar Mesa Teleport',
  ANTENNA_CONFIG_KEYS.KU_BAND_2M4_ANTESTAR,
  {
    // Program-tracking KU-SAT 1 (az 168.1 / el 47.5 from CM-01 at T+0)
    isPowered: true,
    azimuth: 168.11 as Degrees,
    elevation: 47.52 as Degrees,
    polarization: 0 as Degrees,
    trackingMode: 'program-track',
    isBeaconLocked: true,
    targetSatelliteId: KU_SAT_NORAD,
    targetAzimuth: 168.11 as Degrees,
    targetElevation: 47.52 as Degrees,
    targetPolarization: 0 as Degrees,
    slewing: false,
    beaconCN: 20 as dB,
    beaconFrequencyHz: 11740e6 as Hertz,
    isLocked: true,
  } as Partial<AntennaState>,
  1240e6, // 1090-1390 MHz IF window covers all four carriers (IF 1120-1360)
  300e6,
  1360, // modem on the 11740 MHz carrier
  36,
  16,
  320
);

export const highDesertGroundStation = buildStation(
  'HD-01',
  'High Desert Survey Site',
  ANTENNA_CONFIG_KEYS.KU_BAND_3M_ANTESTAR,
  {
    // Parked on the southern sky; the operator sweeps the arc from here
    isPowered: true,
    azimuth: 180 as Degrees,
    elevation: 50 as Degrees,
    polarization: 0 as Degrees,
    trackingMode: 'manual',
    targetAzimuth: 180 as Degrees,
    targetElevation: 50 as Degrees,
    targetPolarization: 0 as Degrees,
    slewing: false,
    isLocked: false,
  } as Partial<AntennaState>,
  1460e6, // IF window 1020-1900 MHz: the template Ku carriers (IF 1020-1420) and the beacons (11200-11700 MHz RF, IF 1400-1900)
  880e6,
  1300, // 11800 MHz, the first V-pol Ku carrier of the GEO template
  36,
  16,
  320
);
