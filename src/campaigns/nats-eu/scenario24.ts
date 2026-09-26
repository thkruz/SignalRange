import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
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
  imageUrl: 'nats/24/card.png',
  number: 24,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario23'],
  title: 'North Atlantic Storm',
  subtitle: 'Campaign Capstone (Gray Zone 8/8)',
  duration: '60 min',
  missionType: 'Security Operations',
  description: `03:00, Galway, Tuesday. An Atlantic low is on the coast: rain band now, sleet by 03:40. Three birds in an hour across both stations - SAR-1 collected from Galway in the lull, SAR-2 from Shetland on a set that is about to change, SAR-3 commanded from Galway through the sleet. Charlie is on the phone and you are incident commander for the network.<br><br>Everything they have done in the last two weeks, they can do again tonight. Everything you have done, you can do again too. The plan first.`,
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
        power: 5,
        polarization: 'H',
        startTime: 3300,
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
          action: 'Met Eireann orange warning: Atlantic low, heavy rain 02:30-03:30, sleet from 03:30, west coast',
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
      description: 'Open the brief: the low, three birds in an hour across two sites, and the one thing an incident commander does before touching anything.',
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
              'The plan: which bird from which site, in what order, so that every P1 window has a station and no station has two - then the sites, then the passes',
              'The uplink: SAR-3 is the only command contact and the key must be checked before anything else',
              'The weather: heater on at Galway now, before the rain, so the whole hour is flown on a dry feed',
              'The adversary: load the hop set and take both references to holdover so nothing they do tonight lands',
            ],
            correctIndex: 0,
            explanation:
              'The plan is the thing everything else hangs off, and it is the only thing that can be wrong for the whole hour at once. The heater is on before the sleet, not the rain; the hop set is spent on a called denial; the references are trusted until one lies. Twenty minutes to the first AOS.',
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
      description: 'Contact Plan: SAR-1 and SAR-3 to Galway, SAR-2 to Shetland. Three P1 contacts, no overlaps, the plan reads DECONFLICTED.',
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
              'Because Galway has SAR-1 setting at 03:29 and SAR-3 rising at 03:52 with sleet between them, and Shetland has SAR-2 at 35 degrees in clear air; the plan puts each window on the site that can close it',
              'Because Shetland has no command key and must take every receive-only contact so Galway is free to command',
              'Because the spoofer is expected on Galway and a collect flown from Shetland is safe from it',
              'It should not: the commander flies every pass from the console in front of them and Shetland is a backup',
            ],
            correctIndex: 0,
            explanation:
              'Two sites are one network when the plan says which window is whose. Galway has two contacts and weather; Shetland has one and clear sky. Nothing about the adversary is in the plan yet - the plan is geometry and weather, and it is right before anything else happens.',
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
      description: 'Board read at Galway with the rain band arriving. Confirm the active alarm state before the first pass.',
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
            question: 'What is the active alarm state on GW-01 at 03:02?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm; the rain is a weather event on the ACU, not a fault on the chain',
              'No active alarms - all systems nominal, board clear for the pass',
              'Rain fade alarm - the receive chain has lost margin and the SAR-1 collect should move to Shetland',
              'Feed heater alarm - the heater is off in precipitation and the board wants it on',
            ],
            correctIndex: 0,
            explanation:
              'Empty sky, not a fault. Thirty millimetres an hour is on the ACU weather panel, and it ends before SAR-1 rises. The heater is for the sleet at 03:40, and the board does not nag about it.',
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
      description: 'RX modem 1 on 1414 MHz, analyzer centred on 1414 with a 40 MHz span. The carrier that followed the plan on the 14th will be in this band if it comes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-dashboard-sweep'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1414 MHz',
          params: { centerFrequency: 1414e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 40 MHz',
          params: { span: 40e6, frequencyTolerance: 5e6 },
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
      description: 'Select SH-02. GPS Timing: locked, GNSS tracking, delta-T zero. Retune its RX modem 1 to 1370 MHz for SAR-2. Read the reference now; it will matter at 03:25.',
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
      description: 'Back to GW-01. The rain band clears at 03:16; SAR-1 rises 03:19:58 from azimuth 005. Program-track it and confirm the beacon on RX analysis.',
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
        "From 03:21:30 the carrier is back at 1410 MHz IF, in SAR-1's band, same cadence as the 14th. Notch 1 on 1410, 2 MHz, 30 dB, and hold C/N above 7 dB through the high segment.",
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
            notchIndex: 1,
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
          type: 'status-check',
          description: 'Carrier Read',
          params: {
            character: Character.SYSTEM,
            question: 'Same frequency as the 14th, same cadence, same bearing. What is different tonight about how it is handled?',
            options: [
              'Nothing in the handling - notch it, keep the collect, log it against the open IR. What is different is that it is one of four things happening, and it is the one the plan already has an answer for',
              'It is escalated immediately: the third appearance of the same emitter is a criminal matter and the collect stops',
              'The collect moves to Shetland: a known interferer in the band means Galway cannot be trusted for SAR-1',
              'The notch is not applied: with the rain gone the margin is enough and a notch costs signal',
            ],
            correctIndex: 0,
            explanation:
              "A known event gets its known answer and no more of the commander's attention than that. The collect is delivered, the IR gets a line, and the console is free for the things that do not have an answer yet.",
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
      description: "SAR-2 burned at 03:15; the Pass Schedule tab has read EPHEMERIS STALE since. Load the update before Shetland's 03:31 AOS.",
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
      description: "Rotterdam sees Shetland's timestamps drifting. Select SH-02 and read its GNSS vs REF delta-T on GPS Timing. Galway is the cross-check tonight.",
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
            question: 'Shetland walking, Galway reading zero, both constellations healthy. What is it, and where?',
            options: [
              "A GNSS spoof, local to Shetland - the same signature as the 19th with the sites swapped. Galway's zero is the proof it is local, and Galway's reference is the one still trusted",
              'A GNSS spoof on both sites: the walk starts at Shetland and Galway will follow inside a minute',
              'A Shetland GPSDO fault: Fiona should power-cycle the unit before the SAR-2 pass',
              'A Rotterdam reference problem: two stations cannot both be wrong, so the comparison is',
            ],
            correctIndex: 0,
            explanation:
              'Two receivers, two skies, one of them lied to. The 19th taught the cross-check from Galway; tonight it is read from Galway. Holdover at Shetland, fly SAR-2 on the oscillator, and Galway keeps GNSS because Galway is honest.',
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
      description: 'SH-02 GPS Timing: GNSS switch down. The Shetland reference free-runs through the SAR-2 collect; Galway stays on GNSS.',
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
      description: 'SAR-2 rises 03:31:01 from azimuth 139 at Shetland, northbound, on the post-burn set. Program-track it and confirm the beacon on RX analysis.',
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
      description: 'SH-02 RX modem locked on SAR-2, C/N above 8 dB through the high segment, reference in holdover. The NMW collect, delivered.',
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
              '03:01-03:16 rain band GW-01. 03:15 SAR-2 burn, post-burn set loaded 03:29. 03:20-03:29 SAR-1 collected GW-01 under the 1410 MHz carrier (notched, C/N > 7). 03:25 spoof on SH-02 reference, GW-01 clean; SH-02 holdover. 03:31 SAR-2 collected SH-02 on the oscillator. Two collects delivered',
              'Half an hour of attacks on both sites; both collects at risk; incident escalated to Rotterdam',
              'Rain, a burn, a jammer and a spoof, all handled; nothing to report to the customer',
              'SAR-1 and SAR-2 collected as planned; weather and interference noted',
            ],
            correctIndex: 0,
            explanation:
              'Times, sites, what happened, what was done, what was delivered. Half the hour is written before the half that matters most, because the commander who writes as they go is the one who can hand over.',
            pointPenalty: 5,
            documentSection: 'Incident Log',
            documentLine:
              '03:01-03:16Z rain band GW-01 (30 mm/h). 03:15Z SAR-2 conjunction-avoidance burn; post-burn set loaded 03:29Z. 03:20-03:29Z SAR-1 NMW collect GW-01 under terrestrial carrier 11690 MHz (1410 IF), notch 1410/2/30, C/N > 7 dB - delivered. 03:25Z GNSS spoof on SH-02 reference (+2 us/s), GW-01 clean; SH-02 to holdover 03:30Z. 03:31-03:41Z SAR-2 NMW collect SH-02 on the oscillator - delivered.',
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
      description: 'Back to GW-01. Sleet from 03:40, SAR-3 at 03:52. Feed heater on now, before the first flake.',
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
            question: 'Why was the heater not switched on at 03:00 with the rain, when it costs nothing to run?',
            options: [
              'Rain does not stick and a heated feed in rain is just a warm feed; sleet does. The heater is timed to the sleet and on before it, because ice that has formed takes minutes to melt and the pass will not wait',
              "It should have been: the commander's first act was the plan, and the heater is part of the plan",
              'Because a heated feed adds noise temperature, and the SAR-1 collect needed every tenth of a decibel in the rain',
              'Because the heater draws from the same supply as the HPA and cannot run during a commanding pass',
            ],
            correctIndex: 0,
            explanation:
              'Right thing, right time. On at 03:36 for sleet at 03:40 is the whole skill; on at 03:00 is harmless but tells the log nothing about whether you knew when the sleet was coming.',
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
        "SAR-3's 14065 MHz TT&C uplink through the 12600 MHz BUC LO: TX modem 1 to 1465 MHz, uplink Doppler compensation engaged. SAR-3 video 11760 MHz: RX modem 1 to 1340 MHz.",
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
      description: 'SAR-3 rises 03:52:00 from azimuth 023. Program-track it on a heated feed and confirm the 1315 MHz beacon on RX analysis.',
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
      description: 'Window open at 03:52:21. Carrier into the muted BUC, unmute, HPA, and HK-DUMP on the fixed carrier. One clean ACK before the one that matters.',
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
        'From 03:55 PLD-SAFE comes back NAK: uplink denied. Read the console and the key, then call it. You have done this twice; do it in the sleet with two other things on the board.',
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
              'PLD-SAFE did not reach SAR-3. Key Valid at my end, window open six more minutes, and I have Shetland on holdover and Galway in sleet on my screen. What is it?',
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
                feedback:
                  'HK-DUMP ACKed in the same sleet two minutes ago on the same power. Ku uplink fade at 28 degrees in sleet is a decibel or two; the NAK reason on the console is not "weak", it is "jammed".',
              },
              {
                label: 'Key problem - the SAR-3 key has never been used under TRANSEC. Begin a rotation and resend',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: { log: 'Command-key rotation begun on a Valid key during a denial' },
                feedback: 'Both ends read Valid and a key rejection is its own reason on the console. Two of six minutes gone.',
              },
              {
                label: 'Stand down - the network has delivered two collects and the third bird can be commanded tomorrow',
                feedback: 'The payload command is the P1 contact on the plan you wrote at 03:02. The hop set was staged for this minute.',
              },
            ],
            explanation:
              'Every reason the console can give for itself is clean, the weather is on the downlink margin and the uplink has power to spare, and the bird is not hearing you. Same call as the 16th and the 24th. The point of the capstone is that it is the same call.',
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
        'Security console: Load Hop-Set Key (HOP-SAR3-01), Frequency hopping, SYNC LOCKED. Then PLD-SAFE under TRANSEC, through the sleet, on a heated feed, on a network with one reference in holdover.',
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
      description: 'LOS 04:01:35. Galway: HPA off, BUC muted, carrier off. Shetland stays in holdover until a probe says its sky is honest.',
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
      description: 'The second half of the hour goes in the log, and then the handover: what is open, what is staged, and what the day shift walks into.',
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
              '03:36 GW-01 feed heater on; sleet from 03:40. 03:52 SAR-3 acquired GW-01, HK-DUMP ACK fixed carrier 03:53. 03:55 PLD-SAFE NAK uplink denied (14065 MHz jammed), key Valid; called denial; HOP-SAR3-01 keyed both ends, SYNC LOCKED; PLD-SAFE ACK under TRANSEC 03:57. Safed at LOS 04:01. Three contacts delivered',
              "SAR-3 commanded through jamming and sleet; the adversary's most aggressive night yet defeated by the incident commander",
              'SAR-3 pass completed with one anomaly; hop set used; no customer impact',
              '03:52-04:01 SAR-3 command contact; PLD-SAFE delayed by interference and sent on the second attempt',
            ],
            correctIndex: 0,
            explanation:
              'Times, what came back, what was done, what was delivered - the same line as every night since the 13th. "Defeated" is a mood and "delayed by interference" hides the NAK reason. Three contacts delivered is the sentence the board reads.',
            pointPenalty: 5,
            documentSection: 'Incident Log',
            documentLine:
              '03:36Z GW-01 feed heater on; sleet 03:40-04:10Z. 03:52Z SAR-3 acquired GW-01 through sleet; HK-DUMP ACK 03:53Z fixed carrier. 03:55Z PLD-SAFE NAK "uplink denied - carrier jammed" (14065 MHz at the spacecraft), key Valid, Doppler on; called denial; HOP-SAR3-01 keyed both ends, hopping, SYNC LOCKED; PLD-SAFE ACK 03:57Z under TRANSEC. Chain safed at LOS 04:01Z. Three P1 contacts delivered.',
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
              'Open: SH-02 reference in holdover (spoofer active at close; probe at 04:30), jammer on 14065 (IR extension), terrestrial carrier third appearance (IR extension), HOP-SAR3-01 spent (HOP-SAR3-02 to stage). Staged: nothing new to learn - every event tonight had a procedure, and the procedures held',
              'Open: everything. The network was under sustained attack and the day shift should expect the same',
              'Open: nothing. Three contacts delivered, all anomalies resolved, station nominal',
              'Open: the adversary. Until the source is located the network cannot be considered secure and commanding should be suspended',
            ],
            correctIndex: 0,
            explanation:
              'The handover is a list of what is still true and what is staged for it. Two weeks ago every one of these would have been a first. Tonight they were all procedure, done in the order the network needed, with a storm on top. That is the campaign.',
            pointPenalty: 5,
            documentSection: 'Handover',
            documentLine:
              'Handover 04:15Z. Open: SH-02 reference in holdover (spoofer active at close; probe scheduled 04:30Z); uplink jammer on 14065 MHz and terrestrial carrier 11690 MHz (IR-2027-0414-GW01 extended, third appearance); HOP-SAR3-01 spent, HOP-SAR3-02 to be staged before the next SAR-3 window. Delivered: SAR-1 (GW-01), SAR-2 (SH-02), SAR-3 command contact incl. PLD-SAFE (GW-01). No procedure change: every event had one, and they held together.',
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
        "Orange warning on the coast, three birds in an hour, and you are incident commander for the network tonight - Fiona is on SH-02, Anneke is on the constellation, I am on the phone. Plan first. Everything they have done to us in two weeks, assume they do again, all at once, in the sleet. Everything you have done, you can do again too."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'plan-the-network': {
        text: `
        <p>
          That is the plan I would have written. SAR-1 and SAR-3 are yours, SAR-2 is Fiona's. Now go and see what the weather has done to my station.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'notch-the-carrier': {
        text: `
        <p>
          Fiona here. Your carrier is on my analyzer too, faintly - same bearing as the 14th, so it is Galway-side. My band is clean and my reference reads zero. For now.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'load-the-ephemeris': {
        text: `
        <p>
          Post-burn set loaded on both stations, thank you. SAR-2 will rise at Shetland where the new set says, not where the old one did. Fiona has the pass in two minutes.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'shetland-spot-the-walk': {
        text: `
        <p>
          It is on me this time. Delta-T walking, nine satellites, GOOD - and you read zero. Say the word and the switch goes down; I know the drill from your record.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'decode-the-collect': {
        text: `
        <p>
          SAR-2 collect in from Shetland, frames clean, timestamps carrying Fiona's frozen offset exactly as logged. Two of three. SAR-3 in seventeen minutes, and the sleet is on your coast.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'protect-the-feed': {
        text: `
        <p>
          Heater on at 03:36 for sleet at 03:40. I did not have to say it. That is the difference between the 2nd of April and tonight.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'call-the-denial': {
        text: `
        <p>
          Denial. Keying SAR-3 to HOP-SAR3-01 - done. Load yours, hop, and put PLD-SAFE through it. Third time; I am not worried.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'hop-and-deliver': {
        text: `
        <p>
          PLD-SAFE acknowledged under TRANSEC, through sleet, with one station on holdover and a carrier in the other one's band. Three contacts. Whatever they planned for tonight, it was not this.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'incident-log-and-handover': {
        text: `
        <p>
          Handover received. Get some sleep. One more thing: my friend called back about the emitter - the two-receiver people. They read Priya's report and they have a question for you, and it is not about the emitter. It is whether you would come and do this from their side for a while. I said you would call them.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
