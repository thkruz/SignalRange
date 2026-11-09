import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import type { AntennaConfigId } from '@app/equipment/antenna/antenna-registry';
import { KU_PHASED_ARRAY_UT } from '@app/plugins-builtin/phased-array/phased-array-config';
import type { dBm, Hertz, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { KU_SAT_NORAD } from './satellites';

/**
 * Constellation Sandbox ground stations.
 *
 * Both stations reuse the Galway Ku receive chain (LNB LO 13100 MHz, so
 * IF = 13100 MHz - RF) and change only the dish, the pointing, the OMT receive
 * polarization (V at zero skew, matching the GEO carriers) and the analyzer window.
 *
 * Cedar Mesa (CM-01), 36.0 N 105.0 W, 2100 m: a Ku flat-panel phased array user
 * terminal (KU_PHASED_ARRAY_UT, registered by the PhasedArray plugin). It receives
 * the generic Starlink Ku downlink: 240 MHz RHCP carriers on a 250 MHz raster.
 * The station receive chain is set up for one of them (RHCP, 11820 MHz, IF 1280 MHz).
 * KU-SAT 1 stays in the sky as the protected GEO satellite.
 *
 * High Desert (HD-01), same site, 3 m Ku dish parked on the southern sky for the
 * GEO belt survey. The dish slews at 0.2 deg/s, so a sweep takes patience.
 */

type FrontEnd = {
  omt: { rxPolarization: 'H' | 'LHCP' | 'RHCP' | 'V'; effectiveRxPol: 'H' | 'LHCP' | 'RHCP' | 'V' };
  filter: { bandwidthIndex: number; bandwidth: MHz };
};

function buildStation(
  id: string,
  name: string,
  antennaKey: AntennaConfigId,
  antennaState: Partial<AntennaState>,
  analyzerCenterHz: number,
  analyzerSpanHz: number,
  rxModemMHz: number,
  rxModemBwMHz: number,
  filterIndex: number,
  filterBwMHz: number,
  rxPol: 'H' | 'LHCP' | 'RHCP' | 'V' = 'V'
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

  fe.omt.rxPolarization = rxPol;
  fe.omt.effectiveRxPol = rxPol;
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

/** Starlink-style carrier the Cedar Mesa modem is tuned to (RF MHz); IF = 13100 - RF. */
export const CM_CARRIER_RF_MHZ = 11820;

export const cedarMesaGroundStation = buildStation(
  'CM-01',
  'Cedar Mesa Teleport',
  KU_PHASED_ARRAY_UT,
  {
    // Flat panel: the beam is steered electronically; az/el follow the scheduler
    isPowered: true,
    azimuth: 180 as Degrees,
    elevation: 90 as Degrees,
    polarization: 0 as Degrees,
    trackingMode: 'program-track',
    slewing: false,
    isLocked: true,
  } as Partial<AntennaState>,
  1280e6, // analyzer window 780-1780 MHz IF: Starlink-style carriers at 11.32 to 12.32 GHz
  1000e6,
  13100 - CM_CARRIER_RF_MHZ, // modem on the 11820 MHz carrier (IF 1280 MHz)
  250, // carriers are 240 MHz wide; the modem must be at least as wide
  16,
  320,
  'RHCP'
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
