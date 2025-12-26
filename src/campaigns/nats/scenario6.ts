import { AntennaState } from '@app/equipment/antenna';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/signal-origin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { natsHtmlLayout } from './html-layout';

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

export const scenario6Data: ScenarioData = {
  id: 'nats-scenario6',
  prerequisiteScenarioIds: [],
  url: 'nats/scenarios/nats-scenario6',
  imageUrl: 'nats/6/card.png',
  number: 6,
  title: 'Interference Hunt',
  subtitle: 'Spectrum Analysis and Mitigation',
  duration: '15-20 min',
  difficulty: 'intermediate',
  missionType: 'Troubleshooting',
  description: `Customer reports degraded service on TIDEMARK-1. The C/N ratio has dropped significantly, causing packet errors.<br><br>The spectrum analyzer shows our 36 MHz carrier, but there's something else in the band - a narrowband spike that shouldn't be there. It's likely cross-polarization leakage from another operator's uplink. The spike is causing the receiver's AGC to reduce gain, which degrades the overall C/N ratio.<br><br>Your job is to identify the interference and apply a notch filter to block it while preserving our wideband signal. Charlie will guide you through the troubleshooting process.`,
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
      {
        ...vermontGroundStation,
        ...{
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
          rfFrontEnds: [
            createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
              buc: { isPowered: false, loFrequency: 2225 as MHz, outputPower: 0 as dBm, isMuted: true, isExtRefLocked: false },
              hpa: { isPowered: false, outputPower: 0 as dBm },
              filter: { bandwidthIndex: 16 }, // Wide 36 MHz filter - student must switch to notch filter (index 4)
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
              referenceLevel: -60,
              centerFrequency: 1432e6 as Hertz, // IF frequency for TIDEMARK-1 carrier
              span: 100e6 as Hertz, // Narrow span - student needs to widen
              rbw: null,
              minAmplitude: -170,
              maxAmplitude: 0,
              scaleDbPerDiv: 10 as dB,
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
          transmitters: [],
          receivers: [{
            activeModem: 1,
            modems: [{
              modemNumber: 1,
              isPowered: true,
              frequency: 1432 as MHz, // IF frequency for 3718 MHz RF with 5150 MHz LO
              bandwidth: 36 as MHz, // Match payload bandwidth
              modulation: 'QPSK',
              fec: '3/4',
              antenna_id: 1,
            }],
          }],
        },
      }
    ],
    layout: natsHtmlLayout,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-6?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: 'TIDEMARK-1-Payload',
            serverId: 1,
            noradId: 61525,
            frequency: 5943e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm,
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
            // Cross-pol interference: 3 MHz spike within our 36 MHz bandwidth
            // 5950 MHz uplink = 7 MHz above our 5943 MHz center
            // Simulates polarization mismatch from another operator
            signalId: 'cross-pol-interference',
            serverId: 1,
            noradId: 61525,
            frequency: 5960e6 as RfFrequency,
            polarization: 'H',
            power: 63 as dBm,
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
        [
          {
            frequency: 3902.5e6 as RfFrequency,
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
        ],
        {
          az: 161.8 as Degrees,
          el: 34.2 as Degrees,
          rotation: 14 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
  },
  timeLimitSeconds: 1800, // 30 minutes
  objectives: [
    {
      id: 'phase-1-observe-degradation',
      title: 'Phase 1: Confirm Signal Degradation',
      description: 'Check the receiver modem to confirm the customer\'s report of degraded service.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify C/N Degradation',
          params: {
            question: 'Looking at the receiver modem, what is the current C/N ratio?',
            options: [
              'C/N is degraded (~6 dB) - below normal operating threshold',
              'C/N is healthy (~12 dB) - operating normally',
              'C/N is marginal (~9 dB) - at threshold',
              'No signal lock - receiver is offline',
            ],
            correctIndex: 0,
            explanation: 'The C/N ratio of approximately 6 dB is well below the normal 12 dB operating level. This confirms the customer complaint - something is degrading our signal quality.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-2-identify-interference',
      title: 'Phase 2: Identify Interference on Spectrum',
      description: 'Look at the spectrum analyzer display. Our 36 MHz signal should be visible, but there\'s something else.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-observe-degradation'],
      conditions: [
        {
          type: 'status-check',
          description: 'Identify the Interference',
          params: {
            question: 'Looking at the spectrum analyzer, what do you see within our 36 MHz signal bandwidth?',
            options: [
              'A narrow 3 MHz spike sitting within our wideband signal',
              'Our signal looks normal with no interference',
              'The entire noise floor is elevated uniformly',
              'Multiple spikes scattered across the spectrum',
            ],
            correctIndex: 0,
            explanation: 'There\'s a 3 MHz narrowband spike sitting within our 36 MHz signal. This is in-band interference - it\'s not adjacent to our signal, it\'s inside it. That\'s why it\'s so problematic.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'phase-3-understand-cause',
      title: 'Phase 3: Understand the Interference Source',
      description: 'Determine what\'s causing this in-band interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-identify-interference'],
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
      points: 15,
    },
    {
      id: 'phase-4-understand-impact',
      title: 'Phase 4: Understand the AGC Impact',
      description: 'Understand why this spike is affecting our C/N ratio.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-3-understand-cause'],
      conditions: [
        {
          type: 'status-check',
          description: 'Understand AGC Impact',
          params: {
            question: 'Why is this 3 MHz spike causing the C/N to drop across our entire 36 MHz signal?',
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
      points: 15,
    },
    {
      id: 'phase-5-apply-notch-filter',
      title: 'Phase 5: Configure Notch Filter',
      description: 'Configure a notch filter to surgically remove the interference spike. Match the filter settings to what you observed on the spectrum.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-4-understand-impact'],
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch Filter Configured',
          params: {
            notchCenterFrequency: 1415, // MHz - IF frequency of interference
            notchBandwidth: 3, // MHz - matches 3 MHz interference
            notchDepth: 36, // dB - sufficient attenuation
            notchCenterFrequencyTolerance: 0, // Allow some tolerance
            notchBandwidthTolerance: 0.25,
            notchDepthTolerance: 10,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'phase-6-verify-restoration',
      title: 'Phase 6: Verify Service Restored',
      description: 'Confirm the notch filter has restored normal C/N ratio.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-apply-notch-filter'],
      conditions: [
        {
          type: 'status-check',
          description: 'Verify C/N Restoration',
          params: {
            question: 'After applying the notch filter, what happened to the signal?',
            options: [
              'C/N restored to ~12 dB - the spike is notched out and AGC normalized',
              'C/N unchanged at 6 dB - the filter had no effect',
              'Signal lock lost - the notch filter blocked our carrier',
              'C/N dropped further - wrong filter selected',
            ],
            correctIndex: 0,
            explanation: 'The 3 MHz notch filter blocks the interference spike while passing the rest of our 36 MHz signal. With the spike removed, the AGC no longer sees the excess power and allows proper gain. C/N returns to normal.',
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
          Six dB C/N - that's well below where we should be running. The customer's complaint is legitimate.
        </p>
        <p>
          Now look at the spectrum analyzer. You can see our 36 MHz wideband signal, but there's also a narrowband spike sitting inside our bandwidth. That spike is our problem.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-1.mp3'),
      },
      'phase-2-identify-interference': {
        text: `
        <p>
          There it is - a 3 MHz spike sitting right inside our 36 MHz signal. That's in-band interference, which is worse than adjacent channel. We can't just use a narrower filter because we'd cut off part of our own signal.
        </p>
        <p>
          Think about what could cause a narrowband signal to land inside our bandwidth on a different polarization...
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-2.mp3'),
      },
      'phase-3-understand-cause': {
        text: `
        <p>
          Cross-pol leakage - that's what this is. Another operator is transmitting on vertical polarization in the same frequency range, and their cross-pol isolation isn't perfect. We're picking up some of their energy on our horizontal pol receiver.
        </p>
        <p>
          This happens. Antennas don't have infinite cross-pol discrimination, especially in rain. Could also be a feed alignment issue on their end.
        </p>
        <p>
          The question is: why does this 3 MHz spike cause our entire 36 MHz signal to degrade? Think about what the receiver does with the total power it sees.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-3.mp3'),
      },
      'phase-4-understand-impact': {
        text: `
        <p>
          Exactly. The AGC doesn't know the difference between our wanted signal and interference. It just sees total power and sets the gain accordingly.
        </p>
        <p>
          That spike is adding extra power to the passband. The AGC backs off the gain to compensate, and now our actual carrier is too weak. The C/N suffers even though the spike isn't directly on top of our signal.
        </p>
        <p>
          The solution is a notch filter. We can surgically remove that 3 MHz spike while leaving the rest of our 36 MHz signal intact. Open the notch filter panel - you'll need to configure the center frequency, width, and depth to match the interference.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-4.mp3'),
      },
      'phase-5-apply-notch-filter': {
        text: `
        <p>
          Now for the fix. You've got all the information you need from the spectrum - the interference frequency and its bandwidth.
        </p>
        <p>
          Configure the notch filter to match what you're seeing. Think about what center frequency, width, and depth would block that spike without cutting into our wanted signal.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-5.mp3'),
      },
      'phase-6-verify-restoration': {
        text: `
        <p>
          C/N's back up where it belongs. The notch filter blocked the interference, the AGC normalized, and our signal is clean again.
        </p>
        <p>
          Nice work. You diagnosed the interference type, understood why it was affecting the whole signal through AGC desensitization, and applied the right filter to fix it.
        </p>
        <p>
          I'll file a coordination request with the satellite operator to track down who's causing the cross-pol leakage. They probably don't even know there's a problem. For now, the customer's happy and we've got a workaround in place.
        </p>
        <p>
          That's interference hunting - observe, diagnose, mitigate, verify. You handled it well.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/complete.mp3'),
      },
    },
  },
};
