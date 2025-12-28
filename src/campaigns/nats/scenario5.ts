import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/signal-origin";
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { Degrees } from 'ootk';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { natsHtmlLayout } from './html-layout';
import { ses10Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 6: "Interference Hunt"
 *
 * Phase: Intermediate
 * Time Pressure: Moderate
 * Calculation Required: None (guided analysis)
 * Focus: Spectrum analysis, interference identification, notch filter mitigation
 *
 * Premise: Customer reports degraded service on TIDEMARK-1. C/N ratio has dropped
 * because of a 3 MHz interference spike WITHIN our 36 MHz signal bandwidth. This is
 * caused by a third-party operator's polarization mismatch - their cross-pol leakage
 * is landing in our transponder. The AGC is reducing gain based on the spike, which
 * degrades overall C/N.
 *
 * Solution: Apply a 3 MHz notch filter at the interference frequency to block the
 * spike while passing the rest of our 36 MHz signal.
 *
 * Flow:
 * 1. Observe degraded C/N on receiver
 * 2. Identify the 3 MHz spike on spectrum analyzer (already visible in 100 MHz span)
 * 3. Understand it's in-band interference from cross-pol leakage
 * 4. Apply notch filter to block the spike
 * 5. Verify C/N restored
 */

export const scenario5Data: ScenarioData = {
  id: 'nats-scenario5',
  prerequisiteScenarioIds: [],
  url: 'nats/scenarios/nats-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  title: 'Interference Hunt',
  subtitle: 'Spectrum Analysis and Mitigation',
  duration: '15-20 min',
  difficulty: 'intermediate',
  missionType: 'Troubleshooting',
  description: `Customer reports degraded service on TIDEMARK-1. The C/N ratio has dropped significantly, causing packet errors.<br><br>The spectrum analyzer is currently configured for beacon tracking - you'll need to reconfigure it to investigate the main signal. Something's causing interference, and you'll need to find it, understand what's happening, and apply the right mitigation.<br><br>Charlie will guide you through the troubleshooting process and provide hints along the way.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem',
    'IF Filter Bank',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
      {
        ...maineGroundStation,
        isOperational: true,
      },
    ],
    layout: natsHtmlLayout,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-6?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        'TIDEMARK-1',
        61525,
        [
          // Uplink signals - routed to transponders based on frequency and polarization
          {
            signalId: 'TIDEMARK-1-TDMA-Composite',
            serverId: 1,
            noradId: 61525,
            frequency: 5943e6 as RfFrequency,
            polarization: 'H',
            power: 20 as dBm,
            bandwidth: 36e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            // Cross-pol interference: 3 MHz spike within TP-1's 36 MHz passband
            // 5960 MHz uplink = 17 MHz above TP-1 center (5943 MHz)
            // Falls within TP-1's passband (5925-5961 MHz)
            // Simulates polarization mismatch from another operator
            signalId: 'cross-pol-interference',
            serverId: 1,
            noradId: 61525,
            frequency: 5960e6 as RfFrequency,
            polarization: 'H',
            power: 26 as dBm,
            bandwidth: 1e6 as Hertz, // Narrowband spike
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [], // Beacons now defined in transponderConfigs
        {
          az: 161.8 as Degrees,
          el: 34.2 as Degrees,
          rotation: 14 as Degrees,
          frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
          transponderConfigs: [
            {
              id: 'TP-1',
              uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
              polarization: 'H',
              beacon: {
                frequency: 4175.5e6 as RfFrequency,
                signalId: 'TIDEMARK-1-Beacon',
                serverId: 1,
                noradId: 61525,
                power: 40 as dBm,
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
            } as TransponderConfig,
            {
              id: 'TP-2',
              uplinkCenterFrequency: 5906e6 as RfFrequency, // Passband: 5963-5999 MHz
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3756 MHz
              polarization: 'H',
              // No beacon for TP-2
            } as TransponderConfig,
          ],
        }
      ),
      ses10Satellite,
      tidemark2Satellite
    ],
  },
  timeLimitSeconds: 1800, // 30 minutes
  objectives: [
    // Phase 1: Confirm the customer complaint
    {
      id: 'phase-1-observe-degradation',
      title: 'Confirm Signal Degradation',
      description: 'Check the receiver modem to confirm the customer\'s report of degraded service.',
      groundStation: 'VT-01',
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify C/N Degradation',
          params: {
            question: 'Looking at the receiver modem, what is the current C/N ratio status?',
            options: [
              'C/N is degraded - well below normal operating threshold',
              'C/N is healthy - operating normally',
              'C/N is marginal - at threshold',
              'No signal lock - receiver is offline',
            ],
            correctIndex: 0,
            explanation: 'The C/N ratio is well below the normal operating level. This confirms the customer complaint - something is degrading our signal quality.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // Phase 2: Widen spectrum view (NEW)
    {
      id: 'phase-2-configure-span',
      title: 'Widen Spectrum View',
      description: 'The spectrum analyzer is currently configured for beacon observation. Widen the frequency span to see the full signal bandwidth.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-observe-degradation'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-span-set',
          description: 'Span widened to see full signal',
          params: {
            span: 75e6, // 75 MHz span
            frequencyTolerance: 25e6, // Allow 50-100 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW set to automatic',
          params: {
            rbw: null, // Automatic RBW
          },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Center frequency set to see full signal',
          params: {
            centerFrequency: 1532e6 as Hertz, // Beacon IF is 1520 MHz, signal is 10 MHz higher
            centerFrequencyTolerance: 1e6, // Allow +/- 1 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min amplitude set just below noise floor',
          params: {
            minAmplitude: -115 as dBm,
            minAmplitudeTolerance: 20 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max amplitude set just above signal peak',
          params: {
            maxAmplitude: 0 as dBm,
            maxAmplitudeTolerance: 30 as dBm,
          },
          mustMaintain: true,
        }
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    // Phase 3: Locate main signal (NEW)
    {
      id: 'phase-3-locate-signal',
      title: 'Center on Downlink Signal',
      description: 'Move the spectrum analyzer center frequency to observe the main downlink signal. Think about where the signal should appear at IF.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-configure-span'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center frequency set to see main signal',
          params: {
            centerFrequency: 1532e6 as Hertz, // Main signal IF
            centerFrequencyTolerance: 20e6, // Allow 1512-1552 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Main signal visible',
          params: {
            signalId: 'TIDEMARK-1-TDMA-Composite',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    // Phase 4: Identify interference
    {
      id: 'phase-4-identify-interference',
      title: 'Identify Interference',
      description: 'Look at the spectrum analyzer display. Our wideband signal should be visible - is there anything else that shouldn\'t be there?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-locate-signal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify the Interference',
          params: {
            question: 'Looking at the spectrum analyzer, what do you see within our wideband signal?',
            options: [
              'A narrowband spike sitting within our wideband signal',
              'Our signal looks normal with no interference',
              'The entire noise floor is elevated uniformly',
              'Multiple spikes scattered across the spectrum',
            ],
            correctIndex: 0,
            explanation: 'There\'s a narrowband spike sitting within our wideband signal. This is in-band interference - it\'s not adjacent to our signal, it\'s inside it. That\'s why it\'s so problematic.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // Phase 5: Characterize interference (NEW)
    {
      id: 'phase-5-characterize-interference',
      title: 'Characterize the Interference',
      description: 'Look closely at the interference. What can you determine about its bandwidth compared to our main signal?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-identify-interference'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Interference Bandwidth',
          params: {
            question: 'How does the interference bandwidth compare to our main signal?',
            options: [
              'Much narrower - a spike only a few MHz wide within our wideband signal',
              'Same width - the interference matches our signal bandwidth',
              'Much wider - the interference spans beyond our signal',
              'Variable - the interference bandwidth keeps changing',
            ],
            correctIndex: 0,
            explanation: 'The interference is a narrowband spike - only a few MHz wide compared to our wideband signal. This is important because it means we can surgically remove it with a notch filter without affecting most of our signal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    // Phase 6: Understand cause
    {
      id: 'phase-6-understand-cause',
      title: 'Understand the Interference Source',
      description: 'Determine what\'s causing this in-band interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-characterize-interference'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Interference Cause',
          params: {
            question: 'What is the most likely cause of this narrowband spike within our signal bandwidth?',
            options: [
              'Cross-polarization leakage from another operator\'s uplink',
              'A faulty component in our own transmit chain',
              'Terrestrial interference from nearby radio towers',
              'Solar radio emissions during a flare event',
            ],
            correctIndex: 0,
            explanation: 'This is cross-polarization interference. Another operator is transmitting on the orthogonal polarization, but their polarization isolation isn\'t perfect. Some of their signal is leaking into our polarization and landing in our transponder bandwidth.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // Phase 7: Understand AGC impact
    {
      id: 'phase-7-understand-impact',
      title: 'Understand the AGC Impact',
      description: 'Understand why this spike is affecting our C/N ratio across the entire signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-6-understand-cause'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Understand AGC Impact',
          params: {
            question: 'Why is this narrowband spike causing the C/N to drop across our entire wideband signal?',
            options: [
              'The AGC sees the spike as part of the total signal and reduces gain accordingly',
              'The spike is overloading the LNB causing compression',
              'The interference is jamming our tracking beacon',
              'The spike is exactly on our carrier center frequency',
            ],
            correctIndex: 0,
            explanation: 'The receiver\'s AGC (Automatic Gain Control) measures total power in the passband. It sees the strong spike and reduces gain to prevent overload. But this gain reduction affects our entire signal, degrading the C/N ratio for the wanted carrier.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // Phase 8: Configure notch filter
    {
      id: 'phase-8-apply-notch-filter',
      title: 'Configure Notch Filter',
      description: 'Configure a notch filter to surgically remove the interference spike. Match the filter settings to what you observed on the spectrum.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-understand-impact'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch Filter Configured',
          params: {
            notchCenterFrequency: 1515, // MHz - IF frequency of interference (5250 - 3735 = 1515)
            notchBandwidth: 1, // MHz - matches narrowband interference
            notchDepth: 40, // dB - sufficient attenuation
            notchCenterFrequencyTolerance: 0, // Exact match required
            notchBandwidthTolerance: 0.25,
            notchDepthTolerance: 20,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    // Phase 9: Verify restoration
    {
      id: 'phase-9-verify-restoration',
      title: 'Verify Service Restored',
      description: 'Confirm the notch filter has restored normal C/N ratio.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-apply-notch-filter'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify C/N Restoration',
          params: {
            question: 'After applying the notch filter, what happened to the signal?',
            options: [
              'C/N restored to normal levels - the spike is notched out and AGC normalized',
              'C/N unchanged - the filter had no effect',
              'Signal lock lost - the notch filter blocked our carrier',
              'C/N dropped further - wrong filter settings',
            ],
            correctIndex: 0,
            explanation: 'The notch filter blocks the interference spike while passing the rest of our wideband signal. With the spike removed, the AGC no longer sees the excess power and allows proper gain. C/N returns to normal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        Got a trouble ticket from SeaLink - their customer is reporting packet errors on TIDEMARK-1. Something's degraded the link but I haven't had time to dig into it yet.
      </p>
      <p>
        Start by checking the receiver to confirm there's actually a problem, then work through the diagnosis. I'll check in as you go.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/6/intro.mp3'),
    },
    objectives: {
      'phase-1-observe-degradation': {
        text: `
        <p>
          That C/N is well below normal. The customer's complaint is legitimate.
        </p>
        <p>
          But before we dig into why, we need to see what's happening on the spectrum. The analyzer is still configured for beacon tracking - you'll need to widen the span to at least 50 megahertz to see our full 36 megahertz signal, and center it on the downlink frequency.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-1.mp3'),
      },
      'phase-2-configure-span': {
        text: `
        <p>
          Good. Now we can see more of the picture. The receiver modem is tuned to 1,532 megahertz - that's where our main signal sits at IF.
        </p>
        <p>
          Make sure you can see the full signal and look for anything that doesn't belong.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-2.mp3'),
      },
      'phase-3-locate-signal': {
        text: `
        <p>
          There's our wideband signal. But look carefully - there's something else in there that shouldn't be.
        </p>
        <p>
          See if you can spot what doesn't belong.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-3.mp3'),
      },
      'phase-4-identify-interference': {
        text: `
        <p>
          You found it. There's a spike sitting inside our signal bandwidth. That's in-band interference - worse than adjacent channel because we can't just filter it out with a narrower passband.
        </p>
        <p>
          Look at it more closely - what can you tell about its characteristics?
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-4.mp3'),
      },
      'phase-5-characterize-interference': {
        text: `
        <p>
          It's narrowband - just a spike compared to our wideband signal. That's the good news. The bad news is it's strong enough to cause problems.
        </p>
        <p>
          Think about what could put a narrowband signal inside our bandwidth on this transponder...
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-5.mp3'),
      },
      'phase-6-understand-cause': {
        text: `
        <p>
          Cross-pol leakage. Another operator's signal bleeding through. Their cross-pol isolation isn't perfect, and we're picking up some of their energy.
        </p>
        <p>
          But here's the puzzle - that spike is narrow. Why would it degrade our entire wideband signal? Think about what the receiver does with total power in the passband.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-6.mp3'),
      },
      'phase-7-understand-impact': {
        text: `
        <p>
          Exactly. The AGC sees total power and adjusts gain accordingly. That spike is fooling it into backing off the gain across the whole band.
        </p>
        <p>
          The fix is surgical - we need to notch out just that interference while leaving our signal intact. Look at the spectrum - the spike appears around 1,515 megahertz. Set your notch filter center frequency there, with a bandwidth of about 1 megahertz to match the spike width.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-7.mp3'),
      },
      'phase-8-apply-notch-filter': {
        text: `
        <p>
          Check the receiver now. If you got the notch parameters right, the AGC should normalize and C/N should come back up.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-8.mp3'),
      },
      'phase-9-verify-restoration': {
        text: `
        <p>
          C/N's restored. The notch filter is blocking the interference, AGC normalized, and our signal is clean again.
        </p>
        <p>
          Nice work. You diagnosed the interference, figured out why it was affecting the whole signal, and applied the right fix.
        </p>
        <p>
          I'll file a coordination request to track down the source. For now, the customer's happy and we've got a workaround in place.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/complete.mp3'),
      },
    },
  },
};
