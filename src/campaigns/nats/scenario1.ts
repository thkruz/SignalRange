import { html } from '@app/engine/utils/development/formatter';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-configs';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerState, TapPoint } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, IfSignal, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';

/**
 * Scenario 1: "First Light" - HELIOS-7 Initial Contact
 *
 * A beginner-level scenario where the student conducts the first ground station
 * link test with a newly launched C-band communications satellite.
 */

export const scenario1Data: ScenarioData = {
  id: 'scenario1',
  url: 'nats/scenarios/scenario1',
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: '"First Light"',
  subtitle: 'MARINER-1 Initial Contact',
  duration: '35-40 min',
  difficulty: 'beginner',
  missionType: 'Commercial Communications',
  description: `You are a Ground Station Operator at North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. Your company provides ground segment services for multiple GEO communication satellites serving the North Atlantic region.<br><br>Your latest client, SeaLink Communications, launched MARINER-1 fourteen days ago aboard a Falcon 9 from Cape Canaveral. The satellite completed its apogee burns and reached its operational slot at 53°W geostationary orbit yesterday. Beacon Orbital Analytics confirmed the satellite achieved station-keeping this morning, and the spacecraft operations team in Halifax has handed the communications payload over to ground operations.<br><br>You will conduct the first ground station RF link test - a critical milestone before MARINER-1 can begin revenue service providing C-band maritime connectivity from Newfoundland to the Caribbean. This scenario will guide you through setting up the ground station equipment, acquiring the satellite signal, and performing initial signal quality measurements.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (GPSDO, LNB, BUC, HPA, Filter)',
    'Spectrum Analyzer',
    'Receiver Modem (pre-configured)',
    'Transmitter Modem (pre-configured)',
  ],
  settings: {
    isSync: true,
    groundStations: [
      {
        id: 'VT-01',
        name: 'Vermont Ground Station',
        location: {
          latitude: 44.5588,
          longitude: -72.5778,
          elevation: 2,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Pre-configure antenna to be powered on and pointed roughly at satellite 1
            isPowered: true,
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            polarization: 14 as Degrees,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
          // Module states managed by their respective classes
          omt: OMTModule.getDefaultState(),
          buc: BUCModuleCore.getDefaultState(),
          hpa: HPAModuleCore.getDefaultState(),
          filter: IfFilterBankModuleCore.getDefaultState(),
          lnb: {
            isPowered: false,
            loFrequency: 6080 as MHz, // MHz
            gain: 0 as dB,
            lnaNoiseFigure: 0.6, // dB
            mixerNoiseFigure: 16.0, // dB
            noiseTemperature: 45, // K
            noiseTemperatureStabilizationTime: 180, // seconds
            isExtRefLocked: false,
            noiseFloor: -140, // dBm/Hz
            frequencyError: 0, // Hz
            temperature: 25, // °C
            thermalStabilizationTime: 180, // seconds
          },
          coupler: {
            isPowered: true,
            tapPointA: TapPoint.TX_IF,
            tapPointB: TapPoint.RX_IF,
            availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
            availableTapPointsB: [TapPoint.RX_IF],
            couplingFactorA: -40, // dB
            couplingFactorB: -39, // dB
            isActiveA: true,
            isActiveB: true,
          } as CouplerState,
          gpsdo: {
            isPowered: true, // CHANGE
            isLocked: false,
            warmupTimeRemaining: 0, // seconds
            temperature: 70, // °C
            gnssSignalPresent: false,
            isGnssSwitchUp: false,
            isGnssAcquiringLock: false,
            satelliteCount: 0,
            utcAccuracy: 0,
            constellation: 'GPS',
            lockDuration: 0,
            frequencyAccuracy: 0,
            allanDeviation: 0,
            phaseNoise: 0,
            isInHoldover: true,
            holdoverDuration: 600,
            holdoverError: 0,
            active10MHzOutputs: 2,
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: false,
            operatingHours: 6,
            selfTestPassed: true,
            agingRate: 0,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: 0, // dBm
            centerFrequency: 600e6 as Hertz,
            span: 100e6 as Hertz,
            rbw: 50e6 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: (-0 + 170) / 10 as dB, // 6 dB/div
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',

            // Multi-trace support
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 1
              { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 2
              { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 3
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [{
          activeModem: 1,
          modems: [{
            modem_number: 1,
            isPowered: true,
            isTransmitting: false,
            isFaulted: false,
            isLoopback: false,
            antenna_id: 1,
            ifSignal: {
              frequency: 70e6,
              bandwidth: 36e6,
              power: -10,
            } as IfSignal,
            id: 0,
            isFaultSwitchUp: false,
            isTransmittingSwitchUp: false
          }],
        }],
        receivers: [{
          activeModem: 1,
          modems: [{
            modemNumber: 1,
            isPowered: true,
            frequency: 775 as MHz,
            bandwidth: 1 as MHz,
            modulation: 'QPSK',
            fec: '3/4',
            antennaUuid: '',
          }],
        }],
      },
      {
        id: 'MIA-01',
        isOperational: false,
        name: 'Miami Ground Station',
        location: {
          latitude: 25.7617,
          longitude: -80.1918,
          elevation: 2,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        rfFrontEnds: [{
          // Module states managed by their respective classes
          omt: OMTModule.getDefaultState(),
          buc: BUCModuleCore.getDefaultState(),
          hpa: HPAModuleCore.getDefaultState(),
          filter: IfFilterBankModuleCore.getDefaultState(),
          lnb: {
            isPowered: false,
            loFrequency: 6080 as MHz, // MHz
            gain: 0 as dB,
            lnaNoiseFigure: 0.6, // dB
            mixerNoiseFigure: 16.0, // dB
            noiseTemperature: 290, // K
            noiseTemperatureStabilizationTime: 180, // seconds
            isExtRefLocked: false,
            noiseFloor: -140, // dBm/Hz
            frequencyError: 0, // Hz
            temperature: 25, // °C
            thermalStabilizationTime: 180, // seconds
          },
          coupler: {
            isPowered: true,
            tapPointA: TapPoint.TX_IF,
            tapPointB: TapPoint.RX_IF,
            availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
            availableTapPointsB: [TapPoint.RX_IF],
            couplingFactorA: -40, // dB
            couplingFactorB: -39, // dB
            isActiveA: true,
            isActiveB: true,
          } as CouplerState,
          gpsdo: {
            isPowered: true, // CHANGE
            isLocked: false,
            warmupTimeRemaining: 0, // seconds
            temperature: 70, // °C
            gnssSignalPresent: false,
            isGnssSwitchUp: false,
            isGnssAcquiringLock: false,
            satelliteCount: 0,
            utcAccuracy: 0,
            constellation: 'GPS',
            lockDuration: 0,
            frequencyAccuracy: 0,
            allanDeviation: 0,
            phaseNoise: 0,
            isInHoldover: true,
            holdoverDuration: 600,
            holdoverError: 0,
            active10MHzOutputs: 2,
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: false,
            operatingHours: 6,
            selfTestPassed: true,
            agingRate: 0,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: 0, // dBm
            centerFrequency: 600e6 as Hertz,
            span: 100e6 as Hertz,
            rbw: 50e6 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: (-0 + 170) / 10 as dB, // 6 dB/div
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',

            // Multi-trace support
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 1
              { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 2
              { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 3
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [],
        receivers: [],
      }
    ],
    layout: html`
      <div class="student-equipment scenario1-layout">
        <div class="paired-equipment-container">
          <div id="antenna1-container" class="antenna-container"></div>
          <div id="specA1-container" class="spec-a-container"></div>
        </div>
        <div id="rf-front-end1-container" class="paired-equipment-container"></div>
      </div>
    `,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-1?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: '1',
            serverId: 1,
            noradId: 1,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5925e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 36e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: 'red-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [
          {
            frequency: 3802.5e6 as RfFrequency,
            signalId: 'MARINER-1-Beacon',
            serverId: 1,
            noradId: 1,
            power: 40 as dBm, // 10 W
            bandwidth: 1e3 as Hertz,
            modulation: 'CW' as ModulationType,
            fec: 'null' as FECType,
            polarization: 'H',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        {
          az: 161.8 as Degrees,
          el: 34.2 as Degrees,
          rotation: 14 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ]
  },
  objectives: [
    {
      id: 'phase-1-gpsdo',
      title: 'Phase 1: GPSDO Power-Up and Lock',
      description: 'At the Vermont Ground Station, power up the GPSDO module and achieve stable frequency lock.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'equipment-powered',
          description: 'GPSDO Module Powered',
          params: {
            equipment: 'gpsdo',
          },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-warmed-up',
          description: 'GPSDO Warmed Up (Operating Temperature)',
          mustMaintain: false,
        },
        {
          type: 'gpsdo-gnss-locked',
          description: 'GPS Antenna Has Satellite Lock (≥4 satellites)',
          mustMaintain: false,
        },
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Frequency Lock Achieved',
          mustMaintain: false,
        },
        {
          type: 'gpsdo-stability',
          description: 'GPSDO Stability <5×10⁻¹¹',
          params: {
            maxFrequencyAccuracy: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GPSDO Not in Holdover Mode',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-2-lnb',
      title: 'Phase 2: LNB Power-Up and Stabilization',
      description: 'Power up the LNB module and wait for thermal stabilization.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-gpsdo'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'LNB Module Powered',
          params: {
            equipment: 'lnb',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Frequency Set to 5,150 MHz',
          params: {
            loFrequency: 5150 as MHz,
            loFrequencyTolerance: 0, // Hz
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 55 dB',
          params: {
            gain: 55,
            gainTolerance: 0, // dB
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-reference-locked',
          description: 'LNB Locked to 10 MHz Reference',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Temperature Stabilization Complete',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-noise-performance',
          description: 'LNB Noise Temperature ≤100K',
          params: {
            maxNoiseTemperature: 100,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-3-buc',
      title: 'Phase 3: BUC Power-Up (Standby Mode)',
      description: 'Power up the BUC module in standby mode with RF output muted.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-lnb'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'BUC Module Powered',
          params: {
            equipment: 'buc',
          },
          mustMaintain: false,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC Locked to 10 MHz Reference',
          mustMaintain: false,
        },
        {
          type: 'buc-muted',
          description: 'BUC RF Output Muted (Safety)',
          mustMaintain: false,
        },
        {
          type: 'buc-current-normal',
          description: 'BUC Current Draw Normal (≤4.5A)',
          params: {
            maxCurrentDraw: 4.5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-4-filter',
      title: 'Phase 4: IF Filter Configuration',
      description: 'Configure the IF filter bandwidth for beacon acquisition. The filter helps reject out-of-band noise.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-buc'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'IF Filter Bank Powered',
          params: {
            equipment: 'filter',
          },
          mustMaintain: false,
        },
        {
          type: 'filter-bandwidth-set',
          description: 'IF Filter Bandwidth Set to 5 MHz',
          params: {
            bandwidthIndex: 6, // Index 6 = 5 MHz
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-5-spec-a',
      title: 'Phase 5: Spectrum Analyzer Configuration',
      description: 'Configure the spectrum analyzer to monitor the MARINER-1 beacon at 3,802.5 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-filter'],
      conditions: [
        {
          type: 'frequency-set',
          description: 'SpecA Center Frequency: 3,802.5 MHz (Beacon)',
          params: {
            frequency: 3802.5e6 as RfFrequency,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-span-set',
          description: 'SpecA Span: 5 MHz',
          params: {
            span: 5e6,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-rbw-set',
          description: 'SpecA RBW: 1 kHz (Narrow for CW Beacon)',
          params: {
            rbw: 1e3,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-reference-level-set',
          description: 'SpecA Reference Level: -60 dBm',
          params: {
            referenceLevel: -60,
            referenceLevelTolerance: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-6-beacon-lock',
      title: 'Phase 6: Beacon Lock on MARINER-1',
      description: 'Configure beacon tracking parameters and acquire stable lock on the MARINER-1 beacon signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-spec-a'],
      conditions: [
        {
          type: 'antenna-beacon-frequency-set',
          description: 'Beacon Frequency Set to 3,802.5 MHz',
          params: {
            beaconFrequency: 3802.5e6,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Tracking Mode: Step Track',
          params: {
            trackingMode: 'step-track',
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-beacon-locked',
          description: 'Beacon Lock Achieved',
          mustMaintain: true,
          maintainDuration: 5,
        },
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on MARINER-1 (10 seconds)',
          params: {
            satelliteId: 1,
          },
          mustMaintain: true,
          maintainDuration: 10,
        },
      ],
      conditionLogic: 'AND',
      points: 50,
    },
    {
      id: 'phase-7-buc-unmute',
      title: 'Phase 7: BUC Transmit Activation',
      description: 'Unmute the BUC to enable RF output. The antenna must remain locked during this operation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-6-beacon-lock'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'BUC Module Powered',
          params: {
            equipment: 'buc',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC Locked to 10 MHz Reference',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC RF Output Enabled (Unmuted)',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Operating in Linear Region',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-8-hpa',
      title: 'Phase 8: HPA Activation',
      description: 'Enable the High Power Amplifier with proper back-off to avoid overdrive. The dual-action switch requires two steps.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-buc-unmute'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'HPA Module Powered',
          params: {
            equipment: 'hpa',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled (Dual-Action Switch)',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-back-off-set',
          description: 'HPA Back-Off Set to 6 dB (Safe Operating Point)',
          params: {
            backOff: 6,
            backOffTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not in Overdrive',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-9-full-link',
      title: 'Phase 9: Bidirectional Link Test',
      description: 'Maintain stable bidirectional link with MARINER-1 for 15 seconds. Both receive and transmit chains must remain active.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-hpa'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna Tracking Lock Maintained',
          params: {
            satelliteId: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected on Spectrum Analyzer',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC RF Output Active',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Active',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-output-power-set',
          description: 'HPA Output Power ≥44 dBm (25W)',
          params: {
            minOutputPower: 44,
          },
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 75,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        Welcome to North Atlantic Teleport Services. Big day for you - first shift on console. I'm glad you made it through the snow; the Vermont microwave backhaul barely did.
      </p>
      <p>
      Alright, here's the situation. SeaLink's brand-new GEO bird, MARINER-1, just settled into its station-keeping box at 53 West. Beacon Orbital in Cambridge ran the final orbit checks this morning, so the spacecraft team has handed the payload over to us.
      </p>
      <p>
      Your job? Establish the first RF link from this facility. No pressure—just the part where we prove to the client that their multimillion-dollar satellite actually talks back.
      </p>
      <p>
      You'll see a Guide and a Checklist on the left side of your screen. Follow those step-by-step; they're built from our standard ops flow and the lessons learned from… well, the last time someone rushed this process.
      </p>
      <p>
      Oh, and I already configured the receiver and transmitter modems while you were getting coffee. You're welcome. Next time, that'll be your problem.
      </p>
      <p>
      I'll be monitoring from the upstairs control room. When you're ready, let's bring MARINER-1 online.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.HAPPY,
      audioUrl: getAssetUrl('/assets/campaigns/nats/1/intro.mp3'),
    },
    objectives: {
      'phase-1-gpsdo': {
        text: `
        <p>
        GPS-DO is up and locked.
        </p>
        <p>
        One subsystem down...seventeen more chances for my ulcer to act up.
        </p>
        <p>
        That 10 MHz reference keeps the rack from free-styling...We don’t have room for improvisation today.
        </p>
        <p>
        ...Go ahead...Power the LNB and dial in its gain.
        </p>
        <p>
        Every step we nail buys me another hour before the board calls.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-1-gpsdo.mp3'),
      },
      'phase-1-lnb': {
        text: `
        <p>
        LNB's warmed up and behaving.
        </p>
        <p>
        Not bad, new guy.
        </p>
        <p>
        Means I don't have to file another 'mysterious gain drift' ticket upstairs.
        </p>
        <p>
        Keep going.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.SURPRISED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-1-lnb.mp3'),
      },
      'phase-1-buc': {
        text: `
        <p>
        BUC is in standby, muted and locked. Good.
        </p>
        <p>
        We don't unmute until we've got beacon lock. That's not paranoia — that's procedure.
        </p>
        <p>
        Next up, configure the IF filter. Five megahertz bandwidth should be tight enough for beacon acquisition.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-1-buc.mp3'),
      },
      'phase-4-filter': {
        text: `
        <p>
        IF filter configured. Most new operators skip this step.
        </p>
        <p>
        The filter bank helps us reject out-of-band noise before it hits the analyzer. For beacon acquisition, 5 MHz is the sweet spot — narrow enough to reject adjacent channel interference, wide enough to catch the beacon.
        </p>
        <p>
        Now configure the spectrum analyzer. MARINER-1's beacon is at 3,802.5 MHz.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-4-filter.mp3'),
      },
      'phase-5-spec-a': {
        text: `
        <p>
        Spectrum analyzer is dialed in. That narrow RBW will help us pick out the CW beacon from the noise floor.
        </p>
        <p>
        Now comes the fun part — beacon acquisition. Set the antenna's beacon receiver to 3,802.5 MHz and switch to step-track mode. The ACU will peak up on the beacon automatically.
        </p>
        <p>
        Once you've got lock, maintain it for 10 seconds. The satellite ops team in Halifax is watching our telemetry.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-5-spec-a.mp3'),
      },
      'phase-6-beacon-lock': {
        text: `
        <p>
        Beautiful! Beacon lock confirmed. MARINER-1 is talking to us.
        </p>
        <p>
        Now we prove we can talk back. Time to light up the transmit chain.
        </p>
        <p>
        Unmute the BUC first. When you do, RF starts flowing to the antenna — which means we're radiating. Make sure the antenna stays locked. I don't want to explain to the neighbors why their TV went fuzzy.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.EXCITED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-6-beacon-lock.mp3'),
      },
      'phase-7-buc-unmute': {
        text: `
        <p>
        BUC is hot. RF is flowing.
        </p>
        <p>
        Now for the HPA. This is a 200-watt amplifier, so treat it with respect.
        </p>
        <p>
        The enable switch is a dual-action safety — you need to arm it AND flip the enable. It's designed to prevent accidental transmission.
        </p>
        <p>
        Set back-off to 6 dB. That keeps us well below the 1 dB compression point and maintains good IMD performance. The SeaLink maritime modems are sensitive to intermodulation distortion.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-7-buc-unmute.mp3'),
      },
      'phase-8-hpa': {
        text: `
        <p>
        HPA is up and linear. Output power looks good.
        </p>
        <p>
        This is it. First Light for MARINER-1.
        </p>
        <p>
        We've got receive chain up and locked, transmit chain active and stable. Now we hold it for 15 seconds to prove to SeaLink that their satellite can talk to us AND hear us back.
        </p>
        <p>
        Don't touch anything. Just breathe.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-8-hpa.mp3'),
      },
      'phase-9-full-link': {
        text: `
        <p>
        MARINER-1 is officially online! First bidirectional link confirmed.
        </p>
        <p>
        Not bad for your first shift. Most new operators take three attempts to get through First Light without breaking lock.
        </p>
        <p>
        The receiver and transmitter modems I set up earlier? Those handle the actual data — video feeds, telemetry, the works. We'll get you trained on those next shift.
        </p>
        <p>
        For now, enjoy the win. Catherine's already on the phone with SeaLink's CEO. You just made them a lot of money.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-9-full-link.mp3'),
      },
    },
  },
}
