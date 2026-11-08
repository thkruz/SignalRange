import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * Clock: sim starts 2027-03-15 13:45:00 UTC. MERIDIAN-SAR-1: 5 deg mask 14:03:10 (Pass Schedule AOS at the receivable horizon 14:01:59, LOS 14:11:28),
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
  imageUrl: 'nats-eu/4/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario3'],
  title: 'Keys to the Bird',
  subtitle: 'Command-Link COMSEC',
  duration: '35-40 min',
  missionType: 'Commanding',
  description: `A command link that anyone can use isn't a command link, it's a liability. MERIDIAN commands carry an authentication tag, and the spacecraft rejects anything it can't verify.<br><br>Today's key rotation was scheduled weeks ago, and it falls in the middle of your only pass. The old command key is marked for retirement and the new material is loaded but not yet active, so until you complete the rotation the bird won't authenticate anything you send. Anneke needs a payload safe-mode command sent before the bird starts its next imaging block, and you have one window.<br><br>There's also a second key on this station, the traffic key that encrypts what you send and decrypts what comes down. Rotterdam rotates that one too, so keep an eye on it after the pass.`,
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
      // Phase 35 F-D: the key starts due for rotation (4 days left on the panel), so the
      // ACK is gated on the rotation. Confirming it moves the unit to KEY-2027-Q1b.
      keyId: 'KEY-2027-Q1',
      rotatedKeyId: 'KEY-2027-Q1b',
      initialKeyStatus: 'Pending Rotation',
      keyExpiresInDays: 4,
      // Fresh traffic key life after rotation; the panel floors the countdown, so 63 reads
      // "62 days" (the brief value) for the whole shift.
      rotatedKeyValidDays: 63,
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
      description: "Open the shift brief, then check the rotation schedule and the command you'll be sending.",
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
            question:
              'The command key, KEY-2027-Q1, has 4 days left and reads Pending Rotation, which means the new material is loaded but not active yet. What happens if you send PLD-SAFE while it still reads Pending Rotation?',
            options: [
              "The spacecraft can't authenticate it, so it rejects the command and there's no second window.",
              'The spacecraft accepts it, because the rotation only affects commands sent after it completes.',
              'The spacecraft queues it, then runs it once the rotation completes, before the imaging block.',
            ],
            correctIndex: 0,
            explanation:
              "A key that's mid-rotation can't authenticate anything, so the spacecraft rejects the command instead of holding it for later. Complete the rotation first, then send. You have about eighteen minutes before the window opens.",
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
        'Check both keys. On the TX Chain and RX Analysis tabs, confirm the payload crypto is ACTIVE in both directions and the traffic key reads Valid. Then read the command key on the TT&C console, which should now be KEY-2027-Q1b.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['complete-key-rotation'],
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
            question:
              'The traffic key reads Valid on both payload panels, and the command key now reads KEY-2027-Q1b. Which key did you rotate today, and what did that rotation control?',
            options: [
              'The command key on the TT&C console, which decides whether the spacecraft accepts PLD-SAFE',
              'The traffic key on the payload panels, which decides whether the modem can transmit at all',
              'Both keys, which share the same key material and decide transmit and command acceptance',
              'Neither key, which is rotated on the spacecraft and decides nothing until the far end confirms',
            ],
            correctIndex: 0,
            explanation:
              "The command key signs each command so the spacecraft can verify it came from NATS, and that's what today's rotation controlled. The traffic key encrypts the payload data in both directions and follows Rotterdam's schedule, not yours. The two keys are separate material on separate schedules, and only the command key was due today.",
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
      description:
        'On the TT&C console, click Initiate Key Rotation, then Confirm Key Rotation. The key reads Pending Rotation with 4 days left, and the spacecraft will refuse PLD-SAFE (a NAK) until it reads Valid. Do this before the pass starts, and leave the zeroize control alone.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
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
            question: 'You initiate the rotation, then confirm it. Why is a rotation two steps and not one switch?',
            options: [
              'The far end must acknowledge the new key first, or one step could leave the two ends on different keys',
              'The console needs time to generate the key, or one step would retire the old key before the new one exists',
              'Regulations require two button presses, or one step would let a single operator rotate without a witness',
              'The operator must be able to zeroize between the steps, or one step would carry old key material into the new key',
            ],
            correctIndex: 0,
            explanation:
              "Rotation is a handshake, not a swap, so both ends have to move to the new key together. A one-step swap could leave them on different keys, and that's a mismatch. The new material is already loaded, so the console isn't waiting to generate anything. Keep the idea of a mismatch in mind for after the pass.",
            pointPenalty: 5,
            documentSection: 'Keys',
            documentLine:
              '{{at:cond:complete-key-rotation.1|13:45}}Z: command key rotated from KEY-2027-Q1 to KEY-2027-Q1b on the TT&C console (Initiate, then Confirm) before the pass; key reads Valid, 62 days.',
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
      description:
        "Confirm the GPSDO is locked and the BUC is on the external reference, which means the Lock badge on the BUC panel of the TX Chain tab reads Locked. It's the same check as last pass, and it doesn't stop mattering.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['crypto-status-check'],
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
      description: 'Read the pass times on the Pass Schedule tab, then confirm when the command window opens and closes.',
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
              '14:03:10 to 14:10:18, with the command key in any state',
              'Any time before the imaging block, with the command key reading Valid',
              '14:06:45 only, with the command key reading Pending Rotation',
            ],
            correctIndex: 0,
            explanation:
              'PLD-SAFE can only go in the command window, 14:03:40 to 14:10:00, which is narrower than the 14:03:10 to 14:10:18 the satellite is above the mask. The console also checks the key this time, so a command sent while it reads Pending Rotation gets a NAK, a refusal from the spacecraft.',
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
      description: "Turn on uplink Doppler compensation on the TT&C console, exactly as you did last pass. New lessons don't retire old ones.",
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
      description: 'Bring the chain up in order. Step one is to put transmit modem 1 on the air, into the muted BUC.',
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
      description: 'Step two: unmute the BUC with the carrier behind it. The HPA stays disabled.',
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
      description: 'Step three: enable the HPA output and keep it within its operating limits.',
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
      description: 'Put the antenna in program-track on MERIDIAN-SAR-1 before 14:03, then confirm the beacon on the RX Analysis tab.',
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
      description:
        "Once the window is open, send PLD-SAFE and confirm the acknowledgement. The spacecraft checks the command's authentication tag against the new key before it answers.",
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
      description: 'The command is acknowledged, so bring the chain down in the mirror order: disable the HPA, mute the BUC, then take the carrier off the air.',
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
            question: 'Which of the three switches goes first when you bring the chain down?',
            options: [
              'Disable the HPA output, while the BUC is still driving it',
              'Turn the transmit modem off, while the BUC is still unmuted',
              'Mute the BUC, while the HPA is still enabled behind it',
              'Switch them in any order, because the chain is interlocked',
            ],
            correctIndex: 0,
            explanation:
              "The HPA comes off first so it's never left switched on with nothing driving it, because then it's only amplifying noise. Muting the BUC or stopping the modem first leaves it in exactly that state, and you can't count on an interlock to stop you. It's the same order as last pass.",
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
        'Shortly after LOS, the RX payload panel starts reporting decrypt failures and an unverified authentication tag, and the traffic key reads Mismatch. Read the alarm before you touch anything.',
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
            question:
              'The payload crypto reports failed decryption and an unverified authentication tag, the traffic key reads Mismatch, and the command key still reads Valid. What happened?',
            options: [
              'Rotterdam rotated the traffic key and the station is still on the old one, so re-key the payload crypto',
              'Your command-key rotation corrupted the traffic key, so both keys are suspect and you should zeroize and reload both',
              'The spacecraft was zeroized, so nothing on it can decrypt any more and you should wait for Rotterdam to reload it',
              "The LNB's local oscillator drifted, so the demodulator is losing frames and you should retune the receiver",
            ],
            correctIndex: 0,
            explanation:
              "The command key you rotated still reads Valid, so it isn't the cause. The traffic key moved at Rotterdam's end and the station didn't follow, which puts the two ends on different keys and stops the authentication tag from verifying. A drifting oscillator would show up first as a poor lock on the modem, not as a key reading Mismatch.",
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
      description: 'Load the new traffic key on the payload panel of the TX Chain tab, then confirm both directions read Valid again.',
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
            question: 'One key load fixes both the RX mismatch and the TX key status. Why does a single load cover both directions?',
            options: [
              'The traffic key is symmetric, so one key serves both encryption and decryption',
              'The RX side copies the TX side, so the load propagates from the transmit panel',
              'Re-keying resets the spacecraft, so both directions return to the default key',
              'The RX key needs a separate load, so the panel is only echoing the TX state',
            ],
            correctIndex: 0,
            explanation:
              "AES-256-GCM is a symmetric cipher, which means the same key encrypts and decrypts. So one key load covers both directions, and the authentication tag verifies again as soon as both ends hold that key. The RX side doesn't copy the TX side; both simply read the same key.",
            pointPenalty: 5,
            documentSection: 'Keys',
            documentLine:
              '{{at:cond:re-key-traffic.2|14:12}}Z: traffic key Mismatch after the far-end fleet rotation; new key loaded on the payload panel, TX and RX Valid, authentication tag verified.',
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
        'MERIDIAN-SAR-2 rises at 14:18:42 from azimuth 130 degrees. Retune receive modem 1 to 1370 MHz, track the satellite, and show the downlink decrypts under the new key. This one is optional, because the COMSEC log is complete without it.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: 'Close out the COMSEC record for the shift, covering both keys and both events: the rotation and the re-key.',
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
            question:
              'The rotation is done, the command was authenticated and the traffic key is re-keyed. Why are keys rotated on a schedule at all, instead of being left alone while they work?',
            options: [
              'Exposure builds up while a key is in use, so a schedule limits what any one compromise can reach.',
              'Keys wear out with use, so after a fixed number of messages the cipher can be broken by inspection.',
              'The spacecraft needs a new key every pass, so it discards the old one at LOS and never reuses it.',
            ],
            correctIndex: 0,
            explanation:
              "Exposure grows with every message encrypted, every day in service and every person who has seen the key, and a scheduled rotation resets all three. It isn't that the cipher wears out, and it isn't a response to a known problem. Today also showed that both ends have to rotate together, or the link stops working until they match.",
            pointPenalty: 5,
            documentSection: 'Keys',
            documentLine:
              '{{at:obj:send-authenticated-command|14:03}}Z: PLD-SAFE authenticated under the new command key and acknowledged. Chain cold. The rotation and the re-key are both on this log with their times.',
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
        "Your uplink was clean yesterday, so Rotterdam has given us a real job today. They need the payload put into safe mode before it next starts imaging. The complication is that the scheduled key rotation, booked weeks ago, has arrived in the middle of your only pass. The bird checks every command to prove it came from us, and a key that's mid-rotation doesn't count as a key, so finish the rotation before the pass and send afterwards. And leave the zeroize switch exactly where it is, because that's the one that destroys the key."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/intro.mp3'),
    },
    objectives: {
      'crypto-status-check': {
        text: `
        <p>
          That's both keys read, and people confuse them constantly. The command key on the TT&amp;C console, the telemetry, tracking and command screen, signs what you send, and the satellite checks every command against it. The traffic key on the payload panels encrypts what goes up and decrypts what comes down. Today's rotation was the command key. Next, check the reference and the BUC lock.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-crypto-status-check.mp3'),
      },
      'complete-key-rotation': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at {{stationTime}}]</em>
        </p>
        <p>
          "Galway, thank you, we can see the rotation is complete on our side. Please read the key status and confirm it reads Valid before you send. An unauthenticated PLD-SAFE will be rejected, and we won't get a second window before the imaging block."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-complete-key-rotation.mp3'),
      },
      'carrier-into-muted-buc': {
        text: `
        <p>
          That's the carrier up behind the muted BUC, the same first step as yesterday. I'm not going to say the other two again, because you know them.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-carrier-into-muted-buc.mp3'),
      },
      'secure-the-chain': {
        text: `
        <p>
          That's the chain cold, with the amplifier first, so it was never left switched on with nothing feeding it. The command is acknowledged and the station is quiet again. Keep an eye on the payload panel through LOS.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-secure-the-chain.mp3'),
      },
      'traffic-key-mismatch': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at {{stationTime}}]</em>
        </p>
        <p>
          "Galway, a heads up: the fleet traffic key rolled over at 14:11 on our schedule. If your payload crypto is complaining, this is why. The new material should already be on your console."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-traffic-key-mismatch.mp3'),
      },
      're-key-traffic': {
        text: `
        <p>
          That's both directions clear at once, because it's a single key. The far end had moved to the new key and ours hadn't, so the two ends no longer matched, and loading the new key on the payload panel fixed it. Two things are left: the COMSEC log, and an optional proof on SAR-2.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-re-key-traffic.mp3'),
      },
      'prove-the-traffic-key': {
        text: `
        <p>
          "Galway, we can see SAR-2's frames decrypting cleanly on your side under the new traffic key. It wasn't required, but we appreciate it."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-prove-the-traffic-key.mp3'),
      },
      'log-the-rotation': {
        text: `
        <p>
          That's both events logged, the rotation and the re-key, each with its time. Whoever audits my station's communications security in six months will read that entry before anything else.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-log-the-rotation.mp3'),
      },
    },
    objectivesOnStart: {
      'send-authenticated-command': {
        text: `
        <p>
          "The key reads Valid on our side too, Galway. Send PLD-SAFE once the console shows the window open, and I'll confirm the acknowledgement when it comes down."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/4/obj-send-authenticated-command.mp3'),
      },
    },
  },
};
