import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, IfFrequency } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 3 - "Two-Way Street" / First Commanding Window
 *
 * New mechanic: M2 LEO uplink ops (TT&C tab). Until now GW-01 has only
 * listened. This is the first time the station transmits at a LEO bird, which
 * introduces the thing GEO work never taught: the uplink Doppler shift moves
 * several hundred kHz across a seven-minute pass, so the command carrier has to
 * be pre-compensated or the spacecraft receiver never sees it.
 *
 * Phase 16 rewrite: the whole uplink shift. Reference and BUC lock checked,
 * the transmit modem tuned to the command IF (the crew left it on their test
 * carrier), Doppler compensation engaged, then the transmit chain brought up in
 * the invariant order as three separate steps - carrier into a MUTED BUC, unmute,
 * HPA - the window confirmed, the command sent and acknowledged, and the chain
 * brought down in the reverse order. Enabling the HPA while the BUC has no
 * drive trips HPA_NOISE_AMPLIFICATION and fails the mission; that is why the
 * order is three objectives and not one.
 *
 * Clock: sim starts 2027-03-15 13:45:00 UTC (the brief freezes it until read).
 * MERIDIAN-SAR-1: AOS 14:03:10 (5 deg mask), max el 28.0 at 14:06:45, LOS
 * 14:10:18. Command window 14:03:40 .. 14:10:00 = windowStartS 1120 ..
 * windowEndS 1500 from mission start. Uplink Doppler at 14.0 GHz: +/- 325 kHz.
 *
 * Key status starts Valid and `requireValidKey` is off here - COMSEC key
 * handling is scenario 4's lesson, deliberately not stacked on top of this one.
 *
 * Staged state (scenario-local clone of GW-01): BUC muted (safe), TX modem 1
 * on the acceptance crew's 1400 MHz carrier instead of the 1405 MHz command IF.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1567: Conduct satellite command and control operations
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0773: Knowledge of telemetry, tracking and commanding principles
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0740: Knowledge of system performance indicators
 *   - T1580: Report service status to stakeholders
 */

/** GW-01 before its first uplink: BUC muted, TX modem on the wrong IF. Deep clone, never spread. */
const galwayFirstUplink: GroundStationConfig = structuredClone(galwayGroundStation);
galwayFirstUplink.rfFrontEnds[0].buc = { ...galwayFirstUplink.rfFrontEnds[0].buc, isMuted: true };
const stagedModem = galwayFirstUplink.transmitters![0].modems![0];
stagedModem.ifSignal = { ...stagedModem.ifSignal, frequency: 1400e6 as IfFrequency };

export const natsEuScenario3Data: ScenarioData = {
  id: 'nats-eu-scenario3',
  url: 'nats-eu/scenarios/nats-eu-scenario3',
  imageUrl: 'nats/3/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario2'],
  title: 'Two-Way Street',
  subtitle: 'First Commanding Window',
  duration: '30-35 min',
  missionType: 'Commanding',
  description: `GW-01 is accepted for receive. Today it earns the other half of its licence: transmit.<br><br>Anneke Visser at MERIDIAN constellation ops needs a recorder playback command on the bird this pass, and the constellation's flight rules say the command has to originate from a station that has demonstrated a clean uplink. That is you, in about eighteen minutes.<br><br>Two things GEO never made you think about. The bird is closing at seven kilometres a second, so your 14 GHz carrier arrives at the spacecraft hundreds of kilohertz off frequency unless you compensate for it. And the transmit chain has an order: carrier, then BUC, then amplifier, and the mirror of that on the way down. An HPA with nothing behind it amplifies its own noise into the feed, and that ends the shift.`,
  equipment: ['4m Ku-Band LEO Tracking Antenna', 'Ku-Band BUC (12600 MHz LO) + HPA', 'TT&C Commanding Console', 'QPSK 3/4 Transmit Modem'],
  settings: {
    isSync: true,
    groundStations: [galwayFirstUplink],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-3?content-only=true&dark=true',

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
      title: 'GW-01 Command Log',
      description: 'One line per uplink: window, command, result, and the state the chain was left in.',
    },

    // M2 - uplink ops. Window bounded to the SAR-1 pass; Doppler compensation
    // required for an ACK; COMSEC deliberately not required yet (scenario 4).
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 1120,
      windowEndS: 1500,
      requireDopplerComp: true,
      requireValidKey: false,
      commands: [
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Commanding Brief',
      description: 'Open the shift brief and confirm the command, the target, and the window.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Commanding Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Uplink Doppler Understood',
          params: {
            character: Character.SYSTEM,
            question: 'MERIDIAN-SAR-1 is in a 360 km orbit closing at roughly 7 km/s. What does that do to your 14005 MHz command carrier as the spacecraft sees it?',
            options: [
              'Shifts it by hundreds of kilohertz - the spacecraft hears it off frequency unless you pre-compensate.',
              'Nothing - Doppler only affects the downlink, and the spacecraft receiver is locked to its own reference.',
              'Attenuates it - the frequency is unchanged, but the fast closing rate costs a few dB of link margin.',
            ],
            correctIndex: 0,
            explanation:
              'Correct. Downlink Doppler you can chase with AFC; uplink Doppler you have to predict and pre-compensate, because the spacecraft cannot tell you it is off frequency. Eighteen minutes to the window.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS - REFERENCE, UPLINK PLAN, DOPPLER
    // ============================================================
    {
      id: 'reference-check',
      nice: ['T0431', 'K0740'],
      title: 'Reference and BUC Lock',
      description: 'A transmitted frequency is only as good as the reference behind it. GPSDO locked, BUC phase-locked to the external 10 MHz.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
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
      id: 'tune-tx-modem',
      nice: ['K0773', 'S0421'],
      title: 'Tune the Transmit Modem to the Command IF',
      description:
        'BUC LO is 12600 MHz, low-side: RF = IF + LO. The SAR-1 telecommand receiver listens on 14005 MHz. Work out the IF and set transmit modem 1 to it; the crew left it on 1400 MHz.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Modem 1 at 1405 MHz',
          params: { modemNumber: 1, frequency: 1405e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Uplink IF Arithmetic',
          params: {
            character: Character.SYSTEM,
            question: 'BUC LO 12600 MHz, low-side. The spacecraft receiver is on 14005 MHz. What IF does the transmit modem need?',
            options: [
              '1405 MHz - RF minus LO, and the spectrum is NOT inverted on this side',
              '1400 MHz - what the crew left it on, and the BUC LO makes up the difference',
              '1414 MHz - same as the receive IF, and the spectrum is inverted on both sides',
              '11195 MHz - LO minus RF, and the spectrum is inverted on this side too',
            ],
            correctIndex: 0,
            explanation:
              'Low-side BUC: RF = IF + LO, so IF = 14005 - 12600 = 1405 MHz. The receive LNB is high-side and inverts; the transmit BUC is low-side and does not. Five megahertz off and the spacecraft never hears you.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'review-pass-schedule',
      nice: ['K1032', 'T1567'],
      title: 'Confirm the Command Window',
      description: 'Read the pass off the Pass Schedule tab and confirm when the command window is open.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-tx-modem'],
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
            question: 'When can REC-PLAYBACK be sent?',
            options: [
              '14:03:40 to 14:10:00 - inside the pass, after the bird has cleared the mask',
              'Any time before 14:10:18 - the spacecraft buffers commands until it is over the site',
              '14:03:10 to 14:10:18 - the whole pass above the mask, from AOS to LOS',
              '14:06:45 only - at culmination, when the bird is at its shortest range',
            ],
            correctIndex: 0,
            explanation:
              'The window opens thirty seconds after AOS and closes at 14:10:00. Outside it the spacecraft receiver is off the beam or below the mask and the console reports NAK - out of window.',
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
      description:
        'On the TT&C console, engage uplink Doppler compensation before the pass. It slews the transmit carrier against the predicted range rate so the spacecraft receiver sees 14005 MHz throughout.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-pass-schedule'],
      timeLimitSeconds: 2 * 60,
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
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEATS 1-2: TX CHAIN UP IN ORDER, THEN ACQUIRE
    // ============================================================
    {
      id: 'carrier-into-muted-buc',
      nice: ['S0421', 'K0645'],
      title: 'Carrier Up, BUC Muted',
      description: 'Step one of three. Put transmit modem 1 on the air into the MUTED BUC. Nothing radiates yet; the drive is there for the next step.',
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
        {
          type: 'status-check',
          description: 'Why the Carrier First',
          params: {
            character: Character.SYSTEM,
            question: 'Why does the modem carrier go up before the BUC is unmuted and long before the HPA is enabled?',
            options: [
              'So the amplifier always has drive behind it: an HPA on an empty BUC amplifies its own noise',
              'So the modem has time to settle: a carrier that is still drifting will not hold the BUC phase lock',
              'So the BUC can unmute: it will not accept the unmute command without a carrier present at its input',
              'It does not matter: the interlocks handle the order and block the HPA until there is drive',
            ],
            correctIndex: 0,
            explanation:
              'Drive before amplifier on the way up, amplifier before drive on the way down. An HPA enabled on an empty BUC amplifies its own noise floor into the feed. There is no interlock; the order is you.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'unmute-buc',
      nice: ['S0421', 'K0645'],
      title: 'Unmute the BUC',
      description: 'Step two of three. With the carrier present, unmute the BUC. The HPA stays disabled until this is done.',
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
      points: 10,
    },
    {
      id: 'enable-hpa',
      nice: ['S0421', 'K0740'],
      title: 'Enable the HPA',
      description: 'Step three of three. Enable the HPA output and confirm it is running with its 10 dB back-off, not overdriven.',
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
      points: 15,
    },
    {
      id: 'track-for-commanding',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description:
        'Program-track the bird before 14:03. You cannot command what you are not pointed at - the 4m Ku beam is under half a degree wide. Confirm the beacon on RX analysis.',
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

    // ============================================================
    // BEAT 3: THE COMMAND WINDOW
    // ============================================================
    {
      id: 'confirm-window-open',
      nice: ['T1567', 'K1032'],
      title: 'Wait for the Window',
      description: 'Bird is up, chain is radiating. On the TT&C console confirm the window reads OPEN before you send anything, and know what a NAK means.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-for-commanding'],
      conditions: [
        {
          type: 'tab-active',
          description: 'TT&C Console Open',
          params: { tab: 'commanding' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'NAK Understood',
          params: {
            character: Character.SYSTEM,
            question: 'A command sent at 14:03:20 comes back NAK. What does the Detail column most likely say, and what do you do?',
            options: [
              'Out of window - wait for 14:03:40, then send the command again',
              'No Doppler compensation - re-engage it, then send again by 14:10:00',
              'Key invalid - rotate the key before 14:10:00, then send it again',
              'Spacecraft fault - abandon the pass and log the NAK at 14:03:20',
            ],
            correctIndex: 0,
            explanation: 'Twenty seconds early. The spacecraft rejects anything outside its command window; the console tells you why. A NAK is information, not a failure.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'send-the-command',
      nice: ['T1567', 'K0773', 'K1032'],
      title: 'Send the Playback Command',
      description:
        'In the TT&C console send REC-PLAYBACK and wait for the acknowledgement. The window closes at 14:10:00 - outside it the spacecraft is over the horizon and the command is rejected.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['confirm-window-open'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'REC-PLAYBACK Acknowledged',
          params: { commandId: 'REC-PLAYBACK' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'confirm-execution',
      nice: ['T1567', 'K1032'],
      title: 'Confirm Execution',
      description: 'ACK in the log. Read it properly: what the acknowledgement does and does not tell you, while you still have the bird.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['send-the-command'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Still on the Bird',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'ACK Read',
          params: {
            character: Character.SYSTEM,
            question: 'REC-PLAYBACK shows ACK received. What does that prove?',
            options: [
              'The spacecraft received and executed it - it answered on frequency, in the window, on the next frame',
              'The command left the antenna - the HPA saw drive, the BUC was unmuted, and the carrier went out',
              'The recorder is now empty - the playback ran, the buffer cleared, and the frame confirms it',
              'The HPA reached full power - the drive was there, the back-off held, and the carrier was heard',
            ],
            correctIndex: 0,
            explanation:
              "An ACK is the spacecraft talking back: right frequency, right window, command accepted. What the recorder does afterwards is Rotterdam's telemetry to read, not yours.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 4: TX CHAIN DOWN IN ORDER, THEN LOG
    // ============================================================
    {
      id: 'disable-hpa',
      nice: ['S0421', 'K0645'],
      title: 'HPA Down First',
      description: 'Command acknowledged. Secure the chain in the mirror order: disable the HPA output while the BUC is still driving it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['confirm-execution'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Shutdown Order Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'Securing the uplink after the pass: what comes down first?',
            options: ['The HPA. Kill the amplifier before you remove its drive.', 'The modem. Stop the carrier first, then the amplifier.', 'Either - the interlocks handle it.'],
            correctIndex: 0,
            explanation:
              'Correct, and it is the mirror of bringing it up: drive before amplifier on the way up, amplifier before drive on the way down. An HPA is never left running on noise.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mute-buc',
      nice: ['S0421', 'K0645'],
      title: 'Silence the BUC',
      description: 'Amplifier off. Now mute the BUC.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['disable-hpa'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'carrier-down',
      nice: ['S0421', 'K0645'],
      title: 'Carrier Down',
      description: 'Last: take transmit modem 1 off the air. The chain is cold in the same order it went hot, reversed.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['mute-buc'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-the-window',
      nice: ['T1580', 'K0645'],
      title: 'Log the Window',
      description: 'Close the command log for the pass: what was sent, what came back, and how the chain was left.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['carrier-down'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Command Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the command log for the 14:03 window?',
            options: [
              'REC-PLAYBACK sent in window with Doppler comp, ACK received; chain secured HPA-BUC-carrier, cold',
              'REC-PLAYBACK sent in window with Doppler comp, ACK received; chain left radiating for the next pass',
              'REC-PLAYBACK sent at 14:03:20, NAK out of window; chain secured HPA-BUC-carrier, cold',
              'REC-PLAYBACK sent in window, ACK not logged; chain secured carrier-BUC-HPA, cold',
            ],
            correctIndex: 0,
            explanation: 'What went up, what came back, and that the amplifier is off. The next operator reads this before touching the chain.',
            pointPenalty: 5,
            documentSection: 'Uplinks',
            documentLine:
              '14:03Z window MERIDIAN-SAR-1: REC-PLAYBACK sent 1405 MHz IF / 14005 MHz with uplink Doppler compensation, ACK received. Chain secured HPA -> BUC mute -> carrier down; TX cold.',
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
        "Accepted for receive as of yesterday's card. Today the station earns the other half of its licence. Rotterdam has a command for SAR-1 on the 14:03 pass and their flight rules say it comes from a station with a demonstrated clean uplink. That is us, or it is nobody until the next window. One thing: the HPA never goes live without drive behind it. I have watched a site cook an amplifier that way and I would rather not watch it twice. I am in the RF room."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'tune-tx-modem': {
        text: `
        <p>
          Crew left the transmit modem where they left the receive one - on their test carrier. The BUC is low-side, so no inversion on this path: IF plus LO. Get it to 1405 or the bird hears nothing at all.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'enable-doppler-comp': {
        text: `
        <p>
          Doppler cuts both ways. The bird hears us shifted too, so the modem pre-compensates on the way up or the command ends up in the wrong bin. It is a toggle on the TT&amp;C console. It is also the whole lesson.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'carrier-into-muted-buc': {
        text: `
        <p>
          Three steps, in order, and you do each one on its own. Carrier first, into a muted BUC. Nothing goes out of the feed yet. That is the point.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'unmute-buc': {
        text: `
        <p>
          Now the BUC. Unmute it with the carrier behind it. The amplifier is still off - look at the switch, not the badge, before you go on.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'enable-hpa': {
        text: `
        <p>
          Amplifier last. Ten dB of back-off is where it lives on routine work; if the meter says overdriven you have done something to the BUC gain that you should not have.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'confirm-window-open': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at 14:02]</em>
        </p>
        <p>
          "Galway, Rotterdam. Recorder is at seventy-one percent. Window for SAR-1 opens 14:03:40 on your side; anything earlier comes back NAK and that is the spacecraft, not you. Send when it reads open."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'send-the-command': {
        text: `
        <p>
          "Window open. REC-PLAYBACK when ready. I am watching the telemetry frame."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'confirm-execution': {
        text: `
        <p>
          "ACK on the next frame, recorder is spinning. That is a clean uplink, Galway. Flight rules satisfied; you are on the commanding roster from today."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'disable-hpa': {
        text: `
        <p>
          Done. Now down, in the mirror. Amplifier first. Never, ever, the carrier first.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'carrier-down': {
        text: `
        <p>
          BUC muted, carrier off. Chain is cold and it is cold in the right order. That is the whole of transmit discipline and most people take a year to learn it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'log-the-window': {
        text: `
        <p>
          Log it. Whoever has the chain next reads that line before they touch a switch, so write what they need: what went up, what came back, and that the amplifier is off.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
