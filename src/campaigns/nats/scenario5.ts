import { Satellite, TransponderConfig } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { Degrees } from 'ootk';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { c1TransponderPhysics, ses10Satellite, tidemark2Satellite, VERMONT_LOOK_ANGLE_SITE } from './satellites';

/**
 * NATS Level 5: "Interference Hunt"
 *
 * Phase: Intermediate
 * Time Pressure: Moderate
 * Calculation Required: None (guided analysis)
 * Focus: Spectrum analysis, interference identification, notch filter mitigation
 *
 * Premise: Customer reports degraded service on TIDEMARK-1. C/N ratio has dropped
 * because of a 1 MHz interference spike WITHIN our 36 MHz signal bandwidth. This is
 * caused by a third-party operator's polarization mismatch - their cross-pol leakage
 * is falling in our transponder. The AGC is reducing gain based on the spike, which
 * degrades overall C/N.
 *
 * Solution: Apply a 1 MHz notch filter at the interference frequency to block the
 * spike while passing the rest of our 36 MHz signal.
 *
 * Flow:
 * 1. Navigate to station and review mission brief
 * 2. Navigate to receiver and observe degraded C/N
 * 3. Understand the full impact of the degradation
 * 4. Navigate to spectrum analyzer and understand its current configuration
 * 5. Configure spectrum view (widen span, center on downlink IF)
 * 6. Identify and characterize the interference
 * 7. Record the interference frequency
 * 8. Understand cross-polarization cause
 * 9. Understand AGC impact mechanism
 * 10. Evaluate mitigation options
 * 11. Navigate to filter bank and configure notch filter
 * 12. Verify interference removed on spectrum
 * 13. Verify C/N restored
 * 14. Understand documentation requirements
 */

export const scenario5Data: ScenarioData = {
  id: 'nats-scenario5',
  prerequisiteScenarioIds: ['nats-scenario4'],
  url: 'nats/scenarios/nats-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  title: 'Interference Hunt',
  subtitle: 'Spectrum Analysis and Mitigation',
  duration: '20-25 min',
  difficulty: 'intermediate',
  missionType: 'Troubleshooting',
  description: `Customer reports degraded service on TIDEMARK-1. The C/N ratio has dropped significantly, which is causing packet errors.<br><br>The spectrum analyzer is still set up for beacon tracking, so you'll need to reconfigure it to investigate the main signal. Something is causing interference. You'll need to find it, understand what it's doing, and apply the right mitigation.<br><br>Charlie will guide you through the troubleshooting and give you hints along the way.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'Notch Filter'],
  settings: {
    isSync: true,
    // Vermont-only troubleshooting: ME-02 stays non-operational so its idle
    // GPSDO/AGC alarms don't reach the ticker (nats-s05-F2)
    groundStations: [
      {
        ...vermontGroundStation,
        // Find the spike by hand: AUTO-TUNE would jump straight to it (nats-s05-F3).
        // The morning's pointing check left a manual 10 Hz RBW on the beacon;
        // putting it back on Auto for the wide view is a real step (phase 27)
        spectrumAnalyzers: vermontGroundStation.spectrumAnalyzers.map((sa) => ({ ...sa, isAutoTuneAvailable: false, rbw: 10 as Hertz })),
        // VT-01 carries the SeaLink TM-1 hub carrier as every shift (phase 27:
        // the stand-in composite is gone, so the carrier the customer is on is
        // VT-01's own TP-1 uplink, the default TX chain)
      },
      maineGroundStation,
    ],
    scenarioStartDate: '2026-02-04',
    scenarioStartWallTime: '14:30:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-5?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      new Satellite(
        'TIDEMARK-1',
        61525,
        [
          // Uplink signals - routed to transponders based on frequency and polarization
          {
            // Cross-pol interference: 1 MHz spike within TP-1's 36 MHz passband
            // 5960 MHz uplink = 17 MHz above TP-1 center (5943 MHz)
            // Falls within TP-1's passband (5925-5961 MHz)
            // Simulates polarization mismatch from another operator
            signalId: 'cross-pol-interference',
            serverId: 1,
            noradId: 61525,
            frequency: 5960e6 as RfFrequency,
            polarization: 'H',
            // Phase 27 (plan Q8): set against VT-01's own TP-1 carrier (the
            // stand-in composite is gone) for the customer's story - degraded,
            // not down: 0.3-0.8 dB of Es/N0 lock margin (mean ~0.45 dB) over the
            // QPSK 3/4 threshold. At that margin the hub's own Viterbi + RS decode is
            // still error-free (PER ~1e-11: the payload panel reads BER < 1e-12,
            // 0 CRC errors); the customer's small ship terminals, with far less
            // G/T, are past the waterfall (the S5 quiz teaches the difference).
            // The notch takes it back to ~4.7 dB (the spike's share of
            // the transponder output stays). At 26 dBm (before 19.5) it buried
            // the carrier and the modem lost lock outright (nats-s05-F1).
            // Phase 29 gate: 95.0 -> 94.85 dBm. The derived TM-1 skew (+18.8,
            // was an authored 14) cost the carrier ~0.11 dB against the spike
            // (mean margin 0.44 -> 0.33, under the 0.5 dB re-acquire point, so the
            // browser modem never locked); 94.85 restores 0.28-0.78 dB, mean 0.45.
            power: 94.85 as dBm,
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
          az: 153.1 as Degrees, // 53 W (Phase 28 D4)
          el: 35.1 as Degrees,
          // rotation: derived from geometry (Phase 29 D8, geoPolarizationSkewDeg)
          frequencyOffset: 2.225e9 as Hertz, // Legacy fallback
          lookAnglesFrom: VERMONT_LOOK_ANGLE_SITE,
          // The spike and the carrier fade independently; at the default +/-1 dB
          // their ratio would swing the half-dB lock margin across the lock
          // threshold. A calm +/-0.25 dB keeps the story "degraded, still locked".
          degradationConfig: { powerVariationRange: 0.25 as dBm },
          transponderConfigs: [
            {
              id: 'TP-1',
              uplinkCenterFrequency: 5943e6 as RfFrequency, // Passband: 5925-5961 MHz
              physics: c1TransponderPhysics(28), // a dB more than the roster TM-1: the cross-pol carrier shares the output, the composite keeps its pre-19.3 level
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3718 MHz
              polarization: 'H',
              beacon: {
                // Phase 28 (nats-r3-s05-F4): the roster TIDEMARK-1 beacon (V-pol,
                // 30 dBm, CW). This copy was H-pol at 40 dBm: cross-polar to the
                // V receive port, it read ~-80 dBm on the analyzer, not the
                // brief's level.
                frequency: 4175.5e6 as RfFrequency,
                signalId: 'TIDEMARK-1-Beacon',
                serverId: 1,
                noradId: 61525,
                power: 30 as dBm,
                bandwidth: 10 as Hertz, // CW: short-term linewidth, far under any RBW
                modulation: 'CW' as ModulationType,
                fec: 'null' as FECType,
                polarization: 'V',
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
              physics: c1TransponderPhysics(27),
              bandwidth: 36e6 as Hertz,
              frequencyOffset: 2.225e9 as Hertz, // Downlink center: 3756 MHz
              polarization: 'H',
              // No beacon for TP-2
            } as TransponderConfig,
          ],
        }
      ),
      ses10Satellite,
      tidemark2Satellite,
    ],
  },
  timeLimitSeconds: 1500, // 25 minutes (expanded from 20)
  objectives: [
    // =========================================================================
    // PHASE 1: MISSION PREPARATION
    // =========================================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'], // K0645: Knowledge of media interface concepts (knowledge of how to receive and understand operational communications)
      title: 'Review Mission Brief',
      description: 'Open and read the mission brief, then acknowledge you are ready to proceed.',
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Document Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Proceed',
          params: {
            question: 'Have you reviewed the mission brief and are you ready to begin?',
            options: ['Yes, I have read the mission brief and I am ready to proceed.'],
            correctIndex: 0,
            explanation: 'The mission timer has started. Good luck!',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-vermont-station',
      // S0421: Skill in operating network equipment - accessing the ground station
      // control interface is the fundamental skill for all subsequent operations
      nice: ['S0421'],
      title: 'Select Vermont Ground Station',
      description: 'Navigate to the VT-01 ground station where the affected customer link terminates.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // =========================================================================
    // PHASE 2: CONFIRM THE PROBLEM
    // =========================================================================
    {
      id: 'navigate-rx-analysis',
      // S0421: Skill in operating network equipment - navigating to the receive
      // chain panel within the ground station control interface
      nice: ['S0421'],
      title: 'Navigate to Receiver',
      description: 'Open the RX Analysis tab to check the current signal status.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'phase-1-observe-degradation',
      nice: ['K0740', 'T0153'], // K0740: Knowledge of network performance parameters, T0153: Monitor network capacity and performance
      title: 'Confirm Signal Degradation',
      description: "Check the receiver modem to confirm the customer's report of degraded service.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['navigate-rx-analysis'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify C/N Degradation',
          params: {
            question: 'Looking at the receiver modem, what is the current C/N ratio status?',
            options: [
              'C/N is degraded - well below normal, with little margin',
              'C/N is healthy - well above normal, locked with wide margin',
              'C/N is normal - nominal level, locked with the usual margin',
              'No signal lock - receiver is offline with no C/N reading',
            ],
            correctIndex: 0,
            explanation:
              'C/N is around 5 dB against a nominal 14+ dB. The modem still holds lock, because QPSK 3/4 needs an Es/N0 of 5.0 dB and the status bar shows the margin over that. With under 1 dB of margin it reads "Degraded margin". At the hub that means degraded, not down, but one more dB of loss and our own receiver would lose lock too.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-receiver-state-quiz',
      nice: ['K0740', 'T0081'], // K0740: Knowledge of network performance parameters, T0081: Analyze anomalies in network traffic
      title: 'Assess Full Impact',
      description: "Read the Payload Data Integrity card on the RX Analysis tab (BER and CRC errors), then work out how it fits with the customer's packet errors.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-1-observe-degradation'],
      conditions: [
        {
          type: 'status-check',
          description: 'Understand Degradation Indicators',
          params: {
            question:
              "VT-01's own receiver still decodes this carrier cleanly: the Payload Data Integrity card shows BER at about 1e-12 and 0 CRC errors. Yet SeaLink's ships report packet errors. Why?",
            options: [
              'The ships have much smaller dishes, so the same C/N loss drops them below threshold',
              "The errors are in the ships' own equipment, because a clean BER at VT-01 proves the satellite link is healthy",
              'The payload card lags the modem by several minutes, so the errors have not reached the card yet',
              'The ships listen on a different transponder from the one VT-01 is monitoring, so they see another signal',
            ],
            correctIndex: 0,
            explanation:
              'Whatever is pulling the carrier C/N down reaches every receiver in the beam, but each receiver adds its own noise. Our 9 m hub dish has a G/T near 30 dB/K (G/T is the dish gain divided by its noise temperature, a measure of how well it hears weak signals). A 1-2 m maritime terminal has 15-20 dB less, so its C/N was always far closer to threshold. This carrier uses concatenated coding, and the Payload Data Integrity card shows a Viterbi inner decoder (K=7, rate 3/4) and a Reed-Solomon 223/255 outer code. That pair has a sharp threshold too. While the Viterbi output errors stay sparse, Reed-Solomon corrects every block and the output is clean, but a fraction of a dB lower the error bursts outrun its correction and packets fail. Right now we sit just above that knee (Degraded margin, BER still clean) and the ships are below it (packet errors). Watch margin, not BER, because by the time the hub shows CRC errors the remotes are already down.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 3: CONFIGURE SPECTRUM ANALYZER
    // =========================================================================
    {
      id: 'verify-speca-initial-state',
      nice: ['K0737', 'K1032', 'T0153', 'S0421'], // K0737: Knowledge of RF spectrum characteristics, K1032: Knowledge of RF propagation, T0153: Monitor network capacity and performance
      title: 'Assess Current Configuration',
      description: "Before you change anything, work out why the spectrum analyzer's current setup can't show the customer's signal.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-receiver-state-quiz'],
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Understand Span Limitation',
          params: {
            question: 'The spectrum analyzer is currently configured for beacon observation. Why is this configuration inadequate for troubleshooting the customer issue?',
            options: [
              'The narrow span shows only the beacon, not the 36 MHz carrier with the problem',
              'The center frequency is wrong for this satellite, not the downlink we are receiving',
              'The resolution bandwidth is too high, so small signals are lost in the noise floor',
              'The reference level is clipping the signal, so the peak of the carrier is cut off',
            ],
            correctIndex: 0,
            explanation:
              "For beacon tracking we use a narrow span, a few kHz (2 kHz on this station), centered on the beacon frequency. Our customer traffic is a 36 MHz wideband carrier at a different frequency, so you need to widen the span and recenter to see what's happening to the actual customer signal.",
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    // =========================================================================
    // PHASE 4: LOCATE AND IDENTIFY INTERFERENCE
    // =========================================================================
    {
      id: 'phase-2-configure-and-locate',
      nice: ['K0737', 'S0421', 'T0153', 'K1032'], // K0737: Knowledge of RF spectrum characteristics, S0421: Skill in using test equipment, T0153: Monitor network capacity and performance, K1032: Knowledge of RF propagation
      title: 'Configure Spectrum View',
      description:
        'The spectrum analyzer is still set up for the beacon. Reconfigure it to show the full wideband signal: widen the span to 50-100 MHz, center it on the downlink IF frequency (1532 MHz), and set RBW back to Auto (it was left at 10 Hz for the beacon, which is far too narrow for a wide span). Then set the amplitude window to Min -100 dBm and Max -30 dBm so both the noise floor and the carrier show.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-speca-initial-state'],
      timeLimitSeconds: 3 * 60,
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
          description: 'Center frequency set to see main signal',
          params: {
            centerFrequency: 1532e6 as Hertz, // Main signal IF
            centerFrequencyTolerance: 5e6, // Allow 1527-1537 MHz
          },
          mustMaintain: true,
        },
        {
          type: 'speca-min-amplitude',
          description: 'Min amplitude set just below noise floor',
          params: {
            minAmplitude: -100 as dBm,
            // Tight: the -140 preset must not count (phase 27, r2-s05)
            minAmplitudeTolerance: 3 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-max-amplitude',
          description: 'Max amplitude set just above signal peak',
          params: {
            maxAmplitude: -30 as dBm,
            maxAmplitudeTolerance: 3 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'phase-4-identify-interference',
      nice: ['T0081', 'K0773'], // T0081: Analyze anomalies in network traffic, K0773: Knowledge of signal analysis
      title: 'Identify Interference',
      description: "Look at the spectrum analyzer display. Our wideband signal should be visible - is there anything else that shouldn't be there?",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-2-configure-and-locate'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify the Interference',
          params: {
            question: 'Looking at the spectrum analyzer, what do you see within our wideband signal?',
            options: [
              'A narrowband spike inside our wideband signal',
              'Our signal looks normal with no interference',
              'The entire noise floor is elevated uniformly',
              'Multiple spikes scattered across the spectrum',
            ],
            correctIndex: 0,
            explanation:
              "There's a narrowband spike sitting within our wideband signal. That makes it in-band interference: it isn't next to our signal, it's inside it, which is why we can't exclude it just by narrowing our passband.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-5-characterize-interference',
      nice: ['K0737', 'K0773', 'K0740'], // K0737: Knowledge of RF spectrum characteristics, K0773: Knowledge of signal analysis, K0740: Knowledge of network performance parameters
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
              'Much narrower - a spike about 1 MHz wide',
              'Same width - the interference matches our signal bandwidth',
              'Much wider - the interference spans beyond our signal',
              'Variable - the interference bandwidth keeps changing',
            ],
            correctIndex: 0,
            explanation:
              'The interference is a narrowband spike, about 1 MHz wide compared to our 36 MHz signal. That matters because a notch filter can remove a spike that narrow without affecting most of our signal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'measure-interference-frequency',
      nice: ['S0421', 'T0153'], // S0421: Skill in using test equipment, T0153: Monitor network capacity and performance
      title: 'Record Interference Frequency',
      description: "Read the approximate center frequency of the interference spike off the spectrum analyzer display. You'll need it to set the notch filter.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-5-characterize-interference'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Record Frequency',
          params: {
            question: 'What is the approximate IF frequency of the interference spike?',
            options: ['1515 MHz', '1532 MHz', '1520 MHz', '1500 MHz'],
            correctIndex: 0,
            explanation:
              "The spike is centered at approximately 1515 MHz IF, near the lower edge of our carrier, which is centered at 1532 MHz. You'll use that frequency to set the notch filter in the next steps.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // Ask a quiz question about whether we use IF or RF for notch filter configuration
    {
      id: 'understand-notch-frequency-domain',
      nice: ['K0737'], // K0737: Knowledge of RF spectrum characteristics
      title: 'Understand Frequency Domain for Notch Filter',
      description: 'Decide whether the notch filter takes an IF frequency or an RF frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['measure-interference-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Frequency Domain for Notch Filter',
          params: {
            question: 'Should the notch filter be configured using IF or RF frequency?',
            options: ['IF frequency', 'RF frequency'],
            correctIndex: 0,
            explanation:
              "You set the notch filter with an IF frequency, because it operates on the intermediate frequency signal after downconversion. That's why the number to enter is the 1515 MHz you just read off the analyzer, not an RF frequency.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 5: UNDERSTAND THE CAUSE
    // =========================================================================
    {
      id: 'phase-6-understand-cause',
      nice: ['T0081', 'K0773'], // T0081: Analyze anomalies in network traffic, K0773: Knowledge of signal analysis
      title: 'Understand the Interference Source',
      description: "Determine what's causing this in-band interference.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-notch-frequency-domain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Identify Interference Cause',
          params: {
            question: 'What is the most likely cause of this narrowband spike within our signal bandwidth?',
            options: [
              "Cross-polarization leakage from another operator's uplink",
              'A spur from our own transmit chain riding up with our carrier',
              'A terrestrial microwave link near Vermont getting into our downlink',
              'Solar radio noise from a flare event',
            ],
            correctIndex: 0,
            explanation:
              "Work it from what you can see. The analyzer shows one steady carrier about 1 MHz wide, not a raised noise floor across the band, so it isn't solar noise. SeaLink's ships out on the Atlantic see the damage too, so the spike is inside the transponder, not just in our downlink: a tower near Vermont would hurt only us. Our TX chain reads normal, and a spur from our BUC would be a CW line, not a modulated carrier a megahertz wide. What fits is another operator's uplink: TP-1 takes horizontal uplinks, its twin on the same frequencies takes vertical ones for frequency reuse. TP-1 takes our uplink on H and returns it on V, which is why the OMT card reads TX H / RX V, and the other operator's uplink shares the transponder on the opposite polarization. Their V-pol uplink is leaking into our H-pol transponder because its polarization isolation is imperfect.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-7-understand-impact',
      nice: ['K0740', 'K0773'], // K0740: Knowledge of network performance parameters, K0773: Knowledge of signal analysis
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
            question: "The AGC card shows the current GAIN and INPUT, and the spike's power is part of that input. Why has our C/N dropped?",
            options: [
              "The spike's power sits inside our passband and takes a share of the transponder's output",
              'The AGC trimmed its gain, and turning the gain down lowers the C/N of our wanted carrier',
              'The spike is overloading the LNB and pushing the front end into compression',
              'The spike sits exactly on the carrier center frequency and corrupts the symbols',
            ],
            correctIndex: 0,
            explanation:
              "The AGC levels total power. With the spike in the passband its Input is a little higher, so its Gain sits a little lower to hold the Output at -30 dBm. The spike is worth well under a dB of gain: notch it and the Gain comes back by about 0.6 dB. That gain applies to our carrier and the noise alike, so on its own it can't change C/N. It's a symptom of more total power, not the cause of the loss. The C/N loss has two real causes. The spike's power lands inside our 36 MHz and the demodulator counts it as noise (C/(N+I)), and the spike shares the transponder's output power, so our carrier comes down weaker than before. The other options fail on the facts: the spike isn't on our center, since the analyzer puts it at 1515 MHz, near our lower edge, not 1532, and the LNB is nowhere near compression.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 6: EVALUATE MITIGATION OPTIONS
    // =========================================================================
    {
      id: 'understand-mitigation-options',
      nice: ['K0737', 'K0773', 'S0582'], // K0737: Knowledge of RF spectrum characteristics, K0773: Knowledge of signal analysis, S0582: Skill in troubleshooting RF systems
      title: 'Evaluate Mitigation Approaches',
      description: 'Consider the available options for mitigating this interference.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-7-understand-impact'],
      conditions: [
        {
          type: 'status-check',
          description: 'Select Best Mitigation',
          params: {
            question: 'What is the best approach to mitigate this in-band interference?',
            options: [
              'Notch filter - surgically removes the spike and passes the rest of our signal',
              'Narrower bandpass filter - reduce overall bandwidth to exclude the interference',
              'Increase transmit power - overpower the interference with more signal',
              'Contact the interfering operator and wait for them to fix it',
            ],
            correctIndex: 0,
            explanation:
              "A notch filter is the surgical solution. It removes the narrow interference spike, plus a sliver of our own carrier's lower edge where the spike sits, while the rest of our 36 MHz signal passes untouched. A narrower bandpass would sacrifice our own bandwidth. Increasing power wouldn't help the C/N ratio and would violate coordination agreements. Contacting the operator is the long-term fix, and the only one that helps the ships, but waiting does nothing for our own receiver now.",
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // =========================================================================
    // PHASE 7: APPLY NOTCH FILTER
    // =========================================================================
    {
      id: 'phase-8-apply-notch-filter',
      nice: ['K0737', 'S0582', 'S0421'], // K0737: Knowledge of RF spectrum characteristics, S0582: Skill in troubleshooting RF systems, S0421: Skill in using test equipment
      title: 'Configure Notch Filter',
      description: 'Open the Notch Filter card on RX Analysis and set a notch that covers the spike you measured: center frequency 1515 MHz, bandwidth 1 MHz and depth 40 dB.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-mitigation-options'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'notch-filter-configured',
          description: 'Notch Filter Configured',
          params: {
            notchCenterFrequency: 1515, // MHz - IF frequency of interference (5250 - 3735 = 1515)
            notchBandwidth: 1, // MHz - matches narrowband interference
            // Accepts 40-60 dB: the clips promise "at least 40 dB" and "40 dB ... below the noise floor"
            notchDepth: 50,
            notchCenterFrequencyTolerance: 0, // Exact match required
            notchBandwidthTolerance: 0.25,
            notchDepthTolerance: 10,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      timePenalty: {
        elapsedTimeThreshold: 18 * 60, // 18 minutes
        pointsDeducted: 30,
        message: 'We just violated the SLA! This is going to cost us a lot of money.',
      },
      conditionLogic: 'AND',
      points: 25,
    },

    // =========================================================================
    // PHASE 8: VERIFY RESTORATION
    // =========================================================================
    {
      id: 'verify-spectrum-cleared',
      nice: ['T0153', 'S0421'], // T0153: Monitor network capacity and performance, S0421: Skill in using test equipment
      title: 'Verify Spectrum Cleared',
      description: 'Return to the spectrum analyzer and verify the interference spike has been removed.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-8-apply-notch-filter'],
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Tab Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Confirm Spike Removed',
          params: {
            question: 'Looking at the spectrum analyzer, what happened to the interference spike?',
            options: [
              'The spike is gone - the notch filter removed it from the passband',
              'The spike is still there - the notch filter had no effect on its level',
              'The spike has moved - the notch filter pushed it to a different frequency',
              'The whole signal is gone - the notch filter removed the entire passband',
            ],
            correctIndex: 0,
            explanation:
              "The notch filter is working. It attenuates the interference spike by the notch depth you set, which effectively removes it from the receiver's passband. The rest of our wideband signal passes through, because the 1 MHz notch takes only the spike and a sliver of our carrier's lower edge.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'phase-9-verify-restoration',
      nice: ['K0740', 'T0153'], // K0740: Knowledge of network performance parameters, T0153: Monitor network capacity and performance
      title: 'Verify Service Restored',
      description: 'Read the receiver modem C/N with the notch on and judge it against the 8 dB service minimum and the 14 dB nominal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-spectrum-cleared'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Verify C/N Restoration',
          params: {
            question: 'After applying the notch filter, what happened to the signal?',
            options: [
              'C/N back above the 8 dB service minimum (about 9-10 dB), short of the 14 dB nominal',
              'C/N back at the full 14 dB nominal - the notch removed every trace of the interference',
              'C/N unchanged from before - the notch filter had no effect on the carrier',
              'Signal lock lost entirely - the notch filter blocked our own carrier',
            ],
            correctIndex: 0,
            explanation:
              "The notch removes the spike from our receive chain, so C/N climbs back above the 8 dB service minimum, to about 9-10 dB, and the modem reads good margin again. It doesn't reach the 14 dB nominal, because the spike is still in the transponder, taking its share of the output power and adding intermod, and the notch also takes a sliver of our own carrier's edge. A ground notch is a workaround for our receiver only: the ships receive the same downlink, spike included, so they see it until the other operator fixes their polarization, and only then does the full 14 dB come back.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // =========================================================================
    // PHASE 9: DOCUMENTATION
    // =========================================================================
    {
      id: 'document-interference-quiz',
      nice: ['K0645', 'T0081'], // K0645: Knowledge of media interface concepts, T0081: Analyze anomalies in network traffic
      title: 'Understand Documentation Requirements',
      description: 'Consider what should be documented and reported about this interference event.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['phase-9-verify-restoration'],
      conditions: [
        {
          type: 'status-check',
          description: 'Documentation Knowledge',
          params: {
            question: 'Which of the following is most important to document and report about this interference event?',
            options: [
              'Interference frequency, bandwidth, source, time, and mitigation applied',
              'Notch filter center, depth, bandwidth, and time applied, in case we need it again',
              'Customer name, complaint time, services affected, and resolution, nothing technical',
              'Ticket number, time closed, and operator on shift, since the problem is already fixed',
            ],
            correctIndex: 0,
            explanation:
              "The best record describes the interference itself and what you did about it. The frequency and bandwidth help identify the source, the time lets you correlate it with other operators' activities, and the mitigation lets you respond quickly if it recurs. Together they support the interference coordination process that resolves the root cause with the other operator. The other lists describe our own filter, the customer's complaint or our ticket paperwork, which say nothing about the interferer and can't help trace it.",
            pointPenalty: 5,
            preserveOptionOrder: true,
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
        Got a trouble ticket from SeaLink - their maritime customer is reporting packet errors and degraded throughput on TIDEMARK-1. This started about two hours ago with no changes on our end.
      </p>
      <p>
        I checked the basics - antenna is tracking fine, LNB is powered, nothing faulted on the RF chain. The only warning on the board is a Degraded margin on RX 1, and that's just the customer's complaint showing up on our side. But I haven't had time to dig into the signal quality yet. The spectrum analyzer was last configured for beacon tracking, so you'll need to reconfigure it to see the actual customer signal.
      </p>
      <p>
        This is a priority customer - they're using this link for critical vessel communications in the North Atlantic. The SLA clock is ticking, so let's work efficiently but thoroughly. Read the mission brief to get the full picture, then let me know when you're ready to start troubleshooting.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/5/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Good. Now let's approach this systematically. The customer is reporting packet errors, which usually means a C/N problem somewhere in the chain. Start by selecting Vermont Ground Station in the asset tree.
        </p>
        <p>
          Don't jump to conclusions yet. It could be anything from antenna issues to interference to equipment problems, so let the data guide you.
        </p>
        <p>
          Sorry if I seem distracted today. Half my kitchen is in boxes.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-mission-brief.mp3'),
      },
      'select-vermont-station': {
        text: `
        <p>
          Good, you're at VT-01 where the SeaLink traffic terminates. This is our primary TIDEMARK-1 gateway for North Atlantic maritime services.
        </p>
        <p>
          Head to the receiver modem to check the signal metrics. That's where we'll see if the customer's complaint is legitimate and get our first clues about what's wrong.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-select-station.mp3'),
      },
      'navigate-rx-analysis': {
        text: `
        <p>
          This is the receiver modem handling the SeaLink customer traffic. Take a look at the key metrics - C/N ratio, lock status, and any error indicators.
        </p>
        <p>
          Remember, C/N is your primary signal quality metric. Anything below the demodulator threshold means the receiver is struggling to extract clean data from the noise.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-navigate-rx.mp3'),
      },
      'phase-1-observe-degradation': {
        text: `
        <p>
          That C/N is well below where it should be. The customer's complaint is definitely legitimate - we've got a real problem here, not a false alarm.
        </p>
        <p>
          Now look at the Payload Data Integrity card, just below. Our own decode is still clean - and the customer's ships are dropping packets anyway. Work out why.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-1.mp3'),
      },
      'verify-receiver-state-quiz': {
        text: `
        <p>
          Exactly right. Our big dish keeps our receiver just above threshold, but the ships have much smaller dishes, so they've dropped below it. Those are the packet errors the customer is seeing.
        </p>
        <p>
          To fix this, we need to understand what's causing the C/N to drop, so next we'll look at the spectrum. First, check how the spectrum analyzer is set up right now, and ask yourself whether that view can show our main carrier.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-receiver.mp3'),
      },
      'verify-speca-initial-state': {
        text: `
        <p>
          Right. Beacon observation uses a narrow span because beacons are themselves narrowband - just a few kHz. We only need to see enough spectrum to capture the beacon and verify it's there.
        </p>
        <p>
          But our customer signal is wideband, 36 MHz of data modulated with QPSK. QPSK is a way of encoding digital bits onto the carrier. To see what's happening to that signal, we need to widen the span to at least 50 MHz and re-center on the signal's IF frequency.
        </p>
        <p>
          Remember, the receiver modem is tuned to 1532 MHz IF, and that's where you'll find the main signal.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-speca.mp3'),
      },
      'phase-2-configure-and-locate': {
        text: `
        <p>
          Good. Now we can see the bigger picture. With a wider span and proper center frequency, you should be able to see our full wideband carrier - the 36 megahertz signal should be clearly visible as a raised plateau of energy.
        </p>
        <p>
          But look carefully within that bandwidth. There's something else in there that shouldn't be. In-band interference is the worst kind because you can't just filter it out with a narrower passband - it's sitting right on top of your wanted signal. See if you can spot what's contaminating our spectrum.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-2.mp3'),
      },
      'phase-4-identify-interference': {
        text: `
        <p>
          You found it. That spike is classic in-band interference. It's not adjacent to our signal - it's inside it. That's what makes it so problematic. We can't just tighten our bandpass to exclude it.
        </p>
        <p>
          Now we need to characterize it. Look at the spike compared to our wideband signal. How does its bandwidth compare? Understanding the interference signature will tell us a lot about what's causing it and how to fix it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-4.mp3'),
      },
      'phase-5-characterize-interference': {
        text: `
        <p>
          It's narrowband - just a spike compared to our 36 MHz wideband carrier. That's actually good news for us. A narrowband interferer means we can potentially use a notch filter to surgically remove it. A notch filter blocks one narrow slice of the spectrum and passes everything around it.
        </p>
        <p>
          Before we apply any mitigation, we need to identify where this spike is sitting. Look at the spectrum display and estimate the center frequency of the interference. That's the target for our notch filter.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-5.mp3'),
      },
      'phase-6-understand-cause': {
        text: `
        <p>
          That's cross-polarization interference. Satellites use orthogonal polarizations to double capacity - you can have two signals on the same frequency, one horizontal and one vertical. In theory, they're completely isolated from each other.
        </p>
        <p>
          In practice, nothing's perfect. Antenna feeds have finite cross-pol isolation, typically 25 to 35 dB. Rain, ice, and Faraday rotation in the ionosphere can degrade polarization purity further. The result is leakage between polarizations.
        </p>
        <p>
          Another operator's signal on V-pol is leaking into our H-pol. But here's the puzzle - that spike is narrow, yet it's degrading our entire wideband signal. Look at the AGC card while you think about why. AGC is automatic gain control, the circuit that holds the signal level steady.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-6.mp3'),
      },
      'phase-7-understand-impact': {
        text: `
        <p>
          Exactly. The AGC measures total power in the IF passband and sets its gain to hold the output steady for the demodulator. It can't tell wanted signal from interference - it just sees power. That's why its gain sits a little lower with the spike in the passband - well under a dB, but it's there.
        </p>
        <p>
          But gain turns our carrier and the noise up and down together, so the gain change isn't what hurt us. The spike's own power sits inside our 36 megahertz, and the demodulator counts it as noise. And it's taking a share of the transponder's output, so our carrier comes down a little weaker. The AGC is just telling you there's more power in the passband than there should be.
        </p>
        <p>
          Now we know the problem. The question is - what's the best way to fix it? We have several options available.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-7.mp3'),
      },
      'understand-mitigation-options': {
        text: `
        <p>
          Right - a notch filter is the surgical solution. We configure it at exactly 1,515 megahertz with just enough bandwidth to cover the spike - probably 1 megahertz or so. The spike sits right at the lower edge of our carrier, so the notch takes the spike and a sliver of our own edge, and the rest of our 36 megahertz passes untouched.
        </p>
        <p>
          With the spike notched out, its power no longer reaches the demodulator, so C/N comes back up - and the AGC gain rises again, because there's less total power to level.
        </p>
        <p>
          Head to the Notch Filter card on RX Analysis to configure it. Set the center frequency to 1,515 megahertz, bandwidth to 1 megahertz, and depth to at least 40 dB. That should be enough to suppress the interference below the noise floor.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-understand-mitigation.mp3'),
      },
      'phase-8-apply-notch-filter': {
        text: `
        <p>
          Good - the notch filter is configured. Let's verify it's working. Head back to the spectrum analyzer and look at where the spike was. If the notch is properly placed, that spike should be gone or severely attenuated.
        </p>
        <p>
          Remember, the notch filter is a receive-side fix. It doesn't eliminate the interference at the source - it just prevents our receiver from seeing it. The other operator's signal is still there on V-pol, but our filter is blocking the leakage from affecting our equipment.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-phase-8.mp3'),
      },
      'verify-spectrum-cleared': {
        text: `
        <p>
          The spike is gone from our view. The notch filter is attenuating that frequency by 40 dB, which pushes the interference power well below the noise floor. Our spectrum shows a clean wideband signal now.
        </p>
        <p>
          But spectrum is only half the story. The real test is whether the receiver's performance has improved. Check the receiver modem to see if C/N has recovered.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-verify-spectrum.mp3'),
      },
      'phase-9-verify-restoration': {
        text: `
        <p>
          C/N is back above the 8 dB service minimum on our receiver, about 9 or 10 dB, which is good margin on the modem. It won't reach the full 14 dB, because the spike is still in the transponder, eating its share of the power. And the notch only cleans up our receive chain. The ships get the same downlink, spike included, so they keep seeing it until the source is found and that operator's cross-pol isolation improves.
        </p>
        <p>
          Nice work. You diagnosed a non-obvious interference problem, understood the mechanism behind it, and applied the right mitigation. That's the kind of systematic troubleshooting that separates good operators from great ones.
        </p>
        <p>
          One more thing - this kind of event needs to be properly documented for the long-term fix.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/5/obj-phase-9-verify-restoration.mp3'),
      },
      'document-interference-quiz': {
        text: `
        <p>
          Perfect. I'll file a coordination request with the satellite operator to track down the source of the cross-pol interference. With the frequency, bandwidth, and timing information you've gathered, they can identify which uplink is causing the problem and work with that operator to improve their polarization alignment.
        </p>
        <p>
          Meanwhile, the notch keeps our own receiver clean and the hub link inside its margin. The ships get their relief when the source is fixed, so that coordination request is what closes SeaLink's ticket.
        </p>
        <p>
          This is exactly how professional interference mitigation works - protect your own link fast, then document and coordinate to remove the source. Well done.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/outro.mp3'),
      },
    },
    objectivesOnStart: {
      // Phase 28 (nats-r3-s05-F5): the cross-pol hint opens the step whose
      // quiz rests on it (it used to play one objective early)
      'phase-6-understand-cause': {
        text: `
        <p>
          1515 MHz IF is our notch target. Now let's figure out what's putting it there. Work it from the evidence. Is it a carrier or a raised noise floor? Is it only in our downlink, or are the ships seeing it too?
        </p>
        <p>
          And think about polarization. TP-1 takes our uplink on horizontal and sends it back down on vertical - that's why the OMT card reads TX H, RX V. The OMT is the orthomode transducer, the part of the feed that separates the two polarizations. Satellites often reuse the same frequencies on the orthogonal polarization, so another operator might be uplinking into that vertical slot.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/6/obj-measure.mp3'),
      },
    },
  },
};
