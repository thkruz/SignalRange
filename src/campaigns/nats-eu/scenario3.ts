import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, IfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
  imageUrl: 'nats-eu/3/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario2'],
  title: 'Two-Way Street',
  subtitle: 'First Commanding Window',
  duration: '30-35 min',
  missionType: 'Commanding',
  description: `GW-01 is accepted for receive. Today it earns the other half of its licence, which is transmit.<br><br>Anneke Visser at MERIDIAN constellation operations needs a recorder playback command sent to the satellite on this pass. The constellation's flight rules say the command has to come from a station that has demonstrated a clean uplink, and that's you, in about eighteen minutes.<br><br>Two things GEO never made you think about. The satellite is closing at seven kilometres a second, so your 14 GHz carrier arrives at the spacecraft hundreds of kilohertz off frequency unless you compensate for it. And the transmit chain has an order: carrier first, then the BUC, then the amplifier, and the reverse on the way down. An HPA with nothing driving it amplifies its own noise into the feed, and that ends the shift.`,
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
      description: "Open the shift brief and check which command you're sending, which satellite it's for, and when the window is.",
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
            question: 'MERIDIAN-SAR-1 is in a 360 km orbit and closing at roughly 7 km/s. What does that do to your 14005 MHz command carrier as the spacecraft sees it?',
            options: [
              'Shifts it by hundreds of kilohertz, so the spacecraft hears it off frequency unless you pre-compensate.',
              'Nothing, because Doppler only affects the downlink and the spacecraft receiver is locked to its own reference.',
              'Attenuates it, because the frequency stays the same but the fast closing rate costs a few dB of link margin.',
            ],
            correctIndex: 0,
            explanation:
              "That's right. You can chase downlink Doppler with automatic frequency control, but the spacecraft can't tell you it's hearing you off frequency, so you need to predict the uplink shift and pre-compensate for it. You've got about eighteen minutes before the window.",
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
      description: 'A transmitted frequency is only as good as the reference behind it. Confirm the GPSDO is locked and the BUC is phase-locked to the external 10 MHz reference.',
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
        "The BUC's LO is 12600 MHz and low-side, meaning the LO sits below the RF, so RF = IF + LO. The SAR-1 telecommand receiver, which is the part that listens for commands, is on 14005 MHz. Work out the IF and set transmit modem 1 to it; the crew left it on 1400 MHz.",
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
            question: "The BUC's LO is at 12600 MHz, low-side, and the spacecraft receiver listens on 14005 MHz. What IF does the transmit modem need?",
            options: [
              "1405 MHz, because RF minus LO gives the IF and this side of the chain isn't inverted",
              "1400 MHz, because that's what the crew left it on and the BUC LO makes up the difference",
              "1414 MHz, because it's the same as the receive IF and the spectrum is inverted on both sides",
              '11195 MHz, because LO minus RF gives the IF and the spectrum is inverted on this side too',
            ],
            correctIndex: 0,
            explanation:
              "With a low-side BUC, RF = IF + LO, so the IF is 14005 minus 12600, which is 1405 MHz. The receive LNB is high-side and inverts the spectrum, but the transmit BUC is low-side and doesn't. If you're five megahertz off, the spacecraft never hears you.",
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
      description:
        'Read AOS and LOS off the Pass Schedule tab, then confirm when the command window is open. The window itself is on the TT&C (telemetry, tracking and command) console, shown as T+18:40 to T+25:00 in mission elapsed time.',
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
            question: 'When can you send REC-PLAYBACK to SAR-1?',
            options: [
              '14:03:40 to 14:10:00, which is inside the pass and after the bird has cleared the mask',
              "Any time before 14:10:18, because the spacecraft buffers commands until it's over the site",
              '14:03:10 to 14:10:18, which is the whole pass above the mask from AOS to LOS',
              "14:06:45 only, because that's culmination, when the bird is at its shortest range",
            ],
            correctIndex: 0,
            explanation:
              'The window opens thirty seconds after AOS and closes at 14:10:00, which is T+18:40 to T+25:00 on the TT&C console. Outside it, the spacecraft receiver is off the beam or below the mask, and the console reports NAK, a negative acknowledgement, with the detail "out of window".',
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
        'On the TT&C console, turn on uplink Doppler compensation before the pass. It shifts the transmit carrier against the predicted range rate, so the spacecraft receiver sees 14005 MHz throughout.',
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
      description: 'Step one of three: put transmit modem 1 on the air into the muted BUC. Nothing radiates yet, but the drive signal is in place for the next step.',
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
            question: 'Why does the modem carrier go up before the BUC is unmuted, and long before the HPA is enabled?',
            options: [
              'So the amplifier always has drive behind it, because an HPA on an empty BUC amplifies its own noise',
              "So the modem has time to settle, because a carrier that's still drifting won't hold the BUC phase lock",
              "So the BUC can unmute, because it won't accept the unmute command without a carrier at its input",
              "It doesn't matter, because the interlocks handle the order and block the HPA until there's drive",
            ],
            correctIndex: 0,
            explanation:
              "On the way up, drive comes before the amplifier, and on the way down the amplifier goes before the drive. An HPA enabled on an empty BUC amplifies its own noise floor into the feed. There's no interlock to stop you, so the order is your job.",
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
      description: 'Step two of three: now that the carrier is present, unmute the BUC. Leave the HPA disabled until this is done.',
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
      description: "Step three of three: enable the HPA output, then confirm it's running with its normal 10 dB of back-off (headroom below its limit) and isn't overdriven.",
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
        "Program-track the satellite before 14:03. You can't command something you aren't pointed at, because the 4m Ku beam is under half a degree wide. Then confirm the beacon on the RX Analysis tab.",
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
      description:
        'The satellite is up and the chain is radiating. On the TT&C console, check that the window reads OPEN before you send anything, and be ready to explain what a NAK means.',
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
              'Out of window, so wait for 14:03:40 and then send the command again',
              'No Doppler compensation, so re-engage it and send again by 14:10:00',
              'Key invalid, so rotate the key and send it again before 14:10:00',
              'Spacecraft fault, so abandon the pass and log the NAK at 14:03:20',
            ],
            correctIndex: 0,
            explanation:
              "The command went out twenty seconds before the window opened, so the spacecraft rejected it as out of window. The console's Detail column tells you why a command was refused, which makes a NAK information rather than a failure. The right move is to wait for the window and send again.",
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
        'In the TT&C console, send REC-PLAYBACK and wait for the acknowledgement. The window closes at 14:10:00; after that the spacecraft is over the horizon and the command is rejected.',
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
      description:
        "The log shows an ACK, which is the spacecraft's acknowledgement. Read it carefully and work out what it does and doesn't tell you while you're still tracking the satellite.",
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
              'The spacecraft received and accepted it, because it answered on frequency and in the window',
              'The playback is complete, because the spacecraft only acknowledges commands it has finished',
              'The recorder is now empty, because the playback ran and the buffer cleared on the next frame',
              'The HPA reached full power, because the drive was there and the back-off held on the carrier',
            ],
            correctIndex: 0,
            explanation:
              "An ACK is the spacecraft talking back, which means it heard the right frequency in the right window and accepted the command. It doesn't prove the playback has finished, that the recorder is empty or that the HPA reached full power. What the recorder does afterwards is for Rotterdam to read in telemetry, not for you.",
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
      description: 'The command is acknowledged. Secure the chain in the mirror order: disable the HPA output while the BUC is still driving it.',
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
            question: "You're securing the uplink after the pass. What comes down first?",
            options: [
              'The HPA. Kill the amplifier before you remove its drive.',
              'The modem. Stop the carrier first, then the amplifier.',
              'Either one, because the interlocks handle the order for you.',
            ],
            correctIndex: 0,
            explanation:
              "That's right, and it's the mirror of bringing the chain up: drive comes before the amplifier on the way up, and the amplifier goes before the drive on the way down. If you stop the carrier first, the HPA is left running on noise. That's why the amplifier always goes first.",
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
      description: 'The amplifier is off. Now mute the BUC.',
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
      description: 'Last step: take transmit modem 1 off the air. That leaves the chain cold, in the reverse of the order it went hot.',
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
      description: 'Close the command log for the pass: what you sent, what came back, and how you left the chain.',
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
            explanation:
              'The entry has to say what went up, what came back, and that the amplifier is off, because the next operator reads this line before touching the chain. The other entries each get one of those wrong: they record a rejected command, leave the chain radiating, or put the shutdown order backwards.',
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
        "GW-01 was accepted for receive on the card you signed. Today the station earns the other half of its licence, which is transmit. Rotterdam has a command for SAR-1 on the 14:03 pass, and Rotterdam's flight rules, the constellation's operating rules, say it has to come from a station with a demonstrated clean uplink. That's us, or it's nobody until the next window. One thing to remember: the HPA never goes live without drive behind it, and drive is just the input signal feeding it. I've watched a site cook an amplifier that way and I'd rather not watch it twice. I'm in the RF room if you need me."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/intro.mp3'),
    },
    objectives: {
      'tune-tx-modem': {
        text: `
        <p>
          That's the transmit modem at 1405 MHz. The crew left it on their test carrier, the same way they left the receive one. The BUC is low-side, so there's no spectrum inversion on this path and the RF is simply the IF plus the LO. At any other setting the satellite hears nothing at all. Next, confirm the command window on the pass schedule.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-tune-tx-modem.mp3'),
      },
      'enable-doppler-comp': {
        text: `
        <p>
          That's uplink Doppler compensation engaged. Doppler cuts both ways, since the satellite hears us shifted too, so the modem has to pre-compensate on the way up, or the command arrives on the wrong frequency and the spacecraft receiver never sees it. It was one toggle on the TT&amp;C console, the telemetry, tracking and command screen, and it's also the whole lesson. Now we bring the chain up in three steps, in order, each on its own. The carrier goes first, into a muted BUC.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-enable-doppler-comp.mp3'),
      },
      'carrier-into-muted-buc': {
        text: `
        <p>
          That's the first step: the carrier is up behind a muted BUC, so nothing goes out of the feed yet. That's the point. Next is the BUC, and the amplifier comes last.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-carrier-into-muted-buc.mp3'),
      },
      'unmute-buc': {
        text: `
        <p>
          The BUC is unmuted with the carrier behind it, and the amplifier is still off. That's why I wanted you to look at the HPA switch itself and not the status badge. Now the amplifier, the last of the three steps.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-unmute-buc.mp3'),
      },
      'enable-hpa': {
        text: `
        <p>
          The amplifier is live and inside its limits. On routine work it runs with ten dB of back-off, meaning it sits ten dB below its limit, and if the meter had said overdriven, you'd have done something to the BUC gain that you shouldn't have. Next, acquire SAR-1 with program-track.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-enable-hpa.mp3'),
      },
      'confirm-window-open': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at {{stationTime}}]</em>
        </p>
        <p>
          "Galway, this is Rotterdam. The recorder is at seventy-one percent. The window for SAR-1 opens at 14:03:40 on your side, and anything sent before it opens comes back NAK, which is the spacecraft refusing it and not a fault on your end. Please send once the console reads open."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-confirm-window-open.mp3'),
      },
      'send-the-command': {
        text: `
        <p>
          "REC-PLAYBACK is in, Galway, and your console has the ACK. I'm watching the telemetry frame for the recorder now, so stay on the satellite until I call it."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-send-the-command.mp3'),
      },
      'confirm-execution': {
        text: `
        <p>
          "The recorder is spinning on the next frame. That's a clean uplink, Galway, so the flight rules are satisfied and you're on the commanding roster from today. I'll admit that's a relief."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-confirm-execution.mp3'),
      },
      'disable-hpa': {
        text: `
        <p>
          The amplifier is off, and that's the right order: HPA first, while the BUC is still driving it. Never, ever the carrier first, because that leaves the HPA running on noise. Now mute the BUC.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-disable-hpa.mp3'),
      },
      'carrier-down': {
        text: `
        <p>
          The BUC is muted and the carrier is off, so the chain is cold, and it went cold in the right order. That's the whole of transmit discipline, and most people take a year to learn it. Now write the log entry.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-carrier-down.mp3'),
      },
      'log-the-window': {
        text: `
        <p>
          That's the window logged. Whoever has the chain next reads that line before they touch a switch, so it has to say what went up, what came back, and that the amplifier is off. Do it the same way every pass, and it stops being a procedure and becomes a habit.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/3/obj-log-the-window.mp3'),
      },
    },
  },
};
