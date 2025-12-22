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
  duration: '25-35 min',
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
  timeLimitSeconds: 6000, // 100 minutes
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
            // Antenna already tracking TIDEMARK-1 in program-track mode
            isPowered: true,
            azimuth: 161.8 as Degrees, // Locked on TIDEMARK-1
            elevation: 34.2 as Degrees,
            polarization: 14 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61525,
            targetAzimuth: 161.8 as Degrees,
            targetElevation: 34.2 as Degrees,
            targetPolarization: 14 as Degrees,
            slewing: false,
            beaconCN: 10.5 as dB,
            beaconFrequencyHz: 3902.5e6 as Hertz,
            isLocked: true,
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
            temperature: 70, // °C - stable operating temp
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
            minAmplitude: -105 as dBm,
            maxAmplitude: -85 as dBm,
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
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-1?content-only=true&dark=true',
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
      new Satellite(
        42432,
        [
          {
            signalId: 'SES-10-Payload',
            serverId: 1,
            noradId: 42432,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 6115e6 as RfFrequency,
            polarization: 'V',
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
            frequency: 3905.0e6 as RfFrequency,
            signalId: 'SES-10-Beacon',
            serverId: 1,
            noradId: 42432,
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
          az: 164.2 as Degrees,
          el: 34.1 as Degrees,
          rotation: -32 as Degrees,
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
      timeLimitSeconds: 100, // 20 minutes
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
              '43K - within spec (good receive sensitivity)',
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
      id: 'phase-3-hpa',
      title: 'Phase 3: HPA Status Check',
      description: 'Review the High Power Amplifier panel. Learn how to verify it is in a safe standby state.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-lnb'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify HPA Status',
          params: {
            question: 'What is the current state of the HPA (High Power Amplifier)?',
            options: [
              'Powered but muted - safe standby mode',
              'Transmitting at full power',
              'Powered off completely',
              'Faulted - showing alarm condition',
            ],
            correctIndex: 0,
            explanation: 'The HPA is in safe standby mode - powered on but with RF output muted. This is the normal state when not actively transmitting. The BUC mute prevents any unintended RF emission.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-4-antenna',
      title: 'Phase 4: Antenna Tracking Status',
      description: 'Check the antenna control unit. The antenna should be actively tracking TIDEMARK-1.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-hpa'],
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
            correctIndex: 1,
            explanation: 'Program-track mode follows the predicted orbital position of the satellite based on ephemeris data. This mode is used when the beacon signal is not available or during initial acquisition.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-5-polarization',
      title: 'Phase 5: ACU Polarization Check',
      description: 'Verify the antenna polarization setting matches the satellite requirements.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-antenna'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Polarization Setting',
          params: {
            question: 'What is the current polarization angle shown on the ACU, and why is it set to that value?',
            options: [
              '14° - matched to TIDEMARK-1 satellite polarization',
              '0° - default horizontal polarization',
              '90° - vertical polarization',
              '45° - circular polarization',
            ],
            correctIndex: 0,
            explanation: 'The polarization is set to 14° to match TIDEMARK-1\'s polarization angle. Proper polarization alignment maximizes signal strength and minimizes cross-pol interference.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-6-spectrum',
      title: 'Phase 6: Spectrum Analyzer Reading',
      description: 'Look at the spectrum analyzer display. You should see the TIDEMARK-1 beacon signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-polarization'],
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
      id: 'phase-7-speca-settings',
      title: 'Phase 7: Spectrum Analyzer Settings',
      description: 'Review the spectrum analyzer settings to understand how it is configured for beacon observation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-6-spectrum'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Spectrum Analyzer Configuration',
          params: {
            question: 'What center frequency and reference level are set on the spectrum analyzer?',
            options: [
              '1247.5 MHz center, -100 dBm reference - configured for beacon IF',
              '3902.5 MHz center, -50 dBm reference - configured for RF frequency',
              '70 MHz center, -30 dBm reference - configured for baseband',
              '600 MHz center, 0 dBm reference - default settings',
            ],
            correctIndex: 0,
            explanation: 'The spectrum analyzer is set to 1247.5 MHz (beacon IF frequency after LNB downconversion) with a -100 dBm reference level to properly display the weak beacon signal above the noise floor.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-8-receiver',
      title: 'Phase 8: Receiver Modem Check',
      description: 'Verify the receiver modem is locked and the link quality is good.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-speca-settings'],
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
    {
      id: 'phase-9-constellation',
      title: 'Phase 9: I&Q Constellation Check',
      description: 'Examine the I&Q constellation diagram to verify signal quality and modulation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-receiver'],
      conditions: [
        {
          type: 'status-check',
          description: 'Interpret I&Q Constellation',
          params: {
            question: 'What does the I&Q constellation diagram show about the received signal?',
            options: [
              'Tight clusters at symbol points - clean QPSK modulation',
              'Scattered points in a circle - high noise, poor signal',
              'Points along a line - phase-only modulation issue',
              'Empty display - no signal lock',
            ],
            correctIndex: 0,
            explanation: 'The tight clusters at the four QPSK symbol points indicate clean demodulation with good signal-to-noise ratio. Spread or scattered points would indicate noise, interference, or phase problems.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-10-alarms',
      title: 'Phase 10: Dashboard Alarm Check',
      description: 'Final step: review the alarm dashboard to confirm no active alarms.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-9-constellation'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify Alarm Status',
          params: {
            question: 'What is the current alarm status shown on the dashboard?',
            options: [
              'No active alarms - all systems nominal',
              'Warning: LNB temperature high',
              'Error: GPSDO holdover mode',
              'Critical: Antenna tracking lost',
            ],
            correctIndex: 0,
            explanation: 'A clean alarm dashboard with no active alarms confirms all equipment is operating within normal parameters. This is the final confirmation of a healthy ground station.',
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
        Let's start with the GPSDO - that's the GPS-Disciplined Oscillator. It's the timing heart of our frequency reference system. Everything else in this rack keys off that 10 MHz clock.
      </p>
      <p>
        Pull up the GPSDO panel and check the lock indicator. It can show a few different states - locked to GPS, running in holdover mode on the backup oscillator, unlocked, or completely off. You need to know what state it's in before we check anything else.
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
          Good. The GPSDO provides the frequency reference for everything else in the rack. If it ever drops to holdover mode, you've got maybe twenty minutes before frequency drift starts causing problems. If it's unlocked entirely, nothing downstream will work right.
        </p>
        <p>
          Next up: the LNB panel. That's the Low Noise Block downconverter - it's part of the receive chain, mounted right at the antenna feed. It converts incoming C-band signals down to an intermediate frequency we can work with.
        </p>
        <p>
          The key spec to check is noise temperature - that's measured in Kelvin and tells you how much thermal noise the LNB adds to the signal. Lower is better. Under 100K is acceptable for C-band, but you'll see a range of values depending on equipment condition. Check what the panel shows and whether it's within spec.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-1-gpsdo.mp3'),
      },
      'phase-2-lnb': {
        text: `
        <p>
          Noise temperature is critical for receive sensitivity. Higher numbers mean more noise getting added to your signal, which eats into your link margin. If you ever see it climb above spec, that's an early warning sign of equipment degradation.
        </p>
        <p>
          Now let's check the HPA - the High Power Amplifier. That's the muscle of our transmit chain. It amplifies our signal to the power level needed to reach the satellite - we're talking hundreds of watts.
        </p>
        <p>
          The HPA can be in several states: transmitting at power, in safe standby with RF muted, powered off, or faulted. It's potentially dangerous equipment - you don't want it transmitting when you're not expecting it. Check the panel and determine what state it's in.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-2-lnb.mp3'),
      },
      'phase-3-hpa': {
        text: `
        <p>
          Good awareness on the HPA state. That mute control is your safety - it prevents RF emission when you're doing maintenance or when there's a problem. Never assume it's muted; always verify.
        </p>
        <p>
          Next, let's check the antenna control unit. The antenna needs to stay pointed at TIDEMARK-1 to maintain the link.
        </p>
        <p>
          There are different tracking modes: program-track follows predicted orbital position from ephemeris data, step-track actively hunts for maximum signal, manual lets the operator control pointing directly, and stow parks the antenna safely. Each has its use case. Check what mode we're currently in.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-3-hpa.mp3'),
      },
      'phase-4-antenna': {
        text: `
        <p>
          Different satellites need different tracking approaches. TIDEMARK-1 is eight years old and starting to drift in its orbit, so our tracking strategy may need to adapt over time.
        </p>
        <p>
          Now let's verify the polarization setting. Polarization is how the electromagnetic wave is oriented - and it has to match what the satellite expects.
        </p>
        <p>
          You might see horizontal at 0 degrees, vertical at 90 degrees, or a specific angle that matches the satellite's configuration. If you're off, you lose signal strength. At 90 degrees off from where you should be, you'd be in the null - almost nothing. Check the ACU and see what angle is set.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-4-antenna.mp3'),
      },
      'phase-5-polarization': {
        text: `
        <p>
          Polarization alignment is one of those details that's easy to overlook but costs you dBs if it's wrong. Always verify it matches the satellite spec.
        </p>
        <p>
          Let's move to the spectrum analyzer. This is where you'll spend a lot of time as an operator - it shows you the RF environment in real time.
        </p>
        <p>
          You're looking for the TIDEMARK-1 beacon signal. It should appear as a narrow spike rising above the noise floor. But you might also see just noise if something's wrong with the receive chain, interference spikes if there's RF contamination, or a flat line if the equipment has a problem. Look at the display and identify what you see.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-5-polarization.mp3'),
      },
      'phase-6-spectrum': {
        text: `
        <p>
          The beacon is your constant reference - if you can see it clean and stable, you know the receive path is working. If it's missing or degraded, that's your first clue something's wrong.
        </p>
        <p>
          Now look at how the spectrum analyzer itself is configured. The settings determine what you can see.
        </p>
        <p>
          Center frequency should match what you're trying to observe - that could be the RF frequency, the IF frequency after downconversion, or baseband depending on where you're tapping the signal. Reference level needs to be set so weak signals are visible above the noise floor on the display. Check the current settings and see if they make sense for beacon observation.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-6-spectrum.mp3'),
      },
      'phase-7-speca-settings': {
        text: `
        <p>
          Getting the spectrum analyzer settings right is an art. Wrong reference level and you either can't see weak signals or you clip strong ones. Wrong center frequency and you're looking at the wrong part of the spectrum entirely.
        </p>
        <p>
          Now let's check the receiver modem. This is where the rubber meets the road - it demodulates the RF signal back into data.
        </p>
        <p>
          The key metric is C/N ratio - Carrier-to-Noise. Higher numbers mean better signal quality. Above 10 dB is healthy with good margin. Around 5 dB is marginal - you might see errors. At or below threshold, the link becomes unreliable. Check the modem panel and see where we stand.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-7-speca-settings.mp3'),
      },
      'phase-8-receiver': {
        text: `
        <p>
          C/N ratio is your primary link health indicator. It tells you how much margin you have before errors start creeping in. Always know where you are relative to threshold.
        </p>
        <p>
          Let's look at the I&Q constellation diagram. This gives you a visual representation of the demodulated symbols.
        </p>
        <p>
          For QPSK modulation, you'll see four cluster positions - one for each symbol. Tight clusters mean clean demodulation. Scattered or spread-out points indicate noise or interference. If the pattern is rotating or stretched, you've got phase or amplitude problems. An empty display means no lock at all. Check what the constellation shows you.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-8-receiver.mp3'),
      },
      'phase-9-constellation': {
        text: `
        <p>
          The constellation diagram is a quick visual health check. Experienced operators can spot problems at a glance - noise, phase errors, interference all show up as distinct patterns.
        </p>
        <p>
          One final check - pull up the alarm dashboard. This aggregates status from every piece of equipment into one view.
        </p>
        <p>
          You might see no alarms if everything's nominal, or various warnings and errors if there are problems - temperature warnings, tracking issues, equipment faults. This is your early warning system. Check the dashboard and see what it's reporting.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-9-constellation.mp3'),
      },
      'phase-10-alarms': {
        text: `
        <p>
          Alright, that covers the complete health check. You've walked through every critical indicator: GPSDO, LNB, HPA, antenna tracking, polarization, spectrum, receiver, constellation, and alarms.
        </p>
        <p>
          Not bad for your first day. Now you know what to look for on each panel and what the different states mean. That's the foundation for everything else - when something goes wrong, you'll recognize it because you know what right looks like.
        </p>
        <p>
          I've got other work to handle, so we'll pick this up tomorrow. Next shift, we'll do something more hands-on - actually powering systems down and bringing them back up in sequence. Get some rest.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/1/v2/obj-phase-10-alarms.mp3'),
      },
    },
  },
}
