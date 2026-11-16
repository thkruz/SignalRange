import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, createMeridianSar3, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 24 - "North Atlantic Storm" / Campaign Capstone (Gray Zone arc 8/8)
 *
 * Tuesday, 03:00, an Atlantic low over Galway and the operator is incident
 * commander for the network: two stations, three birds, one hour. The rain
 * band is on GW-01 at 03:01 and sleet follows at 03:40; SAR-1 has to be
 * collected from Galway in the lull at 03:20 with the terrestrial carrier
 * back in its band; SAR-2 burns at 03:15 and has to be collected from Shetland
 * at 03:31 on the post-burn set, with the spoofer on Shetland's reference
 * this time and Galway as the clean cross-check; and SAR-3's commanding pass
 * at 03:52 goes up through the sleet on a heated feed, gets its first ACK, and
 * is denied on the second - the call, the hop, and PLD-SAFE through the
 * jamming. Then the network is safed and the incident log closes the arc.
 *
 * Every mechanic of the campaign, once, in the order the network needs it:
 * contact plan (M3), weather and feed heater (S14), terrestrial interference
 * and the notch (S17/S18), ephemeris update (S7/S23), GNSS spoof and holdover
 * (S20), commanding with Doppler and key (S3/S4), TRANSEC ride-through
 * (S19/S23), the incident record (S22). Two decisions: the denial call on
 * SAR-3, and none of the others - by now the calls are procedure. The
 * capstone grades whether the procedure survives all of it at once.
 *
 * Clock starts 2027-04-27 03:00:00 UTC. Passes (0 deg horizon,
 * scripts/author-passes.mjs, epoch 03:00:00Z):
 *
 *   MERIDIAN-SAR-1 @ GW-01: AOS T+19.98 (03:19:58Z, az 005), max el 30.2 deg at T+24.74
 *                           (03:24:44Z, 714 km), LOS T+29.47 (03:29:28Z, az 217), southbound.
 *                           NMW collect, in the lull between the rain band and the sleet.
 *   MERIDIAN-SAR-2 @ SH-02: AOS T+31.02 (03:31:01Z, az 139), max el 35.1 deg at T+35.99
 *                           (03:35:59Z, 688 km), LOS T+41.02 (03:41:01Z, az 347), northbound.
 *                           NMW collect on the post-burn set.
 *   MERIDIAN-SAR-3 @ GW-01: AOS T+52.01 (03:52:00Z, az 023), max el 28.4 deg at T+56.81
 *                           (03:56:49Z, 754 km), LOS T+61.59 (04:01:35Z, az 173), southbound.
 *                           Commanding; window 03:52:21 .. 04:01:15 (T+3141 .. T+3675).
 *
 * On the mission clock:
 *   T+60    (03:01) severe rain on GW-01, 30 mm/h, to 03:16.
 *   T+900   (03:15) SAR-2 conjunction-avoidance burn; station set stale (initialTle).
 *   T+1290  (03:21:30) terrestrial carrier 11690 MHz (1410 IF) in SAR-1's band at Galway,
 *           60 s on / 30 s off, to 03:28:30.
 *   T+1500  (03:25) GNSS spoof on SH-02, 2 us/s, to the end. GW-01 is clean.
 *   T+2400  (03:40) sleet on GW-01 to 04:10 - feed heater before it.
 *   T+3300  (03:55) transponder-path jammer on SAR-3's 14065 MHz command carrier, to 04:01:40.
 *
 * Staged state (scenario-local clones): GW-01 TX modem 1 on 1405 MHz (retune to
 * 1465 for SAR-3), RX modem 1 on 1414 (SAR-1; later 1340 for SAR-3), BUC muted.
 * SH-02 RX modem 1 on 1414 (retune to 1370 for SAR-2). HOP-SAR3-01 staged.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0807: Skill in managing multiple simultaneous operations
 *   - T1606: Report incidents to stakeholders
 *   - T0531: Coordinate contingency operations across sites
 *
 * Supporting Codes:
 *   - S0671: Skill in prioritizing tasks under contingency conditions
 *   - T1277: Perform contingency operations
 *   - S0593: Skill in handling incidents
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - K0752: Knowledge of system vulnerabilities
 *   - K0925: Knowledge of wireless technologies and their security
 *   - T1138: Update ephemeris / orbital data
 *   - K0689: Knowledge of contact scheduling
 *   - T0129: Coordinate contact plans across stations
 *   - S0421: Skill in operating communications equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K0645: Knowledge of standard operating procedures
 *   - K0741: Knowledge of alarm states and their meaning
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Monitor timing reference systems
 *   - K0737: Knowledge of filtering and interference mitigation
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-1 (61701) at the S24 epoch: the 30 deg Galway collect, southbound from az 005. */
const SAR1_S24_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27117.12500000  .00001000  00000-0  10000-3 0  9991' as TleLine1,
  tle2: '2 61701  97.2000  58.2500 0010000  90.0000 298.0000 15.61320000123457' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S24 epoch, post-burn: the 35 deg Shetland collect, northbound from az 139. */
const SAR2_S24_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27117.12500000  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61702  98.0000 292.0000 0010000  90.0000 193.5000 15.51040000123457' as TleLine2,
};

/** The pre-burn set the station is still predicting from at 03:00 (mean anomaly -0.03 deg). */
const SAR2_S24_PRE_BURN_TLE2 = '2 61702  98.0000 292.0000 0010000  90.0000 193.4700 15.51040000123457';

/** MERIDIAN-SAR-3 (61703) at the S24 epoch: the 28 deg Galway commanding pass, southbound from az 023. */
const SAR3_S24_TLE: MeridianTle = {
  tle1: '1 61703U 27031A   27117.12500000  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61703  98.0000  83.7500 0010000  90.0000 175.7500 15.59860000123453' as TleLine2,
};

const meridianSar1S24 = createMeridianSar1(SAR1_S24_TLE);
const meridianSar2S24 = createMeridianSar2(SAR2_S24_TLE);
const meridianSar3S24 = createMeridianSar3(SAR3_S24_TLE);

/** GW-01 as the evening left it: RX on SAR-1's video IF, TX on SAR-1's command IF, BUC muted. Deep clone, never spread. */
const galwayStorm: GroundStationConfig = structuredClone(galwayGroundStation);
galwayStorm.receivers![0].modems![0] = {
  ...galwayStorm.receivers![0].modems![0],
  frequency: 1414 as MHz,
};
galwayStorm.rfFrontEnds[0].buc = { ...galwayStorm.rfFrontEnds[0].buc, isMuted: true };

/** SH-02 as the evening left it: RX on SAR-1's video IF. Deep clone, never spread. */
const shetlandStorm: GroundStationConfig = structuredClone(shetlandGroundStation);
shetlandStorm.receivers![0].modems![0] = {
  ...shetlandStorm.receivers![0].modems![0],
  frequency: 1414 as MHz,
};

export const natsEuScenario24Data: ScenarioData = {
  id: 'nats-eu-scenario24',
  url: 'nats-eu/scenarios/nats-eu-scenario24',
  imageUrl: 'nats-eu/24/card.png',
  number: 24,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario23'],
  title: 'North Atlantic Storm',
  subtitle: 'Campaign Capstone (Gray Zone 8/8)',
  duration: '60 min',
  missionType: 'Security Operations',
  description: `It's 03:00 at Galway on a Tuesday, and an Atlantic low is on the coast: rain now, sleet by 03:40. You have three satellites in an hour across both stations. Galway collects SAR-1 in the lull, Shetland collects SAR-2 on an orbit set that's about to change, and Galway commands SAR-3 through the sleet. Charlie's on the phone, and you're incident commander for the network.<br><br>Anything they've done in the last two weeks, they can do again tonight. Anything you've done, you can do again too. Start with the plan.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker with feed heater',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front Ends (13100 MHz LNB LO, 12600 MHz BUC LO) + HPA at Galway',
    'GPS-disciplined 10 MHz references (GPS Timing panels, both sites)',
    'Contact Plan (both sites), Pass Schedule with ephemeris inbox',
    'TT&C Commanding Console with TRANSEC waveform (Security console)',
    'Spectrum Analyzers with IF notch filters',
    'QPSK 3/4 RX Modems with Video Decoders',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayStorm, shetlandStorm],
    satellites: [meridianSar1S24, meridianSar2S24, meridianSar3S24],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-27',
    scenarioStartWallTime: '03:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-24?content-only=true&dark=true',

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
      title: 'Incident Log IL-2027-0427-NATS-EU',
      description: 'The network on the night of 27 April: three passes, two sites, everything at once - and the handover that closes the record.',
    },

    // S14 - the low. A rain band on Galway for the first quarter hour, a lull
    // for the SAR-1 collect, sleet from 03:40 through the SAR-3 window.
    weatherEvents: [
      { id: 'gw-rain-band', groundStationId: 'GW-01', type: 'rain', severity: 'severe', startTime: 60, duration: 900, linkMarginDegradation: 7, rainRateMmPerHour: 30 },
      { id: 'gw-sleet', groundStationId: 'GW-01', type: 'hail', severity: 'severe', startTime: 2400, duration: 1800, linkMarginDegradation: 10 },
    ],

    // M3 - three contacts, two sites. Every P1 must be assigned for the plan
    // to validate; SAR-1 and SAR-3 can only be flown from Galway tonight,
    // SAR-2 only from Shetland.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 1,
      contacts: [
        { id: 'C-SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 30 deg) - NMW collect', priority: 1, windowStartS: 1199, windowEndS: 1768, stationId: 'GW-01' },
        {
          id: 'C-SAR2-SH',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Shetland, 35 deg) - NMW collect',
          priority: 1,
          windowStartS: 1861,
          windowEndS: 2461,
          stationId: 'SH-02',
        },
        {
          id: 'C-SAR3-GW',
          satelliteNoradId: 61703,
          label: 'MERIDIAN-SAR-3 (Galway, 28 deg) - command contact',
          priority: 1,
          windowStartS: 3121,
          windowEndS: 3695,
          stationId: 'GW-01',
        },
      ],
    },

    // M4 - the burn. SAR-2 moves onto the post-burn set at 03:15; the station
    // predicts from the pre-burn set until the update is loaded.
    spaceEvents: [
      {
        id: 'SAR2-CAM2',
        satelliteNoradId: 61702,
        maneuverAtS: 900,
        label: 'MERIDIAN-SAR-2 conjunction-avoidance manoeuvre executed 03:15Z; post-burn element set issued',
        newTle: { tle1: SAR2_S24_TLE.tle1 as string, tle2: SAR2_S24_TLE.tle2 as string },
        initialTle: { tle1: SAR2_S24_TLE.tle1 as string, tle2: SAR2_S24_PRE_BURN_TLE2 },
      },
    ],

    // M8 - the spoofer, on Shetland this time. Galway reads +0.0.
    gnssThreat: {
      groundStationIds: ['SH-02'],
      spoofStartS: 1500,
      offsetDriftUsPerS: 2,
    },

    // M2/M5 - the SAR-3 commanding pass at Galway, coupled to the jammer below.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61703,
      windowStartS: 3141,
      windowEndS: 3675,
      requireDopplerComp: true,
      requireValidKey: true,
      uplinkFrequencyHz: 14065e6,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'PLD-STATUS', label: 'Payload status request' },
      ],
    },

    // M7 - HOP-SAR3-01, staged since Sunday.
    transec: {
      groundStationId: 'GW-01',
      hopChannelsHz: [14061e6, 14063e6, 14065e6, 14067e6, 14069e6],
      requireKey: true,
    },

    // The adversary: the terrestrial carrier in SAR-1's band during the
    // Galway collect, and the jammer on SAR-3's command carrier in the window.
    interferenceEvents: [
      {
        id: 'gw-carrier-sar1',
        frequency: 11690e6,
        bandwidth: 1e6,
        power: 60,
        polarization: 'V',
        startTime: 1290,
        duration: 420,
        periodSeconds: 90,
        onSeconds: 60,
        path: 'terrestrial',
        emitter: { latitude: 53.12, longitude: -9.32 },
      },
      {
        id: 'sar3-uplink-jam',
        satelliteNoradId: 61703,
        frequency: 14065e6,
        bandwidth: 2e6,
        power: 76, // jammer EIRP, dBm: drives the telecommand transponder ~3 dB past saturation from a 740 km slant (phase 19.3; was 5 dBm at the input)
        polarization: 'H',
        // Phase 19.0a: keyed when 'call-the-denial' opens, not at a fixed 3300 s.
        // A player whose first command was still unsent when a fixed jam came up
        // was refused on the fixed carrier before hopping was taught: a deadlock.
        // Before it, the sleet made "rain fade" the graded answer.
        // Pre-audit 4: up from the moment the objective opens (was +10 s), so a decision answered at once is still graded against a jammed uplink
        startAfterObjectiveId: 'call-the-denial',
        startTime: 0,
        duration: 400,
        periodSeconds: 400,
        onSeconds: 400,
      },
    ],

    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you) - incident commander', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'kg-01', name: 'KG-01 command crypto unit', role: 'Equipment', status: 'active' },
      ],
      events: [
        {
          id: 'evt-storm-warning',
          timeS: 0,
          timestampLabel: '26 Apr 18:00 UTC',
          actor: 'op-charlie',
          action: 'Met Eireann orange warning: Atlantic low, heavy rain from 03:00 for about a quarter of an hour, sleet from 03:40, west coast',
          category: 'config',
          severity: 'warning',
        },
        {
          id: 'evt-hopset-sar3-staged',
          timeS: 0,
          timestampLabel: '25 Apr 10:20 UTC',
          actor: 'op-charlie',
          action: 'TRANSEC hop set HOP-SAR3-01 staged to COMSEC store (inactive); SAR-3 keyed at Rotterdam',
          category: 'command',
          severity: 'info',
        },
        {
          id: 'evt-login-duty',
          timeS: 0,
          timestampLabel: '02:55 UTC',
          actor: 'op-duty',
          action: 'Console login (incident commander, network)',
          category: 'auth',
          severity: 'info',
        },
        {
          id: 'evt-sh-skew',
          timeS: 1620,
          timestampLabel: '03:27 UTC',
          actor: 'svc-monitor',
          action: 'SH-02 frame timestamps +240 us ahead of Rotterdam reference and increasing; GW-01 in line',
          category: 'config',
          severity: 'warning',
          isAnomaly: true,
        },
      ],
    },
  },
  objectives: [
    {
      id: 'take-command',
      nice: ['S0807', 'K0645'],
      title: 'Take Command',
      description: 'Open the brief: the low, three satellites in an hour across two sites, and the one thing an incident commander does before touching anything.',
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
          description: 'First Act',
          params: {
            character: Character.SYSTEM,
            question: 'Three passes, two sites, a storm and an adversary. What does the incident commander do first?',
            options: [
              'The plan: which satellite flies from which site, and in what order',
              'The uplink: SAR-3 is the only command contact, so its key gets checked before anything else',
              'The weather: heater on at Galway now, so the whole hour is flown on a dry feed',
              'The adversary: load the hop set and take both references to holdover, so nothing they try works',
            ],
            correctIndex: 0,
            explanation:
              "The plan is what everything else depends on, and it's the one thing that can be wrong for the whole hour at once. The heater goes on before the sleet, not the rain. The hop set is saved for a called denial. The references are trusted until one lies. SAR-1 rises in about twenty minutes.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'plan-the-network',
      nice: ['K0689', 'T0129', 'S0807'],
      title: 'Plan the Network',
      description:
        "Open the Contact Plan and assign SAR-1 and SAR-3 to Galway and SAR-2 to Shetland. That's three P1 contacts with no overlaps, and the plan should read DECONFLICTED.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['take-command'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Contact Plan Open',
          params: { tab: 'contact-schedule' },
          mustMaintain: false,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-1 Collect on GW-01',
          params: { contactId: 'C-SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Collect on SH-02',
          params: { contactId: 'C-SAR2-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-3 Command Contact on GW-01',
          params: { contactId: 'C-SAR3-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Plan Reasoned',
          params: {
            character: Character.SYSTEM,
            question: "Why does SAR-2 go to Shetland when Galway is the incident commander's own console?",
            options: [
              'Because Shetland has SAR-2 at 35.1 degrees, and Galway already has two contacts',
              'Because Shetland has no command key, so it must take every receive-only contact and leave Galway free to command',
              'Because the spoofer is expected on Galway, and a collect flown from Shetland is safe from it',
              'It should not: the commander flies every pass from the console in front of them, and Shetland is only a backup',
            ],
            correctIndex: 0,
            explanation:
              "Two sites work as one network when the plan says which window belongs to which site. Galway has two contacts and the weather, and Shetland has one contact and clear sky. The adversary isn't part of the plan yet. The plan is geometry and weather, and it has to be right before anything else happens.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'galway-dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Storm Sweep',
      description: 'Read the board at Galway with the rain band arriving, and confirm the active alarm state before the first pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['plan-the-network'],
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
            question: 'What is the active alarm state on GW-01 right now?',
            options: [
              'RX AGC on noise only: no carrier on an empty sky, no hardware alarm',
              'No active alarms: all systems are nominal, and the board is clear for the pass',
              'Rain fade alarm: the receive chain has lost margin, so the SAR-1 collect should move to Shetland',
              'Feed heater alarm: the heater is off in precipitation, and the board wants it on',
            ],
            correctIndex: 0,
            explanation:
              "That's an empty sky, not a fault. Thirty millimetres an hour shows on the ACU weather panel, and the rain ends before SAR-1 rises. Rain is weather, not a fault on the chain. The heater is for the sleet at 03:40, and the board doesn't nag about it.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'galway-rx-ready',
      nice: ['S0421', 'K0773'],
      title: 'Galway Ready for SAR-1',
      description:
        'Set RX modem 1 to 1414 MHz, and center the analyzer on 1414 MHz with a 60 MHz span. The carrier that showed up on the 14th will be in this band if it comes back.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-dashboard-sweep'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          // Staged on 1414 already: a confirm row (phase 27 B1)
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1414 MHz',
          params: { centerFrequency: 1414e6, centerFrequencyTolerance: 100e3 },
          // Staged on 1414 already: a confirm row (phase 27 B1)
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 60 MHz',
          params: { span: 60e6, frequencyTolerance: 5e6 },
          // The station default frame (1414 / 60 MHz): a confirm row (phase 27 B1)
          requiresChange: false,
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-baseline',
      nice: ['T0431', 'S0421'],
      title: 'Shetland Baseline',
      description:
        'Select SH-02 and check GPS Timing: locked, GNSS tracking, delta-T at zero. Then retune its RX modem 1 to 1370 MHz for SAR-2. Note the reference now, because it matters at 03:25.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['galway-rx-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-locked',
          description: 'SH-02 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-gnss-locked',
          description: 'SH-02 GNSS Tracking (4+ satellites)',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-sar1-in-the-lull',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-1 in the Lull',
      description: 'Back to GW-01. The rain band clears at 03:16, and SAR-1 rises at 03:19:58 from azimuth 005. Program-track it and confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['shetland-baseline'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-1',
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
      points: 15,
    },
    {
      id: 'notch-the-carrier',
      nice: ['K0737', 'S0593', 'T0153'],
      title: 'Notch the Carrier',
      description:
        "From 03:21:30 the carrier is back at 1410 MHz IF, inside SAR-1's band, on the same on-off cadence as the 14th. Set notch 1 to 1410 MHz, 2 MHz wide and 30 dB deep, and hold C/N above 7 dB through the high part of the pass.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1-in-the-lull'],
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch at 1410 MHz IF on the Carrier',
          params: {
            notchCenterFrequency: 1410,
            notchCenterFrequencyTolerance: 1,
            notchBandwidth: 2,
            notchBandwidthTolerance: 1,
            notchDepth: 30,
            notchDepthTolerance: 10,
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 7 dB',
          params: { modemNumber: 1, minCNRatio: 7, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          // Pre-audit 21: the carrier is up from 03:21:30 and has shown one full on/off cycle by 03:23, so the quiz never asks about a cadence the player has not seen
          type: 'scenario-time-reached',
          hidden: true,
          description: 'Carrier Cycle Observed',
          params: { scenarioTime: '03:23:00' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Carrier Read',
          params: {
            character: Character.SYSTEM,
            question: 'The carrier has the same frequency, cadence and bearing as the 14th. What is different tonight about how it is handled?',
            options: [
              'Nothing in the handling: notch it, keep the collect, and log it on the open incident report',
              "It's escalated immediately: a third appearance of the same emitter is a criminal matter, so the collect stops",
              "The collect moves to Shetland: a known interferer in the band means Galway can't be trusted for SAR-1",
              "The notch isn't applied: with the rain gone the margin is enough, and a notch costs signal",
            ],
            correctIndex: 0,
            explanation:
              "A known event gets its known answer and no more of the commander's attention than that. It's one of four things happening tonight, and it's the one the plan already answers. The collect is being delivered, the incident report gets a line, and the console is free for the problems that don't have an answer yet.",
            pointPenalty: 5,
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
      description: 'SAR-2 burned at 03:15, so the Pass Schedule tab has read EPHEMERIS STALE since. Load the update before SAR-2 rises at Shetland at 03:31.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['notch-the-carrier'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'SAR-2 Post-Burn Ephemeris Loaded',
          params: { eventId: 'SAR2-CAM2' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'shetland-spot-the-walk',
      nice: ['S0648', 'T0431'],
      title: 'Shetland: Spot the Walk',
      description:
        "From 03:25 Rotterdam sees Shetland's timestamps drifting. Select SH-02 and read its delta-T (the gap between GNSS time and the reference) on GPS Timing, then compare it with Galway, which is the cross-check tonight.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['load-the-ephemeris'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-time-offset-exceeds',
          description: 'SH-02 Delta-T Read Walking on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Roles Reversed',
          params: {
            character: Character.SYSTEM,
            question: "Shetland's delta-T is walking, Galway reads zero, and both GNSS constellations are healthy. What is it, and where?",
            options: [
              "A GNSS spoof, local to Shetland: Galway's zero proves it's local",
              'A GNSS spoof on both sites: the walk starts at Shetland, and Galway will follow inside a minute',
              'A Shetland GPSDO fault: Fiona should power-cycle the unit before the SAR-2 pass',
              "A Rotterdam reference problem: two stations can't both be wrong, so the comparison is wrong",
            ],
            correctIndex: 0,
            explanation:
              "Two receivers have two skies, and one of them is being lied to. It's the same signature as the 19th with the sites swapped, and tonight the cross-check is read from Galway. Take Shetland to holdover and fly SAR-2 on the oscillator, and Galway keeps GNSS because Galway is honest.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-holdover',
      nice: ['S0593', 'K0752'],
      title: 'Shetland: Stop Trusting GNSS',
      description: "On SH-02's GPS Timing, switch GNSS off so the Shetland reference runs on its own oscillator (holdover) through the SAR-2 collect. Galway stays on GNSS.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-spot-the-walk'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-reference-mode-set',
          description: 'SH-02 Reference in Holdover',
          params: { referenceMode: 'holdover' },
          mustMaintain: true,
          maintainDuration: 20,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-sar2-from-shetland',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-2 from Shetland',
      description: 'SAR-2 rises at 03:31:01 from azimuth 139 at Shetland, heading north, on the post-burn set. Program-track it and confirm the beacon on RX analysis.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-holdover'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-2',
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
      id: 'decode-the-collect',
      nice: ['T0153', 'K0740'],
      title: 'Decode the Collect',
      description: "Lock SH-02's RX modem on SAR-2, hold C/N above 8 dB through the high part of the pass, and keep the reference in holdover. Hold the collect to LOS.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'SH-02 Selected',
          params: { groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Collect Logged',
          params: {
            character: Character.SYSTEM,
            question: 'Which line goes in the incident log for the first half hour?',
            options: [
              '03:01-03:16 rain band GW-01; 03:15 SAR-2 burn; 03:25 spoof on SH-02, holdover. SAR-1 delivered, SAR-2 in progress',
              'Half an hour of attacks on both sites, with both collects at risk, and the incident escalated to Rotterdam for a decision',
              'Rain, a burn, a jammer and a spoof, all handled, so there is nothing to report to the customer or the day shift',
              'SAR-1 and SAR-2 collected as planned, with the weather and interference noted in passing and no actions listed',
            ],
            correctIndex: 0,
            explanation:
              'A log line gives times, sites, what happened, what was done and what was delivered. The first half hour is written before the half that matters most, because a commander who writes as they go is the one who can hand over.',
            pointPenalty: 5,
            documentSection: 'Incident Log',
            documentLine:
              '03:01-03:16Z rain band GW-01 (30 mm/h). 03:15Z SAR-2 conjunction-avoidance burn; post-burn set loaded {{at:obj:load-the-ephemeris|03:25}}Z. 03:20-03:29Z SAR-1 NMW collect GW-01 under terrestrial carrier 11690 MHz (1410 IF), notch 1410/2/30, C/N > 7 dB - delivered. 03:25Z GNSS spoof on SH-02 reference (+2 us/s), GW-01 clean; SH-02 to holdover {{at:obj:shetland-holdover|03:27}}Z. 03:31Z SAR-2 NMW collect SH-02 on the oscillator, collecting to LOS 03:41Z.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'protect-the-feed',
      nice: ['S0421', 'T0431'],
      title: 'Protect the Feed',
      description: 'Back to GW-01. Sleet is due from 03:40, and SAR-3 rises at 03:52. Switch the feed heater on now, because ice that forms on the feed takes minutes to melt.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-the-collect'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'feed-heater-enabled',
          description: 'GW-01 Feed Heater Enabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Heater Timing',
          params: {
            character: Character.SYSTEM,
            question: "Why wasn't the heater switched on at 03:00 with the rain, when it costs nothing to run?",
            options: [
              "Rain doesn't stick, and sleet does, so the heater is timed to go on before the sleet",
              "It should have been: the commander's first act was the plan, and the heater is part of the plan",
              'Because a heated feed adds noise temperature, and the SAR-1 collect needed every tenth of a decibel in the rain',
              "Because the heater draws from the same supply as the HPA, and can't run during a commanding pass",
            ],
            correctIndex: 0,
            explanation:
              "Ice that has formed takes minutes to melt, and the pass won't wait, so the heater goes on before the sleet. The log now shows it on at {{at:cond:protect-the-feed.1|03:36}}, against sleet from 03:40. Switching it on at 03:00 would have been harmless, but the log wouldn't show that you knew when the sleet was coming.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'arm-galway-for-sar3',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Arm Galway for SAR-3',
      description:
        "Set TX modem 1 to 1465 MHz, which the BUC with its 12600 MHz LO converts to the 14065 MHz TT&C uplink, and turn on uplink Doppler compensation. Set RX modem 1 to 1340 MHz for SAR-3's 11760 MHz video.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['protect-the-feed'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'GW-01 TX 1465 MHz',
          params: { modemNumber: 1, frequency: 1465e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1340 MHz',
          params: { modemNumber: 1, frequency: 1340e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-sar3',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-3 Through the Sleet',
      description:
        'SAR-3 rises at 03:52:00 from azimuth 023. Program-track it on the heated feed, center the analyzer on the 1315 MHz beacon with a 2 MHz span, and confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['arm-galway-for-sar3'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-3',
          params: { noradId: 61703 },
          mustMaintain: false,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1315 MHz',
          params: { centerFrequency: 1315e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-3 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-3-Beacon',
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
      id: 'chain-up-and-command',
      nice: ['S0675', 'T1567', 'K1032'],
      title: 'Chain Up and Command',
      description:
        'The window opens at 03:52:21. Bring the carrier up into the muted BUC, unmute it, enable the HPA, and send HK-DUMP on the fixed carrier. You want one clean ACK before the one that matters.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar3'],
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
        {
          type: 'command-acknowledged',
          description: 'HK-DUMP Acknowledged',
          params: { commandId: 'HK-DUMP' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'call-the-denial',
      nice: ['S0648', 'K0926', 'K0751'],
      title: 'Call the Denial',
      description:
        "Send PLD-SAFE. Shortly after the HK-DUMP ACK the uplink is denied, and PLD-SAFE comes back NAK. Read the console and the key, then call it. You've done this twice before, and tonight you do it in sleet with two other things on the board.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up-and-command'],
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
          id: 'key-seen',
          type: 'tx-key-status',
          description: 'Command key read on TX Chain',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Why the NAK',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt:
              "SAR-3 isn't taking your uplink. The key reads Valid at my end, and the window's open until 04:01. I can see Shetland on holdover and Galway in sleet on my screen. What is it?",
            evidence: ['console-seen', 'key-seen'],
            decisionOptions: [
              {
                label: 'Uplink denial on the fixed carrier - key HOP-SAR3-01 both ends, hop, resend. The sleet and Shetland have nothing to do with it',
                correctWhen: {
                  all: [
                    { fact: 'uplink-jammed', is: true },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Uplink denial called on the SAR-3 command carrier; HOP-SAR3-01 requested at both ends' },
              },
              {
                label: "Rain fade on the uplink - the sleet is taking the carrier below the bird's threshold. Raise HPA back-off and resend",
                correctWhen: { fact: 'weather-attenuation-dominant', is: true },
                consequence: { log: 'NAK attributed to weather on the uplink' },
                feedback: `HK-DUMP was ACKed in the same sleet on the same power. Uplink fade at 28 degrees in sleet is a decibel or two, and the console's NAK reason isn't "weak", it's "jammed".`,
              },
              {
                label: 'Key problem - the SAR-3 key has never been used under TRANSEC. Begin a rotation and resend',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: { log: 'Command-key rotation begun on a Valid key during a denial' },
                feedback: "Both ends read Valid, and a key rejection has its own reason on the console. That's minutes gone, and the window closes at 04:01.",
              },
              {
                label: 'Stand down - the network has delivered two collects and the third bird can be commanded tomorrow',
                feedback: 'The payload command is the P1 contact on the plan you wrote at the start. The hop set was staged for this minute.',
              },
            ],
            explanation:
              "Every reason the console can give for itself is clean. Weather shows up in the downlink margin, the uplink has power to spare, and the bird still isn't hearing you. That's the same call as the 16th and the 24th. The point of the capstone is that it's the same call.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'hop-and-deliver',
      nice: ['K0925', 'T1277', 'S0424'],
      title: 'Hop and Deliver',
      description:
        'On the Security console, load the hop-set key HOP-SAR3-01, set the waveform to frequency hopping, and wait for SYNC LOCKED. Then send PLD-SAFE under TRANSEC through the sleet, on a heated feed, with one reference in holdover.',
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
          type: 'command-acknowledged',
          description: 'PLD-SAFE Acknowledged (hopping)',
          params: { commandId: 'PLD-SAFE' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'safe-the-network',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Network',
      description:
        "Chain down now; there's no need to wait for LOS at 04:01:35. At Galway, turn the HPA off, mute the BUC and take the carrier off air. Shetland stays in holdover until a probe says its sky is honest.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hop-and-deliver'],
      timeLimitSeconds: 2 * 60,
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
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'incident-log-and-handover',
      nice: ['T1606', 'T1580', 'S0807'],
      title: 'Incident Log and Handover',
      description: "The second half of the hour goes in the log. Then write the handover: what's still open, what's staged, and what the day shift walks into.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['safe-the-network'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Second Half Logged',
          params: {
            character: Character.SYSTEM,
            question: 'Which line goes in the incident log for the second half hour?',
            options: [
              '{{at:cond:protect-the-feed.1|03:36}} GW-01 heater on; sleet from 03:40. SAR-3 uplink denied, hop set keyed, PLD-SAFE ACKed. Three contacts delivered',
              "SAR-3 commanded through jamming and sleet, and the adversary's most aggressive night yet was defeated by the incident commander, so the day shift can relax",
              'SAR-3 pass completed with one anomaly; the hop set was used and there was no customer impact, so nothing more is needed in the log',
              'SAR-3 command contact: PLD-SAFE was delayed by interference and sent on the second attempt, with the cause not established in the log',
            ],
            correctIndex: 0,
            explanation:
              'A log line gives times, what came back, what was done and what was delivered, the same as every night since the 13th. "Defeated" is a mood, "no customer impact" hides the denial, and "delayed by interference" hides the NAK reason. "Three contacts delivered" is the sentence the board reads.',
            pointPenalty: 5,
            documentSection: 'Incident Log',
            documentLine:
              '{{at:cond:protect-the-feed.1|03:36}}Z GW-01 feed heater on; sleet 03:40-04:10Z. 03:52Z SAR-3 acquired GW-01 through sleet; HK-DUMP ACK {{at:cmd:HK-DUMP:ack|03:53}}Z fixed carrier. Uplink denied - carrier jammed (14065 MHz at the spacecraft), key Valid, Doppler on; called denial; HOP-SAR3-01 keyed both ends, hopping, SYNC LOCKED; PLD-SAFE ACK {{at:cmd:PLD-SAFE:ack|03:57}}Z under TRANSEC. Chain safed {{at:obj:safe-the-network|04:00}}Z. Three P1 contacts delivered.',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Handover Written',
          params: {
            character: Character.SYSTEM,
            question: 'What is the handover line?',
            options: [
              "Open: SH-02 reference in holdover (probe at 04:30), jammer on 14065, carrier's third appearance, HOP-SAR3-01 spent",
              'Open: everything. The network was under sustained attack, and the day shift should expect the same tonight and tomorrow',
              'Open: nothing. Three contacts were delivered, all anomalies are resolved, and the station is nominal for the day shift',
              "Open: the adversary. Until the source is located the network can't be considered secure, and commanding should be suspended",
            ],
            correctIndex: 0,
            explanation:
              "A handover lists what's still true and what's staged for it. Two weeks ago every one of these would have been a first. Tonight they were all procedure, done in the order the network needed, with a storm on top. That's the campaign.",
            pointPenalty: 5,
            documentSection: 'Handover',
            documentLine:
              'Handover {{stationTime}}Z. Open: SH-02 reference in holdover (spoofer active at close; probe scheduled 04:30Z); uplink jammer on 14065 MHz and terrestrial carrier 11690 MHz (IR-2027-0414-GW01 extended, third appearance); HOP-SAR3-01 spent, HOP-SAR3-02 to be staged before the next SAR-3 window. Delivered: SAR-1 (GW-01), SAR-2 (SH-02), SAR-3 command contact incl. PLD-SAFE (GW-01). No procedure change: every event had one, and they held together.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Charlie Brooks at 02:40]</em>
      </p>
      <p>
        "Orange warning on the coast, three birds in an hour, and you're incident commander for the network tonight. Fiona's on SH-02, Anneke's on the constellation, and I'm on the phone. Plan first. Assume they do everything they've done to us in two weeks again, all at once, in the sleet. You can do everything you've done again too."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/intro.mp3'),
    },
    objectives: {
      'plan-the-network': {
        text: `
        <p>
          That's the plan I'd have written. SAR-1 and SAR-3 go from Galway, and SAR-2 goes from Shetland with Fiona on site. Now go and see what the weather's done to my station.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-plan-the-network.mp3'),
      },
      'notch-the-carrier': {
        text: `
        <p>
          It's Fiona. Your carrier shows on my analyzer too, faintly, on the same bearing as the 14th, so it's coming from the Galway side. My band's clean, for now.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-notch-the-carrier.mp3'),
      },
      'load-the-ephemeris': {
        text: `
        <p>
          Post-burn set loaded on both stations, thank you. SAR-2 will rise at Shetland where the new set says, not where the old one said it would. Shetland has the pass next, and Fiona's on site with you.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-load-the-ephemeris.mp3'),
      },
      'shetland-spot-the-walk': {
        text: `
        <p>
          It's on my side this time. My delta-T is walking even though the receiver says GOOD with nine satellites, and Galway reads zero. I spent a week blaming that flaky GNSS antenna, and tonight it's working perfectly, which is the problem. Take Shetland off GNSS and we'll fly the pass on the oscillator.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-shetland-spot-the-walk.mp3'),
      },
      'decode-the-collect': {
        text: `
        <p>
          SAR-2's frames from Shetland are clean, and the timestamps carry the offset Shetland froze at holdover, exactly as logged. That's SAR-1 delivered and SAR-2 nearly there. SAR-3 is next, and the sleet's coming in on your coast.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-decode-the-collect.mp3'),
      },
      'protect-the-feed': {
        text: `
        <p>
          The heater's on, and I didn't have to tell you. The first time sleet came in on Galway, on the 2nd of April, that was the whole lesson.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-protect-the-feed.mp3'),
      },
      'call-the-denial': {
        text: `
        <p>
          That's a denial. I've keyed SAR-3 to HOP-SAR3-01 at my end. Load yours, hop, and send PLD-SAFE through it. It's the third time we've done this, so I'm not worried.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-call-the-denial.mp3'),
      },
      'hop-and-deliver': {
        text: `
        <p>
          PLD-SAFE is acknowledged under TRANSEC, through sleet, with one station on holdover, and after a carrier sat in the other station's band earlier tonight. That's three contacts. Whatever they planned for tonight, it wasn't this.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-hop-and-deliver.mp3'),
      },
      'incident-log-and-handover': {
        text: `
        <p>
          I've got your handover, so get some sleep. One more thing. My friend in direction finding, the two-receiver people, rang back. They've read Priya's report, and their question for you isn't about the emitter. They want to know whether you'd come and do this from their side for a while. I said you'd call them.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/24/obj-incident-log-and-handover.mp3'),
      },
    },
  },
};
