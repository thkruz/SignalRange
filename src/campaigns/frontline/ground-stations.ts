import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import type { LNBState } from '@app/equipment/rf-front-end/lnb-module/lnb-module-core';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import type { Degrees } from 'ootk';
import { EUROSAT_9E_BEACON_RF_HZ, EUROSAT_9E_DATA_RF_HZ, EUROSAT_9E_LOOK, EUROSAT_9E_NORAD_ID, FRONTLINE_LOOK_ANGLE_SITE } from './satellites';

/** Universal-LNB style low-side LO: IF = RF - LO */
const VSAT_LNB_LO_MHZ = 10600;
const BEACON_IF_MHZ = EUROSAT_9E_BEACON_RF_HZ / 1e6 - VSAT_LNB_LO_MHZ;
const DATA_IF_MHZ = EUROSAT_9E_DATA_RF_HZ / 1e6 - VSAT_LNB_LO_MHZ;

/** The Galway Ku front end is the proven chain; the VSAT swaps the LNB and IF filter */
const baseFrontEnd = structuredClone(galwayGroundStation.rfFrontEnds[0]);

/**
 * Frontline Training Post (FL-01)
 *
 * A fictional rural training facility in eastern-central Europe (never named).
 * One 1.2 m Ku VSAT dish fixed on EuroSat 9E, fed through a separate LNB, a
 * 30 m coax IFL and a VSAT modem. The physical plant (power, cables,
 * connectors) is authored in plant-config.ts and degrades this chain.
 *
 * Frequency plan (LNB LO 10600 MHz, low-side):
 * - EUROSAT-9E beacon 11701.5 MHz CW -> IF 1101.5 MHz
 * - EUROSAT-9E data carrier 11850 MHz QPSK 3/4, 4 MHz -> IF 1250 MHz
 */
export const frontlineGroundStation = {
  id: 'FL-01',
  name: 'Frontline Training Post',
  location: {
    latitude: FRONTLINE_LOOK_ANGLE_SITE.latitude,
    longitude: FRONTLINE_LOOK_ANGLE_SITE.longitude,
    elevation: FRONTLINE_LOOK_ANGLE_SITE.elevationM,
  },
  antennas: [ANTENNA_CONFIG_KEYS.KU_BAND_1M2],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.KU_BAND_1M2,
  antennasState: [
    {
      // Fixed VSAT dish pointed at EuroSat 9E (az/el from geoLookAngles via the satellite roster)
      isPowered: true,
      azimuth: Number(EUROSAT_9E_LOOK.az.toFixed(2)) as Degrees,
      elevation: Number(EUROSAT_9E_LOOK.el.toFixed(2)) as Degrees,
      trackingMode: 'program-track',
      targetSatelliteId: EUROSAT_9E_NORAD_ID,
      targetAzimuth: Number(EUROSAT_9E_LOOK.az.toFixed(2)) as Degrees,
      targetElevation: Number(EUROSAT_9E_LOOK.el.toFixed(2)) as Degrees,
      slewing: false,
      beaconFrequencyHz: EUROSAT_9E_BEACON_RF_HZ as unknown as Hertz,
      isLocked: true,
      isBeaconLocked: true,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [
    {
      ...baseFrontEnd,
      lnb: {
        ...baseFrontEnd.lnb,
        isPowered: true,
        loFrequency: VSAT_LNB_LO_MHZ as MHz,
        loInjection: 'low',
        gain: 55 as dB,
        lnaNoiseFigure: 0.8,
        noiseTemperature: 60,
      } as Partial<LNBState>,
    },
  ],
  spectrumAnalyzers: [
    {
      ...structuredClone(galwayGroundStation.spectrumAnalyzers![0]),
      referenceLevel: -60 as dBm,
      centerFrequency: (DATA_IF_MHZ * 1e6) as Hertz,
      span: 60e6 as Hertz,
    },
  ],
  transmitters: [
    {
      activeModem: 1,
      modems: [
        {
          ...structuredClone(galwayGroundStation.transmitters![0].modems[0]),
          ifSignal: {
            signalId: 'FL-01-UPLINK',
            serverId: 1,
            noradId: EUROSAT_9E_NORAD_ID,
            polarization: 'V',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
            frequency: 1405e6 as IfFrequency,
            power: -30 as dBm,
            bandwidth: 4e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
          },
        },
      ],
    },
  ],
  receivers: [
    {
      activeModem: 1,
      modems: [
        {
          modemNumber: 1,
          isPowered: true,
          frequency: DATA_IF_MHZ as MHz, // EUROSAT-9E data carrier IF
          bandwidth: 4 as MHz,
          modulation: 'QPSK',
          fec: '3/4',
          antenna_id: 1,
        },
      ],
    },
  ],
} as GroundStationConfig;

/** IF frequencies of the two EuroSat 9E carriers at the post, MHz */
export const FRONTLINE_IF_MHZ = { beacon: BEACON_IF_MHZ, data: DATA_IF_MHZ };
