import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 23 - "Dark Passes" / Degraded Manual Operations (Gray Zone arc 7/8)
 *
 * The report went out on Thursday. Saturday night the answer comes back, all
 * at once. SAR-2 has a payload thermal problem and Rotterdam needs PLD-SAFE up
 * on the 21:22 pass - the single tasking that matters tonight. At 21:14 three
 * things happen inside a minute: the GNSS vs REF delta-T starts walking again
 * (spoofer, Galway), SAR-2 executes a debris-avoidance burn and the station's
 * element set goes stale, and Anneke says the carrier will be sat on the
 * moment the window opens. Eight minutes to AOS.
 *
 * The lesson is prioritisation under several simultaneous faults (13.5):
 * not every alarm is the pass. The ephemeris is the pass - without it there is
 * nothing to point at. The reference walk is the timestamps - holdover takes
 * ten seconds and can wait until the tracker is fixed. The jammer is not on
 * the air yet, and a hop set is spent on a called denial, not on a forecast.
 * Then it all happens in the window: HK-DUMP ACKs on the fixed carrier,
 * PLD-SAFE NAKs "uplink denied", the operator calls it with the reference in
 * holdover and the key Valid, hops, and PLD-SAFE goes up through the jamming.
 *
 * Phase 18: two decisions. `triage` is graded on the clock - at 21:14
 * timing-drifting is true and uplink-jammed is false, so "ephemeris first" is
 * right and "hop set first" is wrong; a player who dawdles into the window
 * finds the second option graded right instead. `call-the-denial` is S19's
 * call again with the reference free-running, which is the trap: the denial
 * is not the holdover.
 *
 * Clock starts 2027-04-24 21:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 21:00:00Z):
 *
 *   MERIDIAN-SAR-2: AOS T+22.03 (21:22:01Z, az 022), max el 32.8 deg at T+26.83
 *                   (21:26:50Z, 663 km), LOS T+31.58 (21:31:35Z, az 177), 9.5 min,
 *                   southbound. The commanding pass; window 21:22:21 .. 21:31:15
 *                   (T+1341 .. T+1875). Post-burn orbit.
 *   MERIDIAN-SAR-1: AOS T+39.97 (21:39:58Z, az 004), max el 27.0 deg, LOS T+49.45.
 *                   In the sky, not tasked.
 *
 * The surge, on the mission clock:
 *   T+840  (21:14:00Z) settings.gnssThreat spoof begins, GW-01 only, 2 us/s, to end.
 *   T+840  (21:14:00Z) settings.spaceEvents SAR2-DAM: SAR-2 moves onto the post-burn
 *          set; the station keeps predicting from the pre-burn set (initialTle,
 *          mean anomaly -0.03 deg) until the operator loads the update.
 *   T+1470 (21:24:30Z) settings.interferenceEvents sar2-uplink-jam-2: transponder
 *          path on the 14035 MHz command carrier, 2 MHz, to 21:31:30Z.
 *
 * Staged state (scenario-local clone of GW-01): TX modem 1 on 1405 MHz - to be
 * retuned to 1435; RX modem 1 on 1414 - to be retuned to 1370. BUC muted.
 * KEY-2027-Q2b live; hop set HOP-SAR2-05 in the COMSEC store, inactive.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0671: Skill in prioritizing tasks under contingency conditions
 *   - T1277: Perform contingency operations
 *   - S0424: Skill in operating under degraded conditions
 *
 * Supporting Codes:
 *   - S0593: Skill in handling incidents
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - K0752: Knowledge of system vulnerabilities
 *   - T1138: Update ephemeris / orbital data
 *   - K0925: Knowledge of wireless technologies and their security
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0421: Skill in operating communications equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - K0741: Knowledge of alarm states and their meaning
 *   - T0153: Monitor network capacity and performance
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-2 (61702) at the S23 epoch, post-burn: the 33 deg commanding pass, southbound from az 022. */
const SAR2_S23_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27114.87500000  .00001000  00000-0  10000-3 0  9991' as TleLine1,
  tle2: '2 61702  98.4000 342.0000 0010000  90.0000 292.2500 15.63040000123452' as TleLine2,
};

/** The pre-burn set the station is still predicting from at 21:00 (mean anomaly -0.03 deg). */
const SAR2_S23_PRE_BURN_TLE2 = '2 61702  98.4000 342.0000 0010000  90.0000 292.2200 15.63040000123452';

/** MERIDIAN-SAR-1 (61701) at the S23 epoch: a 27 deg pass at 21:40, untasked. */
const SAR1_S23_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27114.87500000  .00001000  00000-0  10000-3 0  9990' as TleLine1,
  tle2: '2 61701  97.2000 329.7500 0010000  90.0000 220.0000 15.59010000123451' as TleLine2,
};

const meridianSar1S23 = createMeridianSar1(SAR1_S23_TLE);
const meridianSar2S23 = createMeridianSar2(SAR2_S23_TLE);

/** GW-01 as the day shift left it: RX on SAR-1's video IF, TX on SAR-1's command IF, BUC muted. Deep clone, never spread. */
const galwayDark: GroundStationConfig = structuredClone(galwayGroundStation);
galwayDark.receivers![0].modems![0] = {
  ...galwayDark.receivers![0].modems![0],
  frequency: 1414 as MHz,
};
galwayDark.rfFrontEnds[0].buc = { ...galwayDark.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario23Data: ScenarioData = {
  id: 'nats-eu-scenario23',
  url: 'nats-eu/scenarios/nats-eu-scenario23',
  imageUrl: 'nats-eu/23/card.png',
  number: 23,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario22'],
  title: 'Dark Passes',
  subtitle: 'Degraded Manual Operations (Gray Zone 7/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `21:00, Galway, Saturday. SAR-2's payload is running too hot, and Rotterdam needs PLD-SAFE, the safe-mode command, up on the 21:22 pass. One command. That's the shift.<br><br>The report went out on Thursday with their method in it, and Priya thinks they've read it. If everything they've tried once arrives at the same time tonight, the question is which of it can cost you the pass, and in what order you deal with the rest.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO, 12600 MHz BUC LO) + HPA',
    'GPS-disciplined 10 MHz reference (GPS Timing panel)',
    'Pass Schedule with ephemeris inbox',
    'TT&C Commanding Console with TRANSEC waveform (Security console)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayDark, shetlandGroundStation],
    satellites: [meridianSar1S23, meridianSar2S23],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-24',
    scenarioStartWallTime: '21:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-23?content-only=true&dark=true',

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
      title: 'Surge Log SL-2027-0424-GW01',
      description: 'The night of 24 April: what arrived at 21:14, in what order it was dealt with, and whether PLD-SAFE went up.',
    },

    // M2/M5 - the commanding pass. uplinkFrequencyHz couples the console to
    // the jammer below: fixed-mode commands NAK 'uplink-jammed' while it is in
    // its envelope and TRANSEC is not synced.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61702,
      windowStartS: 1341,
      windowEndS: 1875,
      requireDopplerComp: true,
      requireValidKey: true,
      uplinkFrequencyHz: 14035e6,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'PLD-STATUS', label: 'Payload status request' },
      ],
    },

    // M7 - HOP-SAR2-05, staged since Wednesday.
    transec: {
      groundStationId: 'GW-01',
      hopChannelsHz: [14031e6, 14033e6, 14035e6, 14037e6, 14039e6],
      requireKey: true,
    },

    // M8 - the spoofer, back, from 21:14 to the end of the shift. GW-01 only.
    gnssThreat: {
      groundStationIds: ['GW-01'],
      spoofStartS: 840,
      offsetDriftUsPerS: 2,
    },

    // M4 - the burn. SAR-2 moves onto the post-burn set at 21:14; the
    // station predicts from the pre-burn set until the update is loaded.
    spaceEvents: [
      {
        id: 'SAR2-DAM',
        satelliteNoradId: 61702,
        maneuverAtS: 840,
        label: 'MERIDIAN-SAR-2 debris-avoidance manoeuvre executed 21:14Z; post-burn element set issued',
        newTle: { tle1: SAR2_S23_TLE.tle1 as string, tle2: SAR2_S23_TLE.tle2 as string },
        initialTle: { tle1: SAR2_S23_TLE.tle1 as string, tle2: SAR2_S23_PRE_BURN_TLE2 },
      },
    ],

    // The jammer: on the command carrier at the satellite from 21:24:30, two
    // minutes into the window, for the rest of it.
    interferenceEvents: [
      {
        id: 'sar2-uplink-jam-2',
        satelliteNoradId: 61702,
        frequency: 14035e6,
        bandwidth: 2e6,
        power: 76, // jammer EIRP, dBm: drives the telecommand transponder ~3 dB past saturation from a 740 km slant (phase 19.3; was 5 dBm at the input)
        polarization: 'H',
        // Phase 19.0a: keyed 10 s after 'call-the-denial' opens, not at a fixed 1470 s.
        // A player whose first command was still unsent when a fixed jam came up
        // was refused on the fixed carrier before hopping was taught: a deadlock.
        // Before it, the denial call graded "holdover drifted" correct.
        startAfterObjectiveId: 'call-the-denial',
        startTime: 10,
        duration: 420,
        periodSeconds: 420,
        onSeconds: 420,
      },
    ],

    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'kg-01', name: 'KG-01 command crypto unit', role: 'Equipment', status: 'active' },
      ],
      events: [
        {
          id: 'evt-iar-issued',
          timeS: 0,
          timestampLabel: '22 Apr 15:40 UTC',
          actor: 'op-duty',
          action: 'Incident attribution report IAR-2027-0422-GW01 issued (Rotterdam, ComReg, NMW, Group CSIRT)',
          category: 'config',
          severity: 'info',
        },
        {
          id: 'evt-hopset-05-staged',
          timeS: 0,
          timestampLabel: '21 Apr 10:15 UTC',
          actor: 'op-charlie',
          action: 'TRANSEC hop set HOP-SAR2-05 staged to COMSEC store (inactive); SAR-2 keyed at Rotterdam',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '20:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        {
          id: 'evt-pld-thermal',
          timeS: 0,
          timestampLabel: '20:58 UTC',
          actor: 'svc-monitor',
          action: 'SAR-2 telemetry: payload thermal excursion +6 degC above limit; Rotterdam requests PLD-SAFE on the 21:22 GW-01 window',
          category: 'command',
          severity: 'warning',
        },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'S0671'],
      title: 'Read the Brief',
      description: "Open the shift brief: it covers the one command that has to go up tonight, everything they've tried once, and the order in which things can lose a pass.",
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Priority Understood',
          params: {
            character: Character.SYSTEM,
            question: 'What is the single tasking tonight, and what does "highest priority" mean for everything else?',
            options: [
              'PLD-SAFE up on SAR-2 inside 21:22:21-21:31:15. Everything else is ranked by whether it can cost it',
              'A clean pass on SAR-2 with every alarm cleared before AOS; a command on a degraded station is not sent',
              "Both passes, SAR-2 and SAR-1, flown to the normal standard; the thermal excursion is Rotterdam's problem",
              'Protecting the station: if the surge comes, the uplink stays cold and the command goes on the next window',
            ],
            correctIndex: 0,
            explanation:
              "There's one command, one window, and a bird that's warming up. Priority means every other item on the board is ranked by whether it can stop that command going up, and only by that. AOS is twenty-two minutes away.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Read the Dashboard and confirm the active alarm state on GW-01 before the uplink goes anywhere near the air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 90,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Alarm State Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'What is the active alarm state on GW-01 at 21:00?',
            options: [
              'RX AGC on noise only - no carrier on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the pass',
              'Payload thermal alarm - SAR-2 is over limit and the board carries the spacecraft warning',
              "Ephemeris alarm - SAR-2's element set is stale and the pass cannot be predicted",
            ],
            correctIndex: 0,
            explanation:
              "An empty sky isn't a fault. The spacecraft's thermal problem is in the log and on Rotterdam's screen, not on this station's alarm panel, and the element set is still current for another fourteen minutes.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'arm-the-uplink',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Arm the Uplink',
      description:
        "TX modem 1 is on SAR-1's 1405 MHz command IF. Set it to 1435 MHz so the 12600 MHz BUC LO carries SAR-2's 14035 MHz TT&C (telemetry, tracking and command) uplink, and turn on uplink Doppler compensation before anything else happens.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX 1435 MHz',
          params: { modemNumber: 1, frequency: 1435e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-2',
      description: 'Retune RX modem 1 to 1370 MHz, then set the analyzer to a center of 1370 MHz with a 60 MHz span.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['arm-the-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 60 MHz',
          params: { span: 60e6, frequencyTolerance: 5e6 },
          // 60 MHz is the station's default span: the centre row is the action (phase 27 B1)
          requiresChange: false,
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'stage-the-hop-set',
      nice: ['K0925', 'K0645'],
      title: 'Stage the Hop Set',
      description:
        'On the Security console, read the TRANSEC card. TRANSEC is the frequency-hopping protection on the command link. HOP-SAR2-05 is in the store and SAR-2 is keyed at Rotterdam, so leave everything exactly as it is.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Security Console Open',
          params: { tab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Hop Set Staged, Not Loaded',
          params: {
            character: Character.SYSTEM,
            question: "Priya expects the jammer back tonight, and the set is staged at both ends. Why isn't the key loaded yet?",
            options: [
              "A hop set is spent the moment it is used on the air, so it's for a called denial, not a forecast",
              'Because loading it drops the fixed carrier: the modem cannot hold a key and a fixed waveform at the same time',
              "Because Rotterdam hasn't keyed SAR-2 yet: the store entry says staged, and staged means one end only",
              'It should be loaded now: a jammer that is expected is a jammer that is already denying the carrier',
            ],
            correctIndex: 0,
            explanation:
              "A forecast isn't a denial, so the lesson from the last jamming hasn't changed. If they don't jam, the set stays for next time; if they do, you hop on the call with the store one click away. The first command of the pass still goes on the fixed carrier. What's different tonight is that everything else is going to happen at once.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'read-the-surge',
      nice: ['S0648', 'K0741'],
      title: 'Read the Surge',
      description:
        "It's 21:14. The GNSS vs REF delta-T (the time difference between GNSS and the station reference) is walking, the Pass Schedule tab says EPHEMERIS STALE against SAR-2, and Anneke is on the line. Read the delta-T on the GPS Timing tab, then say what's on the board.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['stage-the-hop-set'],
      conditions: [
        {
          type: 'gpsdo-time-offset-exceeds',
          description: 'Delta-T Read Walking on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Board Read',
          params: {
            character: Character.SYSTEM,
            question: "What's on the board at 21:14, and what isn't?",
            options: [
              'A GNSS spoof (delta-T walking, constellation healthy) and a stale element set after the burn. No jamming: the carrier is clear',
              'A GNSS outage, a tracking fault and a jammer - three hardware failures at once, and the station should be declared unavailable',
              "A GNSS spoof only; the ephemeris notice is routine and the jammer is Priya's guess",
              'A jammer on the command carrier; the timing and ephemeris notices are side effects of it',
            ],
            correctIndex: 0,
            explanation:
              "Two things are true and one is only expected. The spoof and the burn are on the panels now, and the jammer is a warning about the future. Deal with what's on the board, in the order it can cost the pass.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'triage',
      nice: ['S0671', 'T1277', 'S0593'],
      title: 'Triage',
      description: 'Read the delta-T on GPS Timing and the stale flag on the Pass Schedule tab, then tell Charlie the order: what first, what second, what waits.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-surge'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'offset-seen',
          type: 'gpsdo-time-offset-exceeds',
          description: 'Delta-T read on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          id: 'ephemeris-seen',
          type: 'tab-active',
          description: 'Pass Schedule read (SAR-2 EPHEMERIS STALE)',
          params: { tab: 'pass-schedule', requiresObservation: true, observationTab: 'pass-schedule' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'The Order',
          params: {
            character: Character.CHARLIE_BROOKS,
            prompt: "That's three things and about eight minutes. I'm not going to tell you the order. What goes first, what goes second, and what waits until there's a reason?",
            evidence: ['offset-seen', 'ephemeris-seen'],
            decisionOptions: [
              {
                label:
                  'Ephemeris first - without it there is no pass to point at. Then holdover: ten seconds, and it stops the timestamps walking. The hop set waits for a called denial inside the window',
                correctWhen: {
                  all: [
                    { fact: 'timing-drifting', is: true },
                    { fact: 'uplink-jammed', is: false },
                  ],
                },
                consequence: { log: 'Triage: ephemeris, then holdover, hop set held for a called denial' },
              },
              {
                label:
                  'Holdover first - the reference walk corrupts everything downstream, including the pass prediction. Then the ephemeris, then load the hop set so the first command goes up hopping',
                feedback:
                  "The reference walk corrupts timestamps, but it doesn't move the bird. The stale element set does. And a hop set loaded before any denial is a hop set spent on a forecast, so the first command goes on the fixed carrier, as it did on the 16th.",
              },
              {
                label: 'Hop set first - the carrier is about to be sat on and the key takes the longest to bring up. Ephemeris and holdover after AOS',
                correctWhen: { fact: 'uplink-jammed', is: true },
                consequence: { log: 'Triage: hop set first with the carrier already denied' },
                feedback:
                  "The carrier is clear and the window is minutes away. Keying the set now spends it on Priya's forecast, and while you're on the Security console the tracker is still pointing where the bird was before it burned.",
              },
              {
                label: 'Stand down - three simultaneous faults is a station that cannot be trusted with a command tonight. Tell Rotterdam PLD-SAFE goes on the next window',
                feedback:
                  "None of the three is a fault on this station: the reference is fine, the tracker is fine, and the uplink is fine. Each is an input being lied to, and each has a ten-second answer. The payload doesn't have a next window.",
              },
            ],
            explanation:
              "Rank by what loses the pass. A stale element set loses it outright, so the update goes first. A walking reference costs the timestamps and pulls every LO a couple of parts per million, tens of kHz inside the Doppler the chain already tracks, so holdover goes second and takes ten seconds. A jammer that isn't on the air yet costs nothing until it is, and the answer to it is one click away when it does.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'load-the-ephemeris',
      nice: ['T1138', 'K1032'],
      title: 'Load the Post-Burn Elements',
      description:
        "On the Pass Schedule tab, the SAR-2 entry reads EPHEMERIS STALE, which means the station's orbit data for it is out of date. Load the update, and the station recomputes the pass so program-track slews to where the bird actually is.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['triage'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'Post-Burn Ephemeris Loaded',
          params: { eventId: 'SAR2-DAM' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Burn Read',
          params: {
            character: Character.SYSTEM,
            question: 'A debris-avoidance burn minutes before a pass you have to command on. What does the pre-burn set get you at AOS?',
            options: [
              'A tracker pointing where the bird would have been, off by about a beamwidth, so the beacon never shows',
              'A late acquisition: the bird arrives a few seconds after the prediction and program-track catches it up on its own',
              'Nothing different: a burn that small moves the pass timing by under a second, so the old set is fine',
              'A wrong azimuth at the horizon, corrected by the step-track layer once the beacon is in the beam',
            ],
            correctIndex: 0,
            explanation:
              "A position error along the orbit becomes a pointing error at LEO range. Program-track doesn't search; it points where the set says. Load the post-burn set and the slew is immediate.",
            pointPenalty: 5,
            documentSection: 'Surge',
            documentLine:
              '21:14Z surge: GNSS vs REF delta-T walking +2 us/s (constellation healthy - spoof, GW-01); SAR-2 debris-avoidance burn 21:14Z, element set stale. Triage: ephemeris first, holdover second, hop set held. Post-burn set loaded from the Pass Schedule inbox.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'go-to-holdover',
      nice: ['S0593', 'K0752'],
      title: 'Stop Trusting GNSS',
      description:
        'On the GPS Timing tab, switch GNSS off to put the reference in holdover. It takes ten seconds, and from then on the reference free-runs on its own oscillator (the OCXO) for the rest of the night. The frozen offset goes in the log.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['load-the-ephemeris'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-reference-mode-set',
          description: 'Reference in Holdover',
          params: { referenceMode: 'holdover' },
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'status-check',
          description: 'Holdover Timed',
          params: {
            character: Character.SYSTEM,
            question: 'Why was holdover second and not first, when the delta-T was the first thing you saw?',
            options: [
              'Because the walk costs timestamps, not the pass; a stale ephemeris costs the acquisition itself',
              'Because the GPSDO needs the post-burn set to compute holdover - the reference and the ephemeris share the same clock',
              "It should have been first: a walking reference makes the ACU's pass prediction wrong too, so every point is off",
              'Because holdover takes longer to engage than an ephemeris load and had to be started while the update was computing',
            ],
            correctIndex: 0,
            explanation:
              'Both faults cost something, but on different clocks. The spoof charges by the second at 2 us/s, so even four minutes is 480 us, under a millisecond. The stale set charges once, and the bill is the pass. When both are on the board, the one that loses the pass goes first.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS is 21:22:01 from azimuth 022, southbound, on the post-burn set. Park the tracker at azimuth 022 and 5 degrees elevation, where SAR-2 will rise.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['go-to-holdover'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 022 / El 5',
          params: { azimuth: 22, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'Turn on program-track for SAR-2 on the post-burn set, and confirm the 1397 MHz beacon on the RX Analysis tab.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-aos'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'chain-up',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Chain Up in Order',
      description: 'The command window opens at 21:22:21. Start the carrier into the muted BUC, unmute the BUC, then enable the HPA. You have two minutes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
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
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'first-command',
      nice: ['T1567', 'K1032'],
      title: 'Housekeeping Dump',
      description:
        'Send HK-DUMP, the housekeeping dump, on the fixed carrier and confirm the ACK. The bird is up, the element set is right and the reference is free-running, so prove the link before the command that matters.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'HK-DUMP Acknowledged',
          params: { commandId: 'HK-DUMP' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Link Proven',
          params: {
            character: Character.SYSTEM,
            question: 'HK-DUMP was acknowledged with the reference in holdover. What did that prove about the holdover?',
            options: [
              'That a free-running OCXO is a perfectly good 10 MHz: Doppler, the modem clock and the BUC LO all held',
              'That the spoofer has stopped: an ACK is only possible once the reference is back under GNSS discipline',
              "Nothing: the ACK came back on the transponded downlink, which doesn't use the station reference",
              'That the holdover error is still under the 40 us spec limit; past it the bird would have refused the frame',
            ],
            correctIndex: 0,
            explanation:
              "The RF chain needs a stable reference, not a true one, and only the timestamps carry the offset. The command went up on a reference that was fed false time for a few minutes and then told to stop listening. That's a dark pass, and it works.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-denial',
      nice: ['S0648', 'K0926', 'K0751'],
      title: 'Call the Denial',
      description:
        "About ten seconds after this opens, the jammer comes up and PLD-SAFE on the fixed carrier comes back NAK: uplink denied. The reference is in holdover, the key is Valid and Doppler is on. Read the console and the reference, then call it, and don't blame the holdover.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-command'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'console-seen',
          type: 'uplink-doppler-comp-enabled',
          description: 'TT&C console read',
          params: { requiresObservation: true, observationTab: 'commanding' },
          mustMaintain: false,
        },
        {
          id: 'reference-seen',
          type: 'gpsdo-reference-mode-set',
          description: 'Reference read on GPS Timing (holdover)',
          params: { referenceMode: 'holdover', requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Why the NAK',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt:
              "PLD-SAFE didn't reach me. Your key is Valid here, your reference is on holdover, and the payload is up to seven degrees over its limit now. We have six minutes of window left. What is it?",
            evidence: ['console-seen', 'reference-seen'],
            decisionOptions: [
              {
                label: 'Uplink denial on the fixed carrier - the jammer is back. Key HOP-SAR2-05 both ends, hop, resend. The reference stays in holdover',
                correctWhen: {
                  all: [
                    { fact: 'uplink-jammed', is: true },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Uplink denial called on the SAR-2 command carrier; HOP-SAR2-05 requested at both ends; reference held in holdover' },
              },
              {
                label: "The holdover reference has drifted the carrier off the bird's receiver - put GNSS back and resend on the fixed carrier",
                correctWhen: { fact: 'uplink-jammed', is: false },
                consequence: { log: 'NAK attributed to the holdover reference; GNSS re-selected under an active spoof' },
                feedback:
                  "HK-DUMP was acknowledged on the same reference earlier in the window, and an OCXO drifts nanoseconds an hour. Putting GNSS back hands the reference to the spoofer again and does nothing for a carrier that's being jammed.",
              },
              {
                label: 'Key problem - Q2b has been on the air since Wednesday. Begin a rotation and resend under the next set',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: { log: 'Command-key rotation begun on a Valid key during a denial' },
                feedback: 'Both ends read Valid and a key rejection is its own reason on the console. A rotation now spends two of your six minutes on nothing.',
              },
              {
                label: 'Stand down - PLD-SAFE goes up on the next window from Shetland',
                feedback:
                  "Shetland has no command key, and the payload is seven degrees over its limit. There isn't a next window for this command. The hop set was staged for exactly this minute.",
              },
            ],
            explanation:
              "Every reason the console could give for itself is clean, and the reference already proved itself on HK-DUMP. The carrier is being denied at the satellite. The holdover isn't the fault; it's the part that is still working.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'go-to-hopping',
      nice: ['K0925', 'T1567', 'S0421'],
      title: 'Go to Hopping',
      description:
        'On the Security console, load the hop-set key HOP-SAR2-05, set the waveform mode to Frequency hopping, and wait for SYNC LOCKED. Anneke keys SAR-2 at her end on the call.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-denial'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'transec-mode-set',
          description: 'Waveform Mode: Frequency Hopping',
          params: { transecMode: 'hopping' },
          mustMaintain: true,
        },
        {
          type: 'transec-sync-locked',
          description: 'Hop-Sync Locked',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Second Set Read',
          params: {
            character: Character.SYSTEM,
            question: 'This is the second hop set called on this carrier in eight days. What does that say about the next commanding pass?',
            options: [
              'That the fixed carrier on 14035 is known and will be denied again: stage HOP-SAR2-06 and expect to hop',
              'That hopping should be the default from AOS on every pass from now on - the sets are cheap compared with a lost window',
              'That the command carrier should move to a new frequency so the fixed waveform can be trusted again',
              'Nothing - each denial is its own event and the sets are consumed one at a time regardless',
            ],
            correctIndex: 0,
            explanation:
              "Two denials on the same carrier are a pattern, not two events. The response is still a called hop, but staged earlier, expected sooner and written into the pre-pass sweep. Hopping from AOS would burn a set on every pass that isn't denied.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'ride-through',
      nice: ['T1277', 'S0424', 'K1032'],
      title: 'Keep the Tasking Alive',
      description: "Resend PLD-SAFE over the hopping link, with the reference in holdover and the tracker on the post-burn set. That's the whole shift in one ACK.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['go-to-hopping'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-SAFE Acknowledged (hopping, holdover, post-burn)',
          params: { commandId: 'PLD-SAFE' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Dark Pass Read',
          params: {
            character: Character.SYSTEM,
            question: 'PLD-SAFE was acknowledged. Three inputs were being lied to or denied at that moment. Which of them did the command depend on?',
            options: [
              "None of them as they were: each had been replaced with something the adversary couldn't touch",
              'The GNSS reference - the command went up on a spoofed clock and the timestamp will have to be corrected',
              'The fixed carrier: the hop set rides on it, so a denied carrier means a denied hop',
              'The pre-burn element set - program-track was still on it and caught the bird by luck',
            ],
            correctIndex: 0,
            explanation:
              "A dark pass is one where every automatic input has been taken away and the pass still happens, because each input was replaced with something the adversary couldn't touch. Here that was a post-burn element set loaded by hand, an oscillator they couldn't reach, and a hop sequence they didn't have. That's what the last eight days were for.",
            pointPenalty: 5,
            documentSection: 'Window',
            documentLine:
              'Window 21:22:21-21:31:15Z: HK-DUMP ACK {{at:cmd:HK-DUMP:ack|21:23}} fixed carrier, reference in holdover. PLD-SAFE NAK {{at:cmd:PLD-SAFE:nak|21:25}} uplink denied (14035 MHz jammed at the spacecraft), key Valid, Doppler on. Called denial; HOP-SAR2-05 keyed both ends, hopping, SYNC LOCKED. PLD-SAFE ACK {{at:cmd:PLD-SAFE:ack|21:27}} under TRANSEC. Payload safed.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'safe-and-debrief',
      nice: ['S0421', 'T1580', 'K0645'],
      title: 'Safe the Uplink and Debrief',
      description:
        "Bring the chain down now; there's no need to wait for LOS at 21:31:35. Switch the HPA off, mute the BUC and turn the carrier off, then log the line about a night when everything they had arrived at once.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['ride-through'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: {},
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
          description: 'Debrief Line',
          params: {
            character: Character.SYSTEM,
            question: 'Which line goes in the log as the debrief?',
            options: [
              'Three inputs lost at once and one command up: ranked by what loses the pass',
              'The station survived a coordinated attack; commanding passes are suspended until the source is found',
              'Everything worked because each fix had been rehearsed once, so there is no change to procedure',
              'The surge proves the report was a mistake, because publishing the method invited the response',
            ],
            correctIndex: 0,
            explanation:
              "Each of the three had been met once, alone, and tonight was the exam: all three, eight minutes, one command. The order is the lesson. The report wasn't a mistake either, because HOP-SAR2-05 was already staged when the surge came.",
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed 21:45Z. Open: spoofer active at close (reference in holdover, probe scheduled 22:30); uplink jammer on 14035 MHz (IR extension); HOP-SAR2-05 spent, HOP-SAR2-06 to be staged before the next window. Debrief: simultaneous faults ranked by what loses the pass - ephemeris, then reference, then a hop on a called denial. PLD-SAFE up {{at:cmd:PLD-SAFE:ack|21:27}}Z; payload safed.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Priya Sharma at {{stationTime}}]</em>
      </p>
      <p>
        "The report went out Thursday with their method in it, and I'd bet they've read it. Anneke needs PLD-SAFE, the command that puts the payload into safe mode, on the 21:22 pass because the payload is overheating. If they come tonight, they'll come with everything at once, since one at a time didn't work. Nothing they've done needs a new answer. It needs the answers in the right order."
      </p>
      `,
      character: Character.PRIYA_SHARMA,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/intro.mp3'),
    },
    objectives: {
      'read-the-surge': {
        text: `
        <p>
          Yes, that's all of it at once. SAR-2 burned at 21:14 to avoid debris, so the post-burn element set is in your Pass Schedule inbox now. Your timestamps started drifting the same minute, and I'd plan for the carrier to be jammed the moment the window opens. It's under eight minutes to AOS, and Charlie wants your order.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-read-the-surge.mp3'),
      },
      triage: {
        text: `
        <p>
          That's the order. The ephemeris goes first, because without it there's no pass to point at. Holdover is second, because it only takes ten seconds. The hop set waits until there's a reason. Go.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-triage.mp3'),
      },
      'first-command': {
        text: `
        <p>
          HK-DUMP is acknowledged, so the link works on the post-burn set and on a reference you aren't trusting. Send PLD-SAFE now.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-first-command.mp3'),
      },
      'call-the-denial': {
        text: `
        <p>
          Agreed, that's a denial. I've keyed SAR-2 to HOP-SAR2-05 at my end, so now load yours, switch to hopping, and put PLD-SAFE through it. The payload's up to seven degrees over its limit.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-call-the-denial.mp3'),
      },
      'ride-through': {
        text: `
        <p>
          PLD-SAFE is acknowledged over the hopping link, so the payload is going into safe mode and its temperature should start to fall. Whatever else they tried tonight, they didn't stop that one. There's nothing more to send, so you can bring the chain down now without waiting for LOS.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-ride-through.mp3'),
      },
      'safe-and-debrief': {
        text: `
        <p>
          They used everything they had, all at once, and the one command that mattered still went up. That wasn't luck. It was eight days of meeting each thing once until the order was obvious. Please stage the next hop set. There's a storm coming Tuesday, and I don't think they're finished.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/23/obj-safe-and-debrief.mp3'),
      },
    },
  },
};
