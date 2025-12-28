import { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Transmitter } from '@app/equipment/transmitter/transmitter';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * NATS Level 8: "First Light Solo"
 *
 * Phase: Final Evaluation
 * Time Pressure: Moderate (45 minutes - realistic first light timeline)
 * Calculation Required: Yes (all frequencies, no assistance)
 * New UI Elements: None (mastery of all existing systems)
 *
 * Premise: Charlie's last day is tomorrow. Today, you conduct first light for
 * TIDEMARK-4 independently while he observes. This is your final evaluation before
 * he leaves. Complete end-to-end acquisition procedure. Minor realistic complications
 * will occur. Handle them independently. Charlie is present but silent unless you
 * make a critical safety error.
 */

export const scenario8Data: ScenarioData = {
  id: 'nats-level-8-first-light-solo',
  prerequisiteScenarioIds: ['nats-level-7-equipment-cascade'],
  url: 'nats/level-8/first-light-solo',
  imageUrl: 'nats/8/card.png',
  number: 8,
  isDisabled: true,
  difficulty: 'advanced',
  title: 'Level 8: "First Light Solo"',
  subtitle: 'Final Evaluation',
  duration: '45-50 min',
  missionType: 'Final Evaluation',
  description: `Charlie's last day is tomorrow. He's finishing paperwork, closing out projects, preparing to hand over operations to you and the other trained operators. Today is your final evaluation.<br><br>TIDEMARK-4 just reached its operational slot at 29°W. The spacecraft team has confirmed station-keeping and handed the communications payload over to ground operations. You will conduct the complete first light procedure - from cold equipment to bidirectional link establishment - independently while Charlie observes.<br><br>You have 45 minutes, which is a realistic timeline for first light operations. Charlie will be present in the room but silent unless you're about to make a critical safety error. Minor complications will occur - equipment won't be perfect. Handle them professionally.<br><br>This is it. Show Charlie you're ready for solo operations.`,
  equipment: [
    '9-meter C-band Antenna',
    'Complete RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'All Control Systems',
  ],
  settings: {
    isSync: true,
    // evaluationMode: true, // Charlie observing, minimal intervention
    groundStations: [
      {
        id: 'VT-01',
        name: 'Vermont Ground Station',
        location: {
          latitude: 44.5588,
          longitude: -72.5778,
          elevation: 350,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Antenna stowed initially
            isPowered: true,
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            polarization: 0 as Degrees,
            isTracking: false,
            trackingMode: 'manual',
            slewRateLimited: true, // Will take longer than expected
            actualSlewRate: 0.75, // degrees/second (slower than spec'd 1.0)
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
          omt: OMTModule.getDefaultState(),
          buc: {
            ...BUCModuleCore.getDefaultState(),
            isPowered: false,
            loFrequency: 2225 as MHz,
            outputPower: 0 as dBm,
            isMuted: true,
            isExtRefLocked: false,
          },
          hpa: {
            ...HPAModuleCore.getDefaultState(),
            isPowered: false,
            isHpaEnabled: false,
            outputPower: 0 as dBm,
          },
          filter: {
            ...IfFilterBankModuleCore.getDefaultState(),
            isPowered: false,
            bandwidthIndex: 0,
          },
          lnb: {
            isPowered: false,
            loFrequency: 0 as MHz, // Student must calculate
            gain: 0 as dB,
            lnaNoiseFigure: 0.6,
            mixerNoiseFigure: 16.0,
            noiseTemperature: 20,
            noiseTemperatureStabilizationTime: 180,
            isExtRefLocked: false,
            noiseFloor: -140,
            frequencyError: 0,
            temperature: 18,
            thermalStabilizationTime: 180,
          },
          coupler: {
            isPowered: true,
            tapPointA: TapPoint.TX_IF,
            tapPointB: TapPoint.RX_IF,
            availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
            availableTapPointsB: [TapPoint.RX_IF],
            couplingFactorA: -40,
            couplingFactorB: -39,
            isActiveA: true,
            isActiveB: true,
          } as CouplerState,
          gpsdo: {
            isPowered: true,
            isLocked: true,
            warmupTimeRemaining: 0,
            temperature: 65,
            gnssSignalPresent: true,
            isGnssSwitchUp: true,
            isGnssAcquiringLock: false,
            satelliteCount: 11,
            utcAccuracy: 18,
            constellation: 'GPS',
            lockDuration: 172800, // 2 days
            frequencyAccuracy: 1e-12,
            allanDeviation: 5e-13,
            phaseNoise: -140,
            isInHoldover: false,
            holdoverDuration: 0,
            holdoverError: 0,
            active10MHzOutputs: 1,
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: true,
            operatingHours: 172800,
            selfTestPassed: true,
            agingRate: 1e-10,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: 0,
            centerFrequency: 1e9 as Hertz,
            span: 100e6 as Hertz,
            rbw: 1e6 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 17 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [Transmitter.getDefaultState()],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      new Satellite(
        'TIDEMARK-4',
        4, // TIDEMARK-4
        [
          {
            signalId: 'tidemark-4-beacon',
            serverId: 1,
            noradId: 4,
            frequency: 4023.7e6 as RfFrequency, // Given in ops note
            polarization: 'H',
            power: -98 as dBm, // 3 dB weaker than predicted (Complication 1)
            bandwidth: 1e3 as Hertz,
            modulation: 'CW' as ModulationType,
            fec: 'none' as FECType,
            feed: null,
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [],
        {
          az: 224.8 as Degrees, // 29°W from Vermont
          el: 25.9 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
    // operationsNote: {
    //   satelliteName: 'TIDEMARK-4',
    //   orbitalSlot: '29°W',
    //   beaconFrequency: '4,023.7 MHz',
    //   expectedSignalLevel: '-95 dBm ± 2 dB',
    //   polarization: 'Horizontal',
    //   targetIF: '1,247.5 MHz (standard)',
    //   antennaPointing: 'Az 224.8°, El 25.9° (from VT-01)',
    //   notes: [
    //     'Final TIDEMARK constellation satellite',
    //     'Commissioning phase - first RF contact critical',
    //     'Standard C-band configuration',
    //     'Report any anomalies to spacecraft team',
    //   ]
    // },
    //   complications: [
    //     {
    //       id: 'weak-beacon-signal',
    //       triggeredAt: 900, // 15 minutes - when beacon first acquired
    //       type: 'signal-level-deviation',
    //       description: 'Beacon signal 3 dB weaker than predicted',
    //       expectedValue: -95 as dBm,
    //       actualValue: -98 as dBm,
    //       correctAction: 'increase-lnb-gain', // Increase gain from 55 to 58 dB
    //     },
    //     {
    //       id: 'slow-antenna-slew',
    //       triggeredAt: 600, // 10 minutes - during antenna movement
    //       type: 'equipment-performance',
    //       description: 'Antenna slew rate slower than expected',
    //       expectedDuration: 300, // 5 minutes expected
    //       actualDuration: 480, // 8 minutes actual (25% slower)
    //       correctAction: 'wait-for-completion', // Not a fault, just patience
    //     },
    //   ],
    // },
  },
};