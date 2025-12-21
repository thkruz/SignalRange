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
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';

/**
 * NATS Level 1: "First Day"
 * 
 * Phase: Tutorial
 * Time Pressure: None
 * Calculation Required: None
 * New UI Elements: All panels (observation only)
 * 
 * Premise: Your actual first day at NATS. Charlie walks you through a routine 
 * health check on already-operational equipment. TIDEMARK-1 is in service and 
 * you're learning what each indicator means.
 */

export const level1FirstDay: ScenarioData = {
  id: 'nats-level-1-first-day',
  url: 'nats/level-1/first-day',
  imageUrl: 'nats/1/card.png',
  number: 1,
  title: 'Level 1: "First Day"',
  subtitle: 'Equipment Familiarization',
  duration: '15-20 min',
  difficulty: 'beginner',
  missionType: 'Tutorial',
  description: `Your first day at North Atlantic Teleport Services. Charlie Brooks, the senior operator who will be training you before his departure to Europe next month, walks you through a routine health check of the Vermont Ground Station (VT-01).<br><br>TIDEMARK-1, a C-band maritime communications satellite operated by SeaLink Global Communications, is already online and serving customer traffic at 53°W. You won't be establishing contact today - just learning what each equipment indicator means and how to navigate the control systems.<br><br>This is pure observation and familiarization. No time pressure, no failure states. Just learn where everything is and what "normal" looks like.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (GPSDO, LNB, BUC, HPA)',
    'Spectrum Analyzer',
    'Modem (RX/TX)',
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
          elevation: 350,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // TIDEMARK-1 already locked and serving traffic
            isPowered: true,
            azimuth: 214.2 as Degrees, // Pointing at 53°W from Vermont
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'step-track',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
          omt: OMTModule.getDefaultState(),
          buc: {
            ...BUCModuleCore.getDefaultState(),
            isPowered: true,
            loFrequency: 2225 as MHz,
            outputPower: 10 as dBm,
            isMuted: false,
            isExtRefLocked: true,
          },
          hpa: {
            ...HPAModuleCore.getDefaultState(),
            isPowered: true,
            isEnabled: true,
            outputPower: 100, // Watts
          },
          filter: {
            ...IfFilterBankModuleCore.getDefaultState(),
            isPowered: true,
            selectedFilter: 3,
          },
          lnb: {
            isPowered: true,
            loFrequency: 5150 as MHz,
            gain: 55 as dB,
            lnaNoiseFigure: 0.6,
            mixerNoiseFigure: 16.0,
            noiseTemperature: 65, // K - already stabilized
            noiseTemperatureStabilizationTime: 0,
            isExtRefLocked: true,
            noiseFloor: -140,
            frequencyError: 0,
            temperature: 45, // °C - stable
            thermalStabilizationTime: 0,
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
            isLocked: true, // Already locked - stable reference
            warmupTimeRemaining: 0,
            temperature: 65, // °C - stable
            gnssSignalPresent: true,
            isGnssSwitchUp: true,
            isGnssAcquiringLock: false,
            satelliteCount: 12,
            utcAccuracy: 15, // nanoseconds
            constellation: 'GPS',
            lockDuration: 43200, // 12 hours
            frequencyAccuracy: 1e-12,
            allanDeviation: 5e-13,
            phaseNoise: -140,
            isInHoldover: false,
            holdoverDuration: 0,
            holdoverError: 0,
            active10MHzOutputs: 5,
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: true,
            operatingHours: 43200,
            selfTestPassed: true,
            agingRate: 1e-10,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: -50, // dBm
            centerFrequency: 3947.8e6 as Hertz, // TIDEMARK-1 beacon visible
            span: 10e6 as Hertz,
            rbw: 10e3 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 12 as dB,
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
        transmitters: 1,
        receivers: 1,
      },
    ],
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: 'tidemark-1-beacon',
            serverId: 1,
            noradId: 1,
            frequency: 3947.8e6 as RfFrequency, // C-band downlink beacon
            polarization: 'H',
            power: -95 as dBm, // As received at ground
            bandwidth: 1e3 as Hertz, // CW beacon
            modulation: 'CW' as ModulationType,
            fec: 'none' as FECType,
            feed: null,
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            signalId: 'tidemark-1-carrier',
            serverId: 1,
            noradId: 1,
            frequency: 3952.5e6 as RfFrequency, // Active customer carrier
            polarization: 'H',
            power: -87 as dBm,
            bandwidth: 5e6 as Hertz,
            modulation: '16APSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: 'maritime-data.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          name: 'TIDEMARK-1',
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ]
  },
  objectives: [
    {
      id: 'observe-gpsdo',
      title: 'Phase 1: GPS Disciplined Oscillator Status',
      description: 'Observe and understand the GPSDO status panel. Charlie will explain what each indicator means.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'panel-viewed',
          description: 'GPSDO Panel Opened',
          params: {
            panelId: 'gpsdo',
          },
          mustMaintain: false,
        },
        {
          type: 'indicator-acknowledged',
          description: 'GPS Lock Status Acknowledged',
          params: {
            indicatorId: 'gpsdo-lock-status',
          },
          mustMaintain: false,
        },
        {
          type: 'indicator-acknowledged',
          description: '10 MHz Reference Outputs Acknowledged',
          params: {
            indicatorId: 'gpsdo-reference-outputs',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'observe-lnb',
      title: 'Phase 2: Low Noise Block Downconverter',
      description: 'Review the LNB configuration and status indicators.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-gpsdo'],
      conditions: [
        {
          type: 'panel-viewed',
          description: 'LNB Panel Opened',
          params: {
            panelId: 'lnb',
          },
          mustMaintain: false,
        },
        {
          type: 'configuration-noted',
          description: 'LNB LO Frequency Configuration Noted (5,150 MHz)',
          params: {
            parameterId: 'lnb-lo-frequency',
          },
          mustMaintain: false,
        },
        {
          type: 'configuration-noted',
          description: 'LNB Gain Setting Noted (55 dB)',
          params: {
            parameterId: 'lnb-gain',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'observe-antenna',
      title: 'Phase 3: Antenna Position and Tracking',
      description: 'Check the antenna pointing and tracking status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-lnb'],
      conditions: [
        {
          type: 'panel-viewed',
          description: 'Antenna Control Panel Opened',
          params: {
            panelId: 'antenna-control',
          },
          mustMaintain: false,
        },
        {
          type: 'position-noted',
          description: 'Antenna Azimuth Position Noted (~214°)',
          params: {
            parameterId: 'antenna-azimuth',
          },
          mustMaintain: false,
        },
        {
          type: 'position-noted',
          description: 'Antenna Elevation Position Noted (~25°)',
          params: {
            parameterId: 'antenna-elevation',
          },
          mustMaintain: false,
        },
        {
          type: 'tracking-mode-noted',
          description: 'Step-Track Mode Acknowledged',
          params: {
            parameterId: 'tracking-mode',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'observe-spectrum',
      title: 'Phase 4: Spectrum Analyzer Observation',
      description: 'View the spectrum analyzer showing the TIDEMARK-1 beacon signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-antenna'],
      conditions: [
        {
          type: 'panel-viewed',
          description: 'Spectrum Analyzer Panel Opened',
          params: {
            panelId: 'spectrum-analyzer',
          },
          mustMaintain: false,
        },
        {
          type: 'signal-identified',
          description: 'Beacon Signal Identified on Display',
          params: {
            signalId: 'tidemark-1-beacon',
          },
          mustMaintain: false,
        },
        {
          type: 'signal-level-noted',
          description: 'Signal Level Reading Noted (~-95 dBm)',
          params: {
            signalId: 'tidemark-1-beacon',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'observe-modem',
      title: 'Phase 5: Modem Telemetry Review',
      description: 'Check the receiver modem showing the active customer carrier.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-spectrum'],
      conditions: [
        {
          type: 'panel-viewed',
          description: 'Receiver Modem Panel Opened',
          params: {
            panelId: 'rx-modem',
          },
          mustMaintain: false,
        },
        {
          type: 'lock-status-acknowledged',
          description: 'Carrier Lock Status Acknowledged',
          params: {
            parameterId: 'carrier-lock',
          },
          mustMaintain: false,
        },
        {
          type: 'cn-ratio-noted',
          description: 'C/N Ratio Reading Noted',
          params: {
            parameterId: 'cn-ratio',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tour-complete',
      title: 'Phase 6: Equipment Tour Complete',
      description: 'Successfully identify key operational indicators when prompted by Charlie.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-modem'],
      conditions: [
        {
          type: 'quiz-question',
          description: 'What does green lock indicator on GPSDO mean?',
          params: {
            questionId: 'gpsdo-lock-meaning',
            correctAnswer: 'stable-10mhz-reference',
          },
          mustMaintain: false,
        },
        {
          type: 'quiz-question',
          description: 'Why is LNB thermal stabilization important?',
          params: {
            questionId: 'lnb-thermal',
            correctAnswer: 'frequency-stability',
          },
          mustMaintain: false,
        },
        {
          type: 'quiz-question',
          description: 'What tracking mode is currently active?',
          params: {
            questionId: 'tracking-mode',
            correctAnswer: 'step-track',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 50,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        I've got three new hires to train before I leave next month, so let's make good use of our time.
      </p>
      <p>
        TIDEMARK-1 is already serving customer traffic at 53 West - maritime broadband from Newfoundland down to the Caribbean. You're not touching anything today, just learning where everything is.
      </p>
      <p>
        Click on the GPSDO panel. See that green lock indicator? That's what we want to see - means we've got a stable 10 MHz reference for the entire rack. Everything else keys off that clock.
      </p>
      <p>
        We'll walk through each subsystem. Take your time, ask questions if something's unclear. Better to understand it now than guess later when you're solo on console.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/intro.mp3'),
    },
    objectives: {
      'observe-gpsdo': {
        text: `
        <p>
          Good. GPS lock is solid - twelve satellites in view, frequency accuracy at 1 part in 10^12. That's textbook.
        </p>
        <p>
          See those five outputs lit up? That's the 10 MHz reference feeding the LNB, BUC, spectrum analyzer, and both modems. They all need to stay phase-coherent.
        </p>
        <p>
          If this ever drops to holdover mode, you've got maybe twenty minutes before frequency drift kills the link. We'll cover that scenario later.
        </p>
        <p>
          Now click on the LNB panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/obj-gpsdo.mp3'),
      },
      'observe-lnb': {
        text: `
        <p>
          LNB's running at 5,150 MHz local oscillator, 55 dB gain. Temperature's stable at 45 celsius - took about three minutes to get there after power-up.
        </p>
        <p>
          See that noise temperature reading? 65 Kelvin. Lower is better - means less self-generated noise getting added to the signal. This unit's performing well.
        </p>
        <p>
          The IF output is feeding the spectrum analyzer and receiver modem through that coupler. We'll look at those next.
        </p>
        <p>
          Check the antenna control panel now.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/obj-lnb.mp3'),
      },
      'observe-antenna': {
        text: `
        <p>
          Antenna's pointed at azimuth 214, elevation 25 - that's where TIDEMARK-1 sits in the sky from our location in Vermont.
        </p>
        <p>
          It's in step-track mode right now. System's making small adjustments to maximize signal strength. For a geostationary satellite that's not moving much, this works fine.
        </p>
        <p>
          Later this week I'll show you program track - that's for satellites with inclined orbits that appear to move. TIDEMARK-1's eight years old and starting to drift north-south daily. We'll get there.
        </p>
        <p>
          Open the spectrum analyzer panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/obj-antenna.mp3'),
      },
      'observe-spectrum': {
        text: `
        <p>
          There's your beacon - that sharp spike at 3,947.8 MHz. Continuous wave carrier, about -95 dBm. Spacecraft transmits it constantly so we can verify the link.
        </p>
        <p>
          See that wider signal at 3,952.5 MHz? That's the active customer carrier - maritime vessel traffic. 5 megahertz bandwidth, running 16APSK modulation.
        </p>
        <p>
          The rest of that trace is noise floor. Clean baseline means no interference, which is exactly what we want.
        </p>
        <p>
          Now check the receiver modem panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/obj-spectrum.mp3'),
      },
      'observe-modem': {
        text: `
        <p>
          Modem's locked on that 3,952.5 MHz carrier. C/N ratio is 12.3 dB - well above the 7 dB threshold for this modulation scheme.
        </p>
        <p>
          That means bit errors are essentially zero. Customer's getting clean data, we're meeting SLA requirements. This is what normal operations look like.
        </p>
        <p>
          You've seen all the major subsystems now. Let me ask you a few questions to make sure you're tracking.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/obj-modem.mp3'),
      },
      'tour-complete': {
        text: `
        <p>
          Not bad. You got the key concepts. GPSDO provides stable reference, LNB downconverts and amplifies, antenna points, spectrum analyzer shows what's there, modem locks and demodulates.
        </p>
        <p>
          Tomorrow we'll do scheduled maintenance - you'll actually power things down and bring them back up. Today was just observation.
        </p>
        <p>
          Equipment familiarization complete. See you at 08:00 tomorrow.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/level-1/complete.mp3'),
      },
    },
  },
};
