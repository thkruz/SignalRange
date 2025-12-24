import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';

/**
 * NATS Level 6: "Interference Hunt"
 *
 * Phase: Pressure
 * Time Pressure: High (15 minutes until SLA breach)
 * Calculation Required: As needed
 * New UI Elements: Wide-span spectrum sweep, interference measurement tools, filter notch controls
 *
 * Premise: Customer reports intermittent service degradation on TIDEMARK-1. SLA clock
 * is ticking - you have 15 minutes to identify and resolve the interference before
 * penalties kick in. Charlie is tied up on another call and mostly unavailable.
 */

export const scenario6Data: ScenarioData = {
  id: 'nats-level-6-interference-hunt',
  prerequisiteScenarioIds: [],
  url: 'nats/level-6/interference-hunt',
  imageUrl: 'nats/6/card.png',
  number: 6,
  title: 'Level 6: "Interference Hunt"',
  subtitle: 'Troubleshooting Under Pressure',
  duration: '20-25 min',
  difficulty: 'advanced',
  missionType: 'Pressure Phase',
  description: `Customer reports degraded service on TIDEMARK-1. Packet loss is climbing, C/N ratio has dropped 6 dB from normal. Something's interfering with the downlink carrier.<br><br>SLA terms are clear: service must be restored within 15 minutes or financial penalties apply. The clock started when the customer called.<br><br>Charlie is stuck on another emergency call and can only provide brief support via intercom. You're solo on console. You need to: identify the interference source, determine its characteristics (frequency, type, power), implement a mitigation solution, and restore service quality.<br><br>This is real operations - time pressure, limited support, customer impact. Work fast but work smart.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer (wide-span capable)',
    'Receiver Modem',
    'IF Filter Bank with Notch Filters',
    'Interference Analysis Tools',
  ],
  settings: {
    isSync: true,
    missionTimeLimitSeconds: 900, // 15 minutes hard deadline
    // slaBreachWarnings: [300, 120, 60], // Warnings at 5 min, 2 min, 1 min remaining
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
            // Locked on TIDEMARK-1 but degraded performance
            isPowered: true,
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'step-track',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { isPowered: false, loFrequency: 2225 as MHz, outputPower: 0 as dBm, isMuted: true, isExtRefLocked: false },
            hpa: { isPowered: false, outputPower: 0 as dBm },
            filter: { bandwidthIndex: 3 }, // Wide filter currently selected
            lnb: { noiseTemperature: 65, temperature: 45 },
            gpsdo: {
              temperature: 65,
              satelliteCount: 11,
              utcAccuracy: 18,
              lockDuration: 86400,
              frequencyAccuracy: 1e-12,
              allanDeviation: 5e-13,
              phaseNoise: -140,
              operatingHours: 86400,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -50,
            centerFrequency: 3952.5e6 as Hertz, // Looking at carrier
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
            // Wide-span mode available
            // maxSpan: 500e6 as Hertz, // Can sweep 500 MHz
          }
        ],
        transmitters: [],
        receivers: [Receiver.getDefaultState()],
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
            frequency: 3947.8e6 as RfFrequency,
            polarization: 'H',
            power: -95 as dBm,
            bandwidth: 1e3 as Hertz,
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
            frequency: 3952.5e6 as RfFrequency,
            polarization: 'H',
            power: -87 as dBm, // Normal power
            bandwidth: 5e6 as Hertz,
            modulation: '16APSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: 'maritime-data.mp4',
            isDegraded: true, // Degraded by interference
            // degradationReason: 'interference',
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
    // interferenceSignals: [
    //   {
    //     id: 'adjacent-carrier-interference',
    //     type: 'adjacent-channel-carrier',
    //     frequency: 3957.5e6 as RfFrequency, // 5 MHz above desired carrier
    //     power: -83 as dBm, // Stronger than desired signal
    //     bandwidth: 3e6 as Hertz,
    //     modulation: 'QPSK' as ModulationType,
    //     source: 'Unknown terrestrial uplink (likely incorrect polarization)',
    //     isIntermittent: false,
    //   }
    // ],
  },
  objectives: [
    {
      id: 'assess-degradation',
      title: 'Phase 1: Assess Service Degradation',
      description: 'Verify the problem and measure current C/N ratio. SLA clock is running.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'cn-ratio-measured',
          description: 'Current C/N Ratio Measured (degraded)',
          params: {
            expectedDegradation: 6 as dB, // Should be ~6 dB below normal
          },
          mustMaintain: false,
        },
        {
          type: 'packet-loss-confirmed',
          description: 'Packet Loss Confirmed (> 2%)',
          params: {
            minPacketLoss: 2, // percent
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'wide-span-sweep',
      title: 'Phase 2: Perform Wide-Span Spectrum Sweep',
      description: 'Switch spectrum analyzer to wide-span mode to search for interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assess-degradation'],
      conditions: [
        {
          type: 'speca-mode-changed',
          description: 'Spectrum Analyzer Switched to Wide-Span Mode',
          params: {
            mode: 'wide-span',
          },
          mustMaintain: false,
        },
        {
          type: 'speca-span-set',
          description: 'Span ≥ 50 MHz (wide enough to see interference)',
          params: {
            minSpan: 50e6,
          },
          mustMaintain: false,
        },
        {
          type: 'frequency-sweep-completed',
          description: 'Frequency Sweep Completed',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'identify-interference',
      title: 'Phase 3: Identify Interference Source',
      description: 'Locate and characterize the interfering signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['wide-span-sweep'],
      conditions: [
        {
          type: 'interference-detected',
          description: 'Interference Signal Located',
          params: {
            interferenceId: 'adjacent-carrier-interference',
          },
          mustMaintain: false,
        },
        {
          type: 'interference-frequency-measured',
          description: 'Interference Frequency Identified (~3,957.5 MHz)',
          params: {
            expectedFrequency: 3957.5e6 as RfFrequency,
            tolerance: 100e3 as Hertz,
          },
          mustMaintain: false,
        },
        {
          type: 'interference-power-measured',
          description: 'Interference Power Level Measured (~-83 dBm)',
          params: {
            expectedPower: -83 as dBm,
            tolerance: 2 as dB,
          },
          mustMaintain: false,
        },
        {
          type: 'interference-type-identified',
          description: 'Interference Type Identified (Adjacent Channel Carrier)',
          params: {
            interferenceType: 'adjacent-channel-carrier',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'calculate-ci-ratio',
      title: 'Phase 4: Calculate Carrier-to-Interference Ratio',
      description: 'Determine C/I ratio to confirm it explains the degradation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['identify-interference'],
      conditions: [
        {
          type: 'ci-ratio-calculated',
          description: 'C/I Ratio Calculated',
          params: {
            carrierPower: -87 as dBm,
            interferencePower: -83 as dBm,
            expectedCIRatio: 4 as dB, // -87 - (-83) = 4 dB (very poor)
            tolerance: 1 as dB,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'implement-filter-solution',
      title: 'Phase 5: Implement Filter-Based Mitigation',
      description: 'Select and apply IF filter with notch at interference frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-ci-ratio'],
      conditions: [
        {
          type: 'filter-selected',
          description: 'Notch Filter Selected (1 MHz with notch at +5 MHz)',
          params: {
            filterId: 7, // 1 MHz bandwidth with notch at +5 MHz offset
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'interference-suppressed',
          description: 'Interference Suppressed by Notch Filter',
          params: {
            minSuppression: 15 as dB, // Notch provides ~15-20 dB rejection
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-service-restoration',
      title: 'Phase 6: Verify Service Quality Restored',
      description: 'Confirm C/N ratio improved and packet loss eliminated.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['implement-filter-solution'],
      conditions: [
        {
          type: 'cn-ratio-improved',
          description: 'C/N Ratio Improved ≥ 6 dB',
          params: {
            minImprovement: 6 as dB,
            targetCnRatio: 11 as dB, // Back to acceptable level
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'packet-loss-eliminated',
          description: 'Packet Loss < 0.5%',
          params: {
            maxPacketLoss: 0.5,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'service-quality-stable',
          description: 'Service Quality Stable for 60 Seconds',
          maintainDuration: 60,
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'sla-compliance',
      title: 'Phase 7: SLA Compliance',
      description: 'Service restored within 15-minute SLA window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-service-restoration'],
      conditions: [
        {
          type: 'time-remaining',
          description: 'Resolved Before SLA Breach',
          params: {
            minTimeRemaining: 0, // Just need to finish before deadline
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        [Intercom, Charlie sounds stressed] Customer on the phone reporting degraded service on TIDEMARK-1. Packet loss climbing, C/N's down six dB.
      </p>
      <p>
        I'm stuck on this call with another customer for at least ten minutes. You need to handle this solo.
      </p>
      <p>
        SLA terms say we've got fifteen minutes to restore service or we're paying penalties. Clock started when they called - three minutes ago.
      </p>
      <p>
        Use the wide-span sweep to find the interferer. Check the filter bank settings - you might be able to notch it out. Page me if you absolutely need help, but I trust you can handle this.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.FRUSTRATED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/6/intro.mp3'),
    },
    objectives: {
      'assess-degradation': {
        text: `
        <p>
          C/N down to about 6 dB. That's bad - we need at least 7 for this modulation scheme, and we usually run at 12.
        </p>
        <p>
          Packet loss over 2 percent. Customer's definitely seeing impact.
        </p>
        <p>
          Twelve minutes left on the SLA. Move fast.
        </p>
        `,
        character: Character.FRANCIS_MARTIN, //Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-assess.mp3'),
      },
      'identify-interference': {
        text: `
        <p>
          There it is - adjacent channel carrier at 3,957.5 megahertz. Five megahertz above our signal.
        </p>
        <p>
          Power's at minus-83 dBm. That's 4 dB stronger than our carrier. No wonder we're having problems.
        </p>
        <p>
          Looks like someone's uplink hit the wrong polarization or satellite. Not our fault, but we still need to fix it.
        </p>
        <p>
          Nine minutes remaining.
        </p>
        `,
        character: Character.FRANCIS_MARTIN, //Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-identify.mp3'),
      },
      'calculate-ci-ratio': {
        text: `
        <p>
          C/I ratio is 4 dB. That's terrible - we need at least 15 dB for clean operation.
        </p>
        <p>
          Combined with the thermal noise, this explains exactly why the C/N dropped 6 dB.
        </p>
        <p>
          Check the filter bank. There should be a notch filter that can reject that adjacent carrier.
        </p>
        `,
        character: Character.FRANCIS_MARTIN, //Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-calculate.mp3'),
      },
      'implement-filter-solution': {
        text: `
        <p>
          Notch filter applied. Watch the spectrum - interference is getting suppressed by the notch.
        </p>
        <p>
          C/N should start climbing back up now.
        </p>
        `,
        character: Character.FRANCIS_MARTIN, //Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-filter.mp3'),
      },
      'verify-service-restoration': {
        text: `
        <p>
          C/N's back up to 11 dB. Packet loss dropped to near zero.
        </p>
        <p>
          Service quality looks stable. Good work.
        </p>
        `,
        character: Character.FRANCIS_MARTIN, //Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify.mp3'),
      },
      'sla-compliance': {
        text: `
        <p>
          [Intercom, Charlie sounds relieved] Saw the C/N come back up on the monitoring dashboard. Nice work - you beat the SLA deadline with time to spare.
        </p>
        <p>
          You identified the interference, calculated the impact, implemented a solution, and verified the fix. Exactly what I needed you to do.
        </p>
        <p>
          That's real operations right there - time pressure, customer impact, working solo. You handled it.
        </p>
        <p>
          I'll file a coordination request to track down whoever's transmitting on that adjacent carrier. For now, the customer's happy and we're not paying penalties.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/complete.mp3'),
      },
    },
  },
};
