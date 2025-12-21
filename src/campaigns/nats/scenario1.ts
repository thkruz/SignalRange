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
 * Scenario 1: "First Day" - TIDEMARK-1 Health Check
 *
 * A beginner-level tutorial where Charlie Brooks walks you through a routine
 * health check on an already-operational satellite ground station.
 */

export const scenario1Data: ScenarioData = {
  id: 'scenario1',
  url: 'nats/scenarios/scenario1',
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: '"First Day"',
  subtitle: 'TIDEMARK-1 Health Check',
  duration: '15-20 min',
  difficulty: 'beginner',
  missionType: 'Routine Operations',
  description: `Welcome to your first day at North Atlantic Teleport Services, a commercial satellite ground station facility in rural Vermont. Your company provides ground segment services for the TIDEMARK constellation - SeaLink Global Communications' fleet of GEO satellites providing maritime broadband across the Atlantic.<br><br>TIDEMARK-1 is already online at 53°W, serving customer traffic. Today, Charlie Brooks will walk you through a routine health check. You'll learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.<br><br>No pressure today - just observation and familiarization. Click through each panel and verify the status indicators as Charlie explains them.`,
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
            // Antenna already tracking TIDEMARK-1 in step-track mode
            isPowered: true,
            azimuth: 161.8 as Degrees, // Locked on TIDEMARK-1
            elevation: 34.2 as Degrees,
            polarization: 14 as Degrees,
            trackingMode: 'step-track',
            isBeaconLocked: true,
            beaconFrequency: 3902.5e6 as Hertz,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
          // Module states managed by their respective classes
          omt: OMTModule.getDefaultState(),
          buc: BUCModuleCore.getDefaultState(),
          hpa: HPAModuleCore.getDefaultState(),
          filter: IfFilterBankModuleCore.getDefaultState(),
          lnb: {
            isPowered: true,
            loFrequency: 5150 as MHz, // C-band LNB LO for 3902.5 MHz beacon -> 1247.5 MHz IF
            gain: 55 as dB,
            lnaNoiseFigure: 0.6, // dB
            mixerNoiseFigure: 16.0, // dB
            noiseTemperature: 45, // K - stable
            noiseTemperatureStabilizationTime: 0, // Already stabilized
            isExtRefLocked: true, // Locked to GPSDO 10 MHz
            noiseFloor: -140, // dBm/Hz
            frequencyError: 0, // Hz
            temperature: 28, // °C - stable
            thermalStabilizationTime: 0, // Already stabilized
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
            isPowered: true,
            isLocked: true,
            warmupTimeRemaining: 0,
            temperature: 45, // °C - stable operating temp
            gnssSignalPresent: true,
            isGnssSwitchUp: true,
            isGnssAcquiringLock: false,
            satelliteCount: 8,
            utcAccuracy: 50, // ns
            constellation: 'GPS',
            lockDuration: 7200, // 2 hours locked
            frequencyAccuracy: 2e-11, // Excellent stability
            allanDeviation: 1e-11,
            phaseNoise: -110, // dBc/Hz
            isInHoldover: false,
            holdoverDuration: 0,
            holdoverError: 0,
            active10MHzOutputs: 3,
            max10MHzOutputs: 5,
            output10MHzLevel: 7, // dBm
            ppsOutputsEnabled: true,
            operatingHours: 8760, // 1 year of operation
            selfTestPassed: true,
            agingRate: 1e-10,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: -100 as dBm, // Set for beacon observation
            centerFrequency: 1247.5e6 as Hertz, // IF frequency for beacon
            span: 2e3 as Hertz, // 2 kHz span for CW beacon
            rbw: 1e3 as Hertz, // 1 kHz RBW for CW beacon
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 10 as dB,
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
            isPowered: false,
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
            frequency: 1432 as MHz,  // IF frequency for 3718 MHz RF with 5150 MHz LO
            bandwidth: 36 as MHz,    // Match payload bandwidth
            modulation: 'QPSK',
            fec: '3/4',
            antenna_id: 1,
          }],
        }],
      },
      {
        id: 'ME-01',
        isOperational: false,
        name: 'Maine Ground Station',
        location: {
          latitude: 45.215214,
          longitude: -68.785507,
          elevation: 48,
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
    missionBriefUrl: 'http://localhost:4321/scenarios/scenario-1?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        61525,
        [
          {
            signalId: 'TIDEMARK-1-Payload',
            serverId: 1,
            noradId: 61525,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5943e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 36e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [
          {
            frequency: 3902.5e6 as RfFrequency,
            signalId: 'TIDEMARK-1-Beacon',
            serverId: 1,
            noradId: 61525,
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
          },
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
      title: 'Phase 1: GPSDO Status Check',
      description: 'Click on the GPSDO panel and verify all status indicators show normal operation.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify GPSDO Status',
          params: {
            question: 'What does the GPSDO "Lock" indicator show?',
            options: [
              'Locked (green) - stable frequency reference',
              'Unlocked (red) - no frequency reference',
              'Holdover (yellow) - using backup oscillator',
              'Off - GPSDO is powered down',
            ],
            correctIndex: 0,
            explanation: 'The green "Locked" indicator means the GPSDO is receiving GPS timing signals and providing a stable 10 MHz reference to all equipment in the rack.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-2-lnb',
      title: 'Phase 2: LNB Status Check',
      description: 'Review the LNB panel. Learn what each indicator means for the receive chain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-gpsdo'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify LNB Noise Temperature',
          params: {
            question: 'What is the LNB noise temperature reading, and is it within spec?',
            options: [
              '45K - within spec (good receive sensitivity)',
              '150K - above spec (degraded sensitivity)',
              '290K - far above spec (major problem)',
              'No reading - LNB is offline',
            ],
            correctIndex: 0,
            explanation: 'The LNB noise temperature of 45K is excellent. Lower noise temperature means better receive sensitivity. Anything under 100K is considered good for C-band.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-3-antenna',
      title: 'Phase 3: Antenna Tracking Status',
      description: 'Check the antenna control unit. The antenna should be actively tracking TIDEMARK-1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-lnb'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Antenna Tracking Mode',
          params: {
            question: 'What tracking mode is the antenna currently using?',
            options: [
              'Step-track - actively tracking beacon signal',
              'Program-track - following predicted orbital position',
              'Manual - operator-controlled pointing',
              'Stow - antenna in safe position',
            ],
            correctIndex: 0,
            explanation: 'Step-track mode uses the satellite beacon signal to continuously optimize antenna pointing. This provides the most accurate tracking for operational satellites.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-4-spectrum',
      title: 'Phase 4: Spectrum Analyzer Reading',
      description: 'Look at the spectrum analyzer display. You should see the TIDEMARK-1 beacon signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-antenna'],
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Beacon Signal',
          params: {
            question: 'What do you see at the center of the spectrum analyzer display?',
            options: [
              'A clear spike - the TIDEMARK-1 beacon signal',
              'Only noise floor - no signal detected',
              'Multiple interference spikes - contaminated spectrum',
              'Flat line at 0 dBm - equipment malfunction',
            ],
            correctIndex: 0,
            explanation: 'The beacon signal appears as a narrow spike rising above the noise floor. This CW (continuous wave) signal at 1,247.5 MHz IF confirms the satellite is in view and the receive chain is working.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-5-receiver',
      title: 'Phase 5: Receiver Modem Check',
      description: 'Final check: verify the receiver modem is locked and the link quality is good.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-spectrum'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Link Quality',
          params: {
            question: 'What is the receiver modem C/N ratio, and what does it indicate?',
            options: [
              'Above 10 dB - healthy link with good margin',
              '5 dB - marginal link, may have errors',
              '0 dB - at threshold, unreliable',
              'Negative - no usable signal',
            ],
            correctIndex: 0,
            explanation: 'A C/N ratio above 10 dB indicates a healthy link with adequate margin for reliable data reception. This confirms the entire receive chain from antenna to modem is functioning properly.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        I've got three new hires to train before I leave next month, so let's make good use of our time. I'm Charlie Brooks - senior operator here at NATS.
      </p>
      <p>
        TIDEMARK-1 is already online at 53 West, serving customer traffic for SeaLink. Today I'm going to walk you through a routine health check. You'll learn what each equipment panel shows, what the indicators mean, and what "normal" looks like.
      </p>
      <p>
        No pressure today - just observation and familiarization. Click through each panel and verify the status indicators as I explain them.
      </p>
      <p>
        Let's start with the GPSDO. That's the GPS-Disciplined Oscillator - the heart of our frequency reference system.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/1/intro-v2.mp3'),
    },
    objectives: {
      'phase-1-gpsdo': {
        text: `
        <p>
          See that green lock indicator? That's what we want to see - means we've got a stable 10 MHz reference for the entire rack.
        </p>
        <p>
          The GPSDO receives timing signals from GPS satellites and uses them to discipline a precision oscillator. When it says "Locked" and shows 8 satellites, everything's nominal.
        </p>
        <p>
          That stability reading - anything below 5×10⁻¹¹ is excellent. This reference feeds every other piece of equipment in the chain.
        </p>
        <p>
          Next up: the LNB panel. That's the Low Noise Block downconverter - it's part of the receive chain.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-1-gpsdo.mp3'),
      },
      'phase-2-lnb': {
        text: `
        <p>
          The LNB converts the incoming C-band signal down to an intermediate frequency we can work with. It's mounted right at the antenna feed.
        </p>
        <p>
          Key things to check: power is on, it's locked to our 10 MHz reference, and the temperature is stable. That noise temperature reading tells us how clean the receive signal is - lower is better, and anything under 100 Kelvin is good.
        </p>
        <p>
          Now let's look at the antenna control unit. That's where we monitor tracking status.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-2-lnb.mp3'),
      },
      'phase-3-antenna': {
        text: `
        <p>
          The antenna is currently in step-track mode, locked on TIDEMARK-1's beacon signal. See those azimuth and elevation readings? That's where the dish is pointing.
        </p>
        <p>
          Step-track mode automatically makes small adjustments to keep us peaked on the beacon. The "Beacon Lock" indicator confirms we're receiving that signal.
        </p>
        <p>
          When you see stable tracking like this, the receive chain is healthy. Let's verify that on the spectrum analyzer.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-3-antenna.mp3'),
      },
      'phase-4-spectrum': {
        text: `
        <p>
          This is what a healthy beacon signal looks like. That spike in the center of the display is the TIDEMARK-1 beacon at 1,247.5 MHz IF.
        </p>
        <p>
          The noise floor - that's the baseline around -120 dBm - is clean and flat. No interference, no spurious signals. That's exactly what we want to see.
        </p>
        <p>
          One more check: the receiver modem. Let's make sure it's demodulating properly.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-4-spectrum.mp3'),
      },
      'phase-5-receiver': {
        text: `
        <p>
          Receiver's locked. That C/N ratio above 10 dB means we've got plenty of margin for reliable data reception.
        </p>
        <p>
          That covers the basics. You've seen what normal operation looks like - GPSDO locked, LNB stable, antenna tracking, clean spectrum, receiver demodulating.
        </p>
        <p>
          Next shift, we'll do something more hands-on. But for now, you know what healthy equipment looks like. That's the foundation for everything else.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-5-receiver.mp3'),
      },
    },
  },
}
