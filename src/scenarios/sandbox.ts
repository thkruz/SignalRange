import type { AntennaState } from '@app/equipment/antenna';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { vermontGroundStation } from '@app/campaigns/nats/ground-stations';
import { aurora7Satellite, tidemark1Satellite } from '@app/campaigns/nats/satellites';

/**
 * Sandbox Mode
 *
 * Full access to all equipment from the Vermont ground station without
 * objectives, timers, or mission requirements. Use for free exploration,
 * practice, and experimentation.
 */

export const sandboxData: ScenarioData = {
  id: 'sandbox',
  url: 'sandbox',
  isDisabled: false,
  imageUrl: 'sandbox.jpg',
  number: 0,
  title: 'Free Play',
  subtitle: 'Sandbox Environment',
  duration: 'Unlimited',
  difficulty: 'beginner',
  missionType: 'Sandbox',
  description: `Explore the simulation environment freely without specific objectives. Configure equipment, test signals, and experiment with different setups at your own pace.`,
  equipment: [
    '9-meter C-band Antenna',
    'Complete RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'All Control Systems',
  ],
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        antennasState: [
          {
            isPowered: true,
            azimuth: 190 as Degrees,
            elevation: 32 as Degrees,
            polarization: 0 as Degrees,
            trackingMode: 'manual',
            isBeaconLocked: false,
            targetSatelliteId: 28899,
            targetAzimuth: 190 as Degrees,
            targetElevation: 32 as Degrees,
            targetPolarization: 0 as Degrees,
            slewing: false,
            beaconCN: 0 as dB,
            beaconFrequencyHz: 1085e6 as Hertz,
            isLocked: false,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // All equipment in default/healthy state
            lnb: {
              isPowered: true,
              loFrequency: 5250 as MHz,
              gain: 65 as dB,
              isExtRefLocked: true,
              hasRefLockFault: false,
              noiseTemperature: 50,
              temperature: 25,
            },
            buc: {
              isPowered: true,
              isMuted: true,
              isLoopback: false,
              loFrequency: 6053 as MHz,
              isExtRefLocked: true,
              gain: 23 as dB,
            },
            hpa: {
              isPowered: true,
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
              outputPower: 50 as dBm,
            },
            gpsdo: {
              isPowered: true,
              isLocked: true,
              gnssSignalPresent: true,
              isGnssSwitchUp: true,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 1000e6 as Hertz,
            span: 100e6 as Hertz,
            rbw: 1e6 as Hertz,
            referenceLevel: -50 as dBm,
            minAmplitude: -120 as dBm,
            maxAmplitude: -30 as dBm,
            scaleDbPerDiv: 10 as dB,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            activeModem: 1,
          },
        ],
      },
    ],
    satellites: [aurora7Satellite, tidemark1Satellite],
    isExtraSatellitesVisible: true,
  },
  objectives: [],
};
