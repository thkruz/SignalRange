import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 4 - "Keys to the Bird" / Command-Link COMSEC
 *
 * New mechanic: M5 command-link authentication and key operations. Scenario 3
 * proved GW-01 can reach the spacecraft; this one adds the requirement that the
 * spacecraft can prove the command came from NATS. `requireValidKey` is on, so
 * a command sent on a key that is mid-rotation is rejected - the operator has to
 * complete the scheduled rotation before the window closes.
 *
 * Two keys live on this station and the scenario teaches both:
 * - the command-link authentication key on the TT&C console (CommandingManager:
 *   Valid / Pending Rotation / Zeroized, rotated in two steps), and
 * - the traffic key on the payload crypto (CryptoModule: encrypts the uplink,
 *   decrypts the downlink; Valid / Mismatch / Expired, re-keyed from the TX
 *   payload panel).
 *
 * Phase 16 rewrite: the full uplink shift from scenario 3 with COMSEC on top,
 * then a staged traffic-key mismatch after the pass (hardwareFaultEvents,
 * `crypto-key-mismatch`, at 14:11): Rotterdam rotated the traffic key on
 * schedule, the far end changed, decrypt and auth-tag verification fail and the
 * key reads Mismatch. The operator re-keys and proves the traffic key on the
 * optional SAR-2 pass.
 *
 * Clock: sim starts 2027-03-15 13:45:00 UTC. MERIDIAN-SAR-1: AOS 14:03:10,
 * max el 28.0 at 14:06:45, LOS 14:10:18; command window 14:03:40 .. 14:10:00 =
 * windowStartS 1120 .. windowEndS 1500. MERIDIAN-SAR-2: AOS 14:18:42, max el
 * 25.0 at 14:22:10, LOS 14:25:40 (C/N >= 8 dB 14:20:45 .. 14:23:45).
 *
 * The console's zeroize control is deliberately arm-then-fire and is NOT part of
 * any objective here: emergency key destruction is scenario 21's lesson, and an
 * accidental zeroize during a routine rotation should feel like the serious
 * mistake it is.
 *
 * Staged state (scenario-local clone of GW-01): BUC muted, as scenario 3 left it.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0874: Knowledge of cryptographic key management concepts
 *   - K0875: Knowledge of cryptology
 *   - K0728: Knowledge of cryptographic key storage and handling
 *
 * Supporting Codes:
 *   - S0077: Skill in securing network communications
 *   - T1567: Conduct satellite command and control operations
 *   - K0645: Knowledge of standard operating procedures
 *   - S0421: Skill in operating network equipment
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - T1580: Report service status to stakeholders
 */

/** GW-01 as scenario 3 left it: chain cold, BUC muted. Deep clone, never spread. */
const galwayComsec: GroundStationConfig = structuredClone(galwayGroundStation);
galwayComsec.rfFrontEnds[0].buc = { ...galwayComsec.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario4Data: ScenarioData = {
  id: 'nats-eu-scenario4',
  url: 'nats-eu/scenarios/nats-eu-scenario4',
  imageUrl: 'nats/4/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario3'],
  title: 'Keys to the Bird',
  subtitle: 'Command-Link COMSEC',
  duration: '35-40 min',
  missionType: 'Commanding',
  description: `A command link that anyone can use is not a command link, it is a liability. MERIDIAN commands carry an authentication tag; the spacecraft rejects anything it cannot verify.<br><br>Today's rotation was scheduled weeks ago and it lands, as these things do, in the middle of your only pass. The old command key is already marked for retirement and the new material is loaded but not yet active. Until you complete the rotation, the bird will not authenticate a thing you send. Anneke needs a payload safe-mode command before the bird goes into its next imaging block. You have one window.<br><br>And there is a second key on this station, the traffic key that encrypts what you send and decrypts what comes down. Rotterdam rotates that one too. Keep an eye on it after the pass.`,
  equipment: ['4m Ku-Band LEO Tracking Antenna', 'Ku-Band BUC + HPA', 'TT&C Commanding Console (COMSEC)', 'Payload Crypto (AES-256-GCM)', 'QPSK 3/4 Transmit Modem'],
  settings: {
    isSync: true,
    groundStations: [galwayComsec],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-4?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'GW-01 COMSEC Log',
      description: 'Key events on the station: rotations, re-keys, mismatches, and the command traffic authenticated under each key.',
    },

    // M5 - COMSEC required. A command sent while the key is Pending Rotation is
    // rejected, so the rotation must complete inside the pass window.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 1120,
      windowEndS: 1500,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },

    // Phase 16 E3: Rotterdam rotates the TRAFFIC key on schedule at 14:11, just
    // after LOS. The far end changes; the station's payload crypto reads
    // Mismatch (decrypt fails, auth tag fails) until the operator re-keys.
    hardwareFaultEvents: [{ id: 'traffic-key-rotation', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startTime: 1560 }],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the COMSEC Brief',
      description: 'Open the shift brief and confirm the rotation schedule and the command to be sent.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'COMSEC Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Rotation Risk Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The command key is marked Pending Rotation when the pass starts. What happens if you send PLD-SAFE before completing the rotation?',
            options: [
              'The spacecraft cannot authenticate it and rejects it - and there is no second window before the imaging block.',
              'It is accepted; the rotation only affects future commands.',
              'It is queued on the spacecraft until the rotation completes.',
            ],
            correctIndex: 0,
            explanation: 'Correct. A key mid-rotation is not a key. Complete the rotation first, then send. Eighteen minutes to the window.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS - KEYS, REFERENCE, WINDOW, CHAIN UP
    // ============================================================
    {
      id: 'crypto-status-check',
      nice: ['K0728', 'K0874'],
      title: 'Read Both Keys',
      description:
        'Two keys on this station. On the TX chain and RX analysis payload panels confirm the traffic crypto is ACTIVE both ways with the traffic key Valid; then read the command key on the TT&C console.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-crypto-status',
          description: 'TX Encryption ACTIVE',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-key-status',
          description: 'TX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-crypto-status',
          description: 'RX Decryption ACTIVE',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Which Key Rotates',
          params: {
            character: Character.SYSTEM,
            question: "Traffic key Valid with 62 days left; command key Pending Rotation. Which one is today's rotation, and what does it gate?",
            options: [
              'The command-link authentication key on the TT&C console - it gates whether the spacecraft accepts PLD-SAFE',
              'The traffic key - it gates whether the modem can transmit',
              'Both - they are the same key',
              'Neither - the rotation is on the spacecraft',
            ],
            correctIndex: 0,
            explanation:
              'The command key signs each command so the bird can prove who sent it. The traffic key encrypts the payload data both ways. Different custody, different schedules, and today only one of them is in rotation.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'complete-key-rotation',
      nice: ['K0874', 'K0728', 'S0077'],
      title: 'Complete the Scheduled Key Rotation',
      description: 'On the TT&C console: Initiate Key Rotation, then Confirm Key Rotation. Do it before the pass, not during it. Leave the zeroize control alone.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['crypto-status-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TT&C Console Open',
          params: { tab: 'commanding' },
          mustMaintain: false,
        },
        {
          type: 'key-rotation-completed',
          description: 'Command Key Rotation Completed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Two Steps',
          params: {
            character: Character.SYSTEM,
            question: 'Initiate, then Confirm. Why is a rotation two steps and not one switch?',
            options: [
              'The far end must acknowledge the new key is loaded before the old one is retired - a one-step swap can leave the two ends on different keys, which is a mismatch',
              'The console needs time to generate the key',
              'Regulations require two button presses',
              'So the operator can zeroize between them',
            ],
            correctIndex: 0,
            explanation: 'Rotation is a handshake, not a swap. Both ends move together or one of them stops understanding the other. Keep that in mind after the pass.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'reference-check',
      nice: ['T0431', 'K0740'],
      title: 'Reference and BUC Lock',
      description: 'GPSDO locked, BUC on the external reference. Same as last pass; it does not stop mattering.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['complete-key-rotation'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'buc-reference-locked',
          description: 'BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'review-pass-schedule',
      nice: ['K1032', 'T1567'],
      title: 'Confirm the Command Window',
      description: 'Read the pass off the Pass Schedule tab and confirm when the window is open.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'Pass Schedule Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Window Read',
          params: {
            character: Character.SYSTEM,
            question: 'When can PLD-SAFE be sent, and what must be true of the command key by then?',
            options: [
              '14:03:40 to 14:10:00, with the command key reading Valid',
              '14:03:10 to 14:10:18, any key state',
              'Any time before the imaging block',
              'Only at culmination, 14:06:45',
            ],
            correctIndex: 0,
            explanation: 'Same window as last pass. This time the console also checks the key: Pending Rotation is a NAK, key invalid.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-doppler-comp',
      nice: ['T1567', 'K0773'],
      title: 'Enable Uplink Doppler Compensation',
      description: 'Engage uplink Doppler compensation on the TT&C console, exactly as last pass. New lessons do not retire old ones.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-pass-schedule'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'carrier-into-muted-buc',
      nice: ['S0421', 'K0645'],
      title: 'Carrier Up, BUC Muted',
      description: 'Chain up in order. Step one: transmit modem 1 on the air into the muted BUC.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['enable-doppler-comp'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Still Muted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'unmute-buc',
      nice: ['S0421', 'K0645'],
      title: 'Unmute the BUC',
      description: 'Step two: unmute the BUC with the carrier behind it. HPA still disabled.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['carrier-into-muted-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Still Disabled',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-hpa',
      nice: ['S0421', 'K0740'],
      title: 'Enable the HPA',
      description: 'Step three: HPA output enabled, within limits.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['unmute-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Operating Limits',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: THE PASS
    // ============================================================
    {
      id: 'track-and-acquire',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Program-track MERIDIAN-SAR-1 before 14:03 and confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['enable-hpa'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'send-authenticated-command',
      nice: ['T1567', 'K0875', 'S0077'],
      title: 'Send the Authenticated Command',
      description: 'In the window, send PLD-SAFE and confirm the acknowledgement. The spacecraft verifies the authentication tag under the new key before it answers.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-and-acquire'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-SAFE Acknowledged',
          params: { commandId: 'PLD-SAFE' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },

    // ============================================================
    // BEAT 4: CHAIN DOWN, THEN THE TRAFFIC KEY
    // ============================================================
    {
      id: 'secure-the-chain',
      nice: ['S0421', 'K0645'],
      title: 'Secure the Chain',
      description: 'Command acknowledged. Bring the chain down in the mirror order: HPA off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['send-authenticated-command'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Order Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'Three switches, one order. Which goes first on the way down?',
            options: [
              'HPA output off, while the BUC is still driving it',
              'Transmit modem off, to remove the carrier',
              'BUC mute, to stop the drive',
              'Any - the chain is interlocked',
            ],
            correctIndex: 0,
            explanation: 'Amplifier before drive on the way down. Same as last pass, and the pass after that.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'traffic-key-mismatch',
      nice: ['K0728', 'K0875'],
      title: 'Read the Traffic Key Alarm',
      description:
        'Shortly after LOS the RX payload panel starts reporting decrypt failures and an unverified auth tag, and the traffic key reads Mismatch. Read it before you touch anything.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['secure-the-chain'],
      conditions: [
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Reads Mismatch',
          params: { keyStatus: 'Mismatch', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Mismatch Diagnosed',
          params: {
            character: Character.SYSTEM,
            question: 'Decrypt failing, auth tag unverified, traffic key Mismatch, and the command key still reads Valid. What happened?',
            options: [
              'Rotterdam rotated the traffic key on schedule; the far end changed and this station is still on the old key - re-key the payload crypto',
              'The command-key rotation you did corrupted the traffic key',
              'The spacecraft was zeroized',
              'The LNB LO drifted and the demodulator is losing frames',
            ],
            correctIndex: 0,
            explanation:
              'Two keys, two schedules. The one you rotated is fine. The traffic key moved at the far end and the station did not follow: a mismatch is the two ends of a handshake on different keys.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 're-key-traffic',
      nice: ['K0728', 'S0077', 'K0874'],
      title: 'Re-key the Payload Crypto',
      description: 'Load the new traffic key on the TX chain payload panel and confirm both directions read Valid again.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['traffic-key-mismatch'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'TX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Valid',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Re-key Understood',
          params: {
            character: Character.SYSTEM,
            question: 'One key load cleared the RX mismatch and the TX key together. Why?',
            options: [
              'The traffic key is symmetric - one key material serves encrypt and decrypt, so the station is either on the current key or it is not',
              'The RX side copies whatever the TX side does',
              'Re-keying resets the spacecraft',
              'It did not; the RX key needs a separate load',
            ],
            correctIndex: 0,
            explanation: 'AES-256-GCM is symmetric. One key, both directions, and the auth tag verifies again as soon as both ends share it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'prove-the-traffic-key',
      nice: ['K0875', 'S0421'],
      title: 'Prove the Traffic Key on SAR-2',
      description:
        'MERIDIAN-SAR-2 rises at 14:18:42 from azimuth 130. Retune modem 1 to 1370 MHz, track it, and show the downlink decrypts under the new key. Optional: the COMSEC log is complete without it.',
      groundStation: 'GW-01',
      isOptional: true,
      prerequisiteObjectiveIds: ['re-key-traffic'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'rx-crypto-status',
          description: 'Decrypting',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'log-the-rotation',
      nice: ['K0874', 'T1580'],
      title: 'Log the Rotation',
      description: 'Close out the COMSEC record for the shift: both keys, both events.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['re-key-traffic'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'COMSEC Record Closed',
          params: {
            character: Character.SYSTEM,
            question: 'Rotation complete, command authenticated, traffic key re-keyed. Why is a key rotation scheduled at all, rather than left alone while it is working?',
            options: [
              'A key in use accumulates exposure - traffic, time, people who have seen it. Rotating on a schedule limits what any one compromise can reach.',
              'Keys wear out cryptographically after a fixed number of uses.',
              'The spacecraft requires a new key every pass.',
            ],
            correctIndex: 0,
            explanation: 'Exactly. Scheduled rotation is hygiene, not a response to a known problem - and today showed the cost of one end rotating without the other.',
            pointPenalty: 5,
            documentSection: 'Keys',
            documentLine:
              '14:03Z: command-link key rotation completed on the TT&C console before the window; PLD-SAFE authenticated under the new key, ACK received. 14:11Z: traffic key Mismatch after far-end rotation; payload crypto re-keyed, TX and RX Valid, auth tag verified. Chain cold.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Charlie Brooks at 13:44]</em>
      </p>
      <p>
        "Clean uplink yesterday, so Rotterdam has given us a real one today: safe-mode the payload before the next imaging block. There is a complication, which is that the scheduled key rotation was booked weeks ago and has, naturally, arrived in the middle of your only pass. The bird authenticates every command. A key that is mid-rotation is not a key. Finish the rotation before the pass, then send. And leave the zeroize switch exactly where it is."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'crypto-status-check': {
        text: `
        <p>
          Two keys on this rack and people confuse them constantly. Command key on the TT&amp;C console signs what you send. Traffic key on the payload panels encrypts what goes up and decrypts what comes down. Read both before you touch either.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'complete-key-rotation': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at 13:50]</em>
        </p>
        <p>
          "Galway, our records show your command key in its rotation window today. Please confirm the rotation is complete and the key reads Valid before you send - an unauthenticated PLD-SAFE will be rejected and we will not get a second window before the imaging block."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'carrier-into-muted-buc': {
        text: `
        <p>
          Same three steps as yesterday. I am not going to say them again; you know them.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'send-authenticated-command': {
        text: `
        <p>
          "Key reads Valid on our side too. Window open - PLD-SAFE when ready."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'secure-the-chain': {
        text: `
        <p>
          Authenticated and acknowledged. Bring it down. Amplifier first.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'traffic-key-mismatch': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at 14:12]</em>
        </p>
        <p>
          "Galway - heads up, the fleet traffic key rolled at 14:11 on our schedule. If your payload crypto is complaining, that is why. New material should already be on your console."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      're-key-traffic': {
        text: `
        <p>
          There it is: one end of the handshake moved and the other did not. Load the new key on the payload panel. Watch both directions clear at once - it is one key.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'prove-the-traffic-key': {
        text: `
        <p>
          "SAR-2 is up for you at 14:18 if you want to prove the new traffic key on live frames. Not required. Appreciated."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'log-the-rotation': {
        text: `
        <p>
          Log both. Rotation and re-key, with times. Whoever audits this station's COMSEC in six months will read that line before they read anything else.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
