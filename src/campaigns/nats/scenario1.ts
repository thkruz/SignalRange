import { html } from '@app/engine/utils/development/formatter';
import type { AntennaState } from '@app/equipment/antenna/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-configs';
import { BUCModule } from '@app/equipment/rf-front-end/buc-module/buc-module';
import { CouplerState, TapPoint } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModule } from '@app/equipment/rf-front-end/filter-module/filter-module';
import { HPAModule } from '@app/equipment/rf-front-end/hpa-module/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
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
  duration: '25-30 min',
  difficulty: 'beginner',
  missionType: 'Commercial Communications',
  description: `You are a Ground Station Operator at North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. Your company provides ground segment services for multiple GEO communication satellites serving the North Atlantic region.<br><br>Your latest client, SeaLink Communications, launched MARINER-1 fourteen days ago aboard a Falcon 9 from Cape Canaveral. The satellite completed its apogee burns and reached its operational slot at 53°W geostationary orbit yesterday. Beacon Orbital Analytics confirmed the satellite achieved station-keeping this morning, and the spacecraft operations team in Halifax has handed the communications payload over to ground operations.<br><br>You will conduct the first ground station RF link test - a critical milestone before MARINER-1 can begin revenue service providing C-band maritime connectivity from Newfoundland to the Caribbean. This scenario will guide you through setting up the ground station equipment, acquiring the satellite signal, and performing initial signal quality measurements.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
  ],
  settings: {
    isSync: true,
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
      buc: BUCModule.getDefaultState(),
      hpa: HPAModule.getDefaultState(),
      filter: IfFilterBankModule.getDefaultState(),
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
    transmitters: 0,
    receivers: 0,
    layout: html`
      <div id="mission-checklist-container">
        <div class="mission-brief-icon icon" title="Mission Brief"></div>
        <div class="checklist-icon icon" title="Mission Checklist"></div>
        <div class="dialog-icon icon" title="Dialog History"></div>
      </div>
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
            frequency: 3702.5e6 as RfFrequency,
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
      description: 'Power up the GPSDO module and achieve stable frequency lock.',
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
      id: 'phase-1-lnb',
      title: 'Phase 2: LNB Power-Up and Stabilization',
      description: 'Power up the LNB module and wait for thermal stabilization.',
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
      id: 'phase-1-buc',
      title: 'Phase 3: BUC Power-Up (Standby Mode)',
      description: 'Power up the BUC module in standby mode with RF output muted.',
      prerequisiteObjectiveIds: ['phase-1-lnb'],
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
      id: 'phase-1-spec-a',
      title: 'Phase 4: Spectrum Analyzer Configuration',
      description: 'Configure the spectrum analyzer for signal monitoring.',
      prerequisiteObjectiveIds: ['phase-1-buc'],
      conditions: [
        {
          type: 'frequency-set',
          description: 'SpecA Center Frequency: 3,985.5 MHz',
          params: {
            frequency: 3985.5e6 as RfFrequency,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-span-set',
          description: 'SpecA Span: 10 MHz',
          params: {
            span: 10e6,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-rbw-set',
          description: 'SpecA RBW: 10 kHz',
          params: {
            rbw: 10e3,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-reference-level-set',
          description: 'SpecA Reference Level: -40 dBm',
          params: {
            referenceLevel: -40,
            referenceLevelTolerance: 1,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-noise-floor-visible',
          description: 'SpecA Showing Clean Baseline Noise Floor',
          params: {
            maxSignalStrength: -60,
          },
          mustMaintain: false,
        }
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-lock-satellite-1',
      title: 'Phase 5: Acquire and Maintain Lock on HELIOS-7',
      description: 'Point the antenna at satellite 1 (HELIOS-7) and achieve stable tracking lock. The lock must be maintained for at least 10 seconds.',
      prerequisiteObjectiveIds: ['phase-1-spec-a'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna locked on Satellite 1',
          params: {
            satelliteId: 1,
          },
          mustMaintain: true,
          maintainDuration: 10, // Must maintain lock for 10 seconds
        },
      ],
      conditionLogic: 'AND',
      points: 100,
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
      I'll be monitoring from the upstairs control room. When you're ready, let's bring MARINER-1 online.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
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
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-phase-1-lnb.mp3'),
      },
    },
  },
}
