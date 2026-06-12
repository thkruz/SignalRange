import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz, IfFrequency, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 21: "Hostile RF"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 5 of 8)
 * Time Pressure: Moderate - the interferer is active and intermittent
 * Calculation Required: NO (guard-band reasoning, no RF math)
 * New Mechanic: time-windowed interference (engine: InterferenceManager
 *   injects a duty-cycled jammer at the satellite transponder, so it is
 *   relayed to the receiving station - the uplink-interference case that
 *   makes discrimination meaningful).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0615: Skill in protecting a network against malware
 *   - S0648: Skill in detecting anomalies
 *
 * Supporting Codes:
 *   - T0081: Diagnose network connectivity problems
 *   - S0593: Skill in handling incidents
 *   - T0153: Monitor network capacity and performance
 *   - K0751: Knowledge of system threats
 *
 * Premise: An intermittent, broadband-ish interferer rides the TIDEMARK-2
 * downlink - on/off in a regular pattern that fits neither cross-pol leakage
 * nor known terrestrial sources. The operator characterizes the signature,
 * discriminates deliberate jamming from accidental interference (duty cycle,
 * transponder-vs-local, data-layer integrity), applies receive-side
 * mitigation, builds the regulator package, and - critically - verifies this
 * is RF-layer denial and NOT a data-layer intrusion (crypto/key integrity).
 *
 * The campaign's first adversarial-aware scenario, deepened: a rigorous
 * jamming-vs-interference workflow that maps onto real ITU interference-
 * reporting practice and the denial-vs-intrusion distinction.
 *
 * Tone: Crisis-phase, investigative. Dana (incident handling), Marcus
 * (spacecraft-side consultation), regulator rendered as SYSTEM notifications.
 * All quizzes SYSTEM. 5-6 clips.
 *
 * Sim notes:
 *   - interferenceEvents: duty-cycled jammer on TM-2 (NORAD 61526) at uplink
 *     6005 MHz H-pol (inside TP-1 passband 5999-6035) -> relayed to downlink
 *     3780 MHz -> 1470 MHz IF at ME-02 (LNB LO 5250). Carrier sits at 1458
 *     MHz IF; the jammer is ~12 MHz off, characterizable on a wide span.
 *   - 90 s on / 60 s off, repeating - the regular duty cycle IS the
 *     deliberation signature.
 *   - Crypto defaults ACTIVE/Valid: the data-layer checks pass, proving the
 *     attack is RF denial, not intrusion. (If they ever changed mid-incident,
 *     the scenario's whole posture would change - that is the teaching point.)
 */

export const scenario21Data: ScenarioData = {
  id: 'nats-scenario21',
  prerequisiteScenarioIds: ['nats-scenario20'],
  url: 'nats/scenarios/nats-scenario21',
  imageUrl: 'nats/21/card.png',
  number: 21,
  title: 'Hostile RF',
  subtitle: 'Suspected Intentional Interference',
  duration: '30-35 min',
  difficulty: 'advanced',
  missionType: 'Threat Response',
  description: `Catherine's day shift flagged it before she left: intermittent broadband noise riding the TIDEMARK-2 downlink, on-off-on, gone before she could characterize it. It's back this morning. It doesn't match the cross-pol neighbors and it doesn't match weather.<br><br>Treat it as an interference incident from the first minute. Characterize the signature, discriminate jamming from a benign accident, mitigate what you can on the receive side, and build the regulator package as you go. And verify the half of this that matters most: an RF interferer denies your signal - it does not touch your data. Prove the data layer is intact, or you are no longer working an interference event.<br><br>If it turns out to be somebody's misaligned uplink, the same evidence resolves it. If it's deliberate, the evidence IS the response.`,
  equipment: [
    '9-meter C-band Antenna (ME-02)',
    'RF Front End (notch filter)',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'Crypto module (data-layer integrity)',
  ],
  timeLimitSeconds: 35 * 60,
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: standby on TIDEMARK-1
      {
        ...vermontGroundStation,
      },
      // ME-02: carrying TIDEMARK-2, taking the interference
      {
        id: 'ME-02',
        name: 'Maine Ground Station',
        isOperational: true,
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            isPowered: true,
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            polarization: -25 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526,
            targetAzimuth: 219.7 as Degrees,
            targetElevation: 26.3 as Degrees,
            targetPolarization: -25 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 1070e6 as Hertz,
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 carries TM-2: chain hot, LNB LO 5250 for matching IFs
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -85 as dBm,
            centerFrequency: 1458e6 as Hertz, // TM-2 carrier IF
            span: 40e6 as Hertz, // Wide enough to see the carrier and the adjacent jammer
            rbw: 100e3 as Hertz,
            minAmplitude: -100 as dBm,
            maxAmplitude: -40 as dBm,
            scaleDbPerDiv: 10 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: true, isUpdating: true, mode: 'maxhold' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'TIDEMARK-2-Teleport',
                  noradId: 61526,
                  frequency: 1020e6 as IfFrequency, // TM-2 TP-2: 7000 - 5980
                },
              },
            ],
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1458 as MHz, // TM-2 downlink IF (5250 - 3792)
                bandwidth: 36 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [tidemark2Satellite, tidemark1Satellite, ses10Satellite],
    interferenceEvents: [
      {
        id: 'tm2-hostile',
        satelliteNoradId: 61526,
        frequency: 6005e6, // Uplink, inside TM-2 TP-1 passband (5999-6035), H-pol
        bandwidth: 6e6,
        // dBm at the transponder input. Carrier composite is 20 dBm, so C/I
        // ~15 dB - visible and degrading, but the carrier keeps demod lock
        // (the training point is mitigation, not a hard outage).
        power: 5,
        polarization: 'H',
        startTime: 20,
        duration: 3600, // Persists across the scenario
        periodSeconds: 150, // 90s on, 60s off - a regular, deliberate cadence
        onSeconds: 90,
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-21?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Interference Flag',
      description: 'Open the brief and Catherine\'s end-of-shift note.',
      groundStation: 'ME-02',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Frame the Incident',
          params: {
            character: Character.SYSTEM,
            question: 'An intermittent interferer is on TM-2. How do you treat it from minute one?',
            options: [
              'As an interference incident: characterize, discriminate, mitigate, document - and verify the data layer separately. The same evidence resolves an accident or builds the case for deliberate interference',
              'Wait to see if it clears on its own before doing anything',
              'Assume it is jamming and immediately disconnect TM-2',
              'Power-cycle the LNB - intermittent usually means a flaky receiver',
            ],
            correctIndex: 0,
            explanation: 'Evidence first, conclusion last. Whether it ends as "misaligned partner uplink" or "deliberate denial," the work is identical until the evidence decides - and that discipline is what makes the eventual conclusion defensible.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-maine-station',
      nice: ['S0421'],
      title: 'Open ME-02',
      description: 'Select the Maine Ground Station.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'ME-02 Selected',
          params: { groundStationId: 'ME-02' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: CHARACTERIZE THE SIGNATURE
    // ============================================================
    {
      id: 'open-spectrum',
      nice: ['S0648', 'T0153'],
      title: 'Observe the Interference',
      description: 'Open RX Analysis. The spectrum is set to a wide span around the TM-2 carrier so the adjacent interferer is visible when it keys up.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['select-maine-station'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Centered on TM-2 Carrier (1458 MHz IF)',
          params: {
            centerFrequency: 1458e6,
            centerFrequencyTolerance: 2e6,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Wide Span (≥ 30 MHz) to See the Adjacent Interferer',
          params: {
            span: 40e6,
            frequencyTolerance: 15e6,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'duty-cycle-quiz',
      nice: ['K0926', 'S0648'],
      title: 'Characterize the Duty Cycle',
      description: 'The interferer is on, then off, then on, in a regular pattern. Interpret it.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['open-spectrum'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Duty Cycle Read',
          params: {
            character: Character.SYSTEM,
            question: 'The interferer runs a regular cycle - roughly ninety seconds on, a minute off, repeating. What does that timing argue?',
            options: [
              'Against accident, toward deliberation: natural and accidental sources are continuous or random; a clean repeating on/off cadence on the scale of a minute implies a hand on a switch or an automated transmitter, not weather or a stuck oscillator',
              'Toward radar - rotating antennas produce exactly this minute-scale cadence',
              'Toward a failing power supply on a neighbor\'s uplink',
              'Nothing - duty cycle carries no diagnostic information',
            ],
            correctIndex: 0,
            explanation: 'Radar duty cycles are seconds, not minutes. Accidental interference is continuous or erratic. A deliberate, minute-scale on/off pattern is one of the strongest behavioral indicators of intent - though it is an indicator, not proof.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'transponder-vs-local-quiz',
      nice: ['K0926', 'T0081'],
      title: 'Transponder or Local?',
      description: 'The single most valuable discrimination test: is the interferer on the bird, or local to your site?',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['duty-cycle-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Locality Test',
          params: {
            character: Character.SYSTEM,
            question: 'You confirm VT-01 and Halifax see the same interferer on TM-2 TP-1. What does that establish?',
            options: [
              'It is in the UPLINK - the satellite is relaying it to every receiving station, so the source is transmitting at the bird, not a local terrestrial source at Maine. That rules out radar/5G/our own equipment and points at a misaligned or deliberate uplink',
              'It is local terrestrial interference at all three sites simultaneously',
              'It proves the satellite transponder itself is malfunctioning',
              'Nothing - other stations seeing it is expected for any signal',
            ],
            correctIndex: 0,
            explanation: 'This is the highest-information test in the matrix. Local interference appears at one station; uplink interference is relayed to all. Every-station visibility moves the source from "somewhere near Maine" to "transmitting at the satellite."',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'signature-shape-quiz',
      nice: ['K0926', 'S0648'],
      title: 'Signature vs the Database',
      description: 'Compare bandwidth and placement against what the coordination database would explain.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['transponder-vs-local-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shape Read',
          params: {
            character: Character.SYSTEM,
            question: 'The interferer is broadband-ish, sized close to our carrier, sitting inside our transponder near our allocation. How does that compare to benign explanations?',
            options: [
              'It matches nothing in the coordination database: cross-pol leakage would mirror a known neighbor\'s carrier, an errant uplink would look like a modulated carrier at a coordinated slot - broadband noise shaped to our carrier inside our passband fits neither',
              'It is a textbook cross-pol leakage signature',
              'It matches a coordinated adjacent-satellite carrier exactly',
              'Bandwidth and placement carry no diagnostic weight',
            ],
            correctIndex: 0,
            explanation: 'Accidents look like known things in the wrong place. Noise deliberately shaped and placed to deny a specific carrier looks like nothing the coordination database can account for - the absence of a benign match is itself evidence.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: DENIAL VS INTRUSION (data-layer integrity)
    // ============================================================
    {
      id: 'denial-vs-intrusion-quiz',
      nice: ['S0615', 'K0751'],
      title: 'Denial or Intrusion?',
      description: 'Before mitigating, frame what kind of attack this is - it determines the escalation path.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['signature-shape-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Attack Class',
          params: {
            character: Character.SYSTEM,
            question: 'If this is deliberate, what KIND of attack is RF jamming, and why does the distinction matter?',
            options: [
              'It is a DENIAL attack on the RF layer - it degrades or blocks the signal but does not touch the data, crypto, or keys. The distinction matters because an intrusion (data-layer compromise) has a different escalation path and you must verify which you are facing',
              'It is an intrusion - jamming always implies the attacker has system access',
              'It is malware on the modem',
              'The distinction is academic - all attacks get the same response',
            ],
            correctIndex: 0,
            explanation: 'Jamming denies availability; it does not breach confidentiality or integrity. Conflating denial with intrusion sends you down the wrong escalation path - you must check the data layer to know which incident you actually have.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-data-layer',
      nice: ['S0615', 'T0081'],
      title: 'Verify the Data Layer',
      description: 'Confirm the crypto and key state are intact - this is RF denial, not a breach.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['denial-vs-intrusion-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-crypto-status',
          description: 'RX Crypto ACTIVE',
          params: { cryptoMode: 'ACTIVE' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Key Valid',
          params: { keyStatus: 'Valid' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'data-layer-meaning-quiz',
      nice: ['S0615', 'K0751'],
      title: 'What Intact Crypto Proves',
      description: 'Confirm what the healthy data layer establishes - and what would change if it were not.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-data-layer'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Data-Layer Finding',
          params: {
            character: Character.SYSTEM,
            question: 'Crypto is ACTIVE, keys Valid, no frame anomalies outside the jamming windows. What does that confirm - and what would flip the incident?',
            options: [
              'Confirms RF-layer denial only: the link is being degraded, not breached. If crypto state changed or keys went invalid/mismatched mid-incident, it would become a security incident with a different escalation (Dana then security officer; nothing holding keys gets power-cycled)',
              'Confirms nothing - crypto is unrelated to interference',
              'Confirms the interferer has been decrypted and identified',
              'Means the jamming has stopped',
            ],
            correctIndex: 0,
            explanation: 'Two layers, two verifications, never conflated. Intact crypto bounds this to a denial-of-availability event. The hypothetical - a crypto change mid-incident - is exactly the tripwire that would escalate it to an intrusion.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RECEIVE-SIDE MITIGATION
    // ============================================================
    {
      id: 'mitigation-choice-quiz',
      nice: ['S0593', 'K0737'],
      title: 'Choose Mitigation',
      description: 'Pick the right receive-side mitigation - and rule out the wrong one.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['data-layer-meaning-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Mitigation Selection',
          params: {
            character: Character.SYSTEM,
            question: 'The interferer is a band of noise ~12 MHz off the carrier center, inside our passband. Best receive-side mitigation?',
            options: [
              'Notch filter on the interferer band - excise its energy at the cost of a little SNR in that slice; reversible, customer-preserving, and it does nothing to neighbors',
              'Increase our uplink power to "burn through" the interferer',
              'Retune the customer carrier to a clean frequency immediately',
              'Mute the receiver until the interferer stops',
            ],
            correctIndex: 0,
            explanation: 'A notch is the surgical tool: it removes the interferer\'s energy from the receive path. Power escalation degrades neighbors, violates coordination, and feeds the incident - there is NO transmit-side mitigation for uplink jamming available to a ground station.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-notch',
      nice: ['S0593', 'K0737'],
      title: 'Apply the Notch Filter',
      description: 'Configure a notch on the interferer band at 1470 MHz IF (~12 MHz above the 1458 carrier center).',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['mitigation-choice-quiz'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'notch-filter-configured',
          description: 'Notch at 1470 MHz IF on the Interferer',
          params: {
            notchCenterFrequency: 1470,
            notchCenterFrequencyTolerance: 2,
            notchBandwidth: 8,
            notchBandwidthTolerance: 3,
            notchDepth: 30,
            notchDepthTolerance: 10,
            notchIndex: 0,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-carrier-survives',
      nice: ['T0153', 'S0593'],
      title: 'Confirm the Customer Survives',
      description: 'Verify the TM-2 carrier is still locked after the notch - mitigation must not cost the customer the link.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['configure-notch'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Still Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'no-burn-through-quiz',
      nice: ['K0926', 'S0593'],
      title: 'Why Not Fight Back',
      description: 'Confirm why escalating power against the jammer is the wrong move.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['verify-carrier-survives'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'No Power War',
          params: {
            character: Character.SYSTEM,
            question: 'A colleague suggests cranking the uplink to overpower the interferer. Why is that wrong?',
            options: [
              'You cannot out-shout an uplink jammer from the ground without violating coordination and degrading every neighbor on the transponder - a power war escalates the incident, harms bystanders, and still loses. Receive-side mitigation plus regulatory action is the path',
              'It would work but takes too long to ramp the HPA',
              'The customer contract forbids power changes',
              'It is fine - more power always improves the link',
            ],
            correctIndex: 0,
            explanation: 'Burn-through is a denial response that creates more denial. The operator\'s tools are receive-side mitigation and the regulator; offense belongs to the spectrum authority and geolocation services, not the victim\'s HPA.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: COORDINATE AND REPORT
    // ============================================================
    {
      id: 'regulator-package-quiz',
      nice: ['S0648', 'K0926'],
      title: 'Build the Regulator Package',
      description: 'Select the fields the spectrum authority needs to act.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['no-burn-through-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Report Fields',
          params: {
            character: Character.SYSTEM,
            question: 'Which set of fields makes a regulator interference report actionable?',
            options: [
              'Victim (satellite/transponder/pol/center freq/BW), interferer (center freq, BW, measured duty cycle, first/last seen), spectrum captures at documented settings, cross-station confirmation (transponder vs local), service impact, and mitigation applied - all timestamped',
              'A one-line summary: "being jammed, please help"',
              'Only our internal trouble-ticket number',
              'The interferer\'s identity and location - which we determine ourselves',
            ],
            correctIndex: 0,
            explanation: 'Per ITU-R practice the report is evidence, not conclusion: measured parameters, captures, cross-station confirmation, and impact - everything timestamped. Attribution (who, where) belongs to the regulator and geolocation providers, not the ground operator.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'attribution-restraint-quiz',
      nice: ['K0751', 'S0648'],
      title: 'Conclude Carefully',
      description: 'Set the language for the finding - confidence without overreach.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['regulator-package-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Finding Language',
          params: {
            character: Character.SYSTEM,
            question: 'How should the operator\'s written finding be worded?',
            options: [
              '"Signature consistent with deliberate uplink interference" - a confidence-bounded characterization backed by the evidence; attribution and intent are for the regulator to determine, not the ground operator to assert',
              '"Confirmed hostile jamming by [named actor]" - state it plainly',
              '"Probably just interference, no action needed"',
              'Avoid any characterization - just file the raw data',
            ],
            correctIndex: 0,
            explanation: 'The evidence supports "consistent with deliberate" - it does not support naming an actor or declaring intent as fact. Disciplined language is what makes your evidence usable; overreach is what gets it dismissed.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-incident',
      nice: ['K0645', 'S0593'],
      title: 'Log the Incident',
      description: 'Record the interference incident and its disposition.',
      groundStation: 'ME-02',
      prerequisiteObjectiveIds: ['attribution-restraint-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Incident Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry records this correctly?',
            options: [
              'TM-2 TP-1 interference: broadband noise ~1470 MHz IF, ~90s/60s duty cycle, confirmed uplink (seen VT-01 + Halifax). Data layer intact (crypto ACTIVE, keys Valid) - RF denial, not intrusion. Notch applied, carrier holding. Signature consistent with deliberate interference - regulator package filed. Monitoring; escalate on any data-layer change.',
              'TM-2 had some interference, applied a notch, fixed.',
              'Confirmed hostile jamming, link saved by burn-through.',
              'Intermittent RX issue, power-cycled LNB.',
            ],
            correctIndex: 0,
            explanation: 'Everything load-bearing: signature, duty cycle, the uplink confirmation, the intact data layer (denial not intrusion), the mitigation, the disciplined finding, and the escalation tripwire. The next shift inherits a complete, defensible picture.',
            pointPenalty: 5,
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
        <em>[Call from Dana at 10:22]</em>
      </p>
      <p>
        "Catherine flagged something before she left - intermittent broadband noise on the TM-2 downlink, on-off-on, gone before she could pin it. It's back. Doesn't look like our cross-pol neighbors, doesn't look like weather. Treat it as an interference incident from minute one: characterize, discriminate, mitigate, document. And check the data layer - if this is deliberate it's denial, not a breach, but I want that confirmed, not assumed."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/21/intro.mp3'),
    },
    objectives: {
      'transponder-vs-local-quiz': {
        text: `
        <p>
          Marcus in Halifax - confirming from our side: we see the same interferer on TM-2 TP-1 that you do, and the spacecraft telemetry's clean, transponder's nominal. If we're both seeing it through the bird, it's coming up on the uplink, not local to either of us. That's not weather and it's not our hardware.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats/21/obj-transponder-vs-local-quiz.mp3'),
      },
      'verify-data-layer': {
        text: `
        <p>
          <em>[Regulator coordination desk - SYSTEM notification, 10:41]</em>
        </p>
        <p>
          "Interference report channel open for TM-2 TP-1. Submit measured parameters, spectrum captures, and cross-station confirmation. Do not attempt source attribution; geolocation tasking will be handled here. Acknowledge receipt of mitigation guidance: receive-side only, no power escalation."
        </p>
        `,
        character: Character.SYSTEM,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/21/obj-verify-data-layer.mp3'),
      },
      'configure-notch': {
        text: `
        <p>
          Good - data layer's clean, so we're working a denial event, not a breach. That keeps it on our desk and the regulator's, not the security officer's. Get the notch in and prove the customer's still up, then send the package. Nice methodical work.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/21/obj-configure-notch.mp3'),
      },
      'log-incident': {
        text: `
        <p>
          That's how you work a hostile-RF event: you measured everything, concluded nothing you couldn't back, kept the customer up, and handed the regulator a package they can actually act on. "Consistent with deliberate" - not a name, not a flag, just the evidence.
        </p>
        <p>
          If it changes character - especially anything on the data side - it escalates instantly. Until then, you've got it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/21/obj-log-incident.mp3'),
      },
    },
  },
};
