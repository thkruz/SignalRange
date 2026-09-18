import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 5 - "Shetland Comes Online" / Two-Station Pass Network
 *
 * New mechanic: M3 multi-station contact scheduling (Contact Plan tab), and the
 * debut of SH-02 Shetland with Fiona MacLeod. Phase 16 rewrite: the operator
 * does not just allocate the plan, they work the network. Sweep Galway, build
 * and validate the plan, then take the Shetland console remotely (phase 16 E1
 * per-station propagation: SH-02 tracks and hears the bird on Shetland's own
 * horizon), sweep it, tune it, park it and fly MERIDIAN-SAR-1 from Shetland
 * while Charlie flies the same bird from Galway. Hand back, retune Galway for
 * SAR-2 and work that one from home while Fiona takes the 86 degree overhead.
 *
 * The scheduling puzzle is built from two conflicting pairs. Both sites can see
 * each MERIDIAN pass, but a single antenna cannot work two overlapping windows,
 * so the plan is only valid when each pair is split across the two stations.
 * Every contact is priority <= 2 and `requiredPriorityAtOrAbove: 2`, so all four
 * must be allocated before the plan validates.
 *
 * Clock: sim starts 2027-03-15 13:40:00 UTC (the brief freezes it until read).
 * Passes at the 5 deg mask, as the Pass Schedule tab shows them:
 * - SH-02 MERIDIAN-SAR-1: AOS 14:01:14 az 003, max el 23.8 at 14:04:42 (860 km),
 *   LOS 14:08:09 az 235. Measured C/N >= 8 dB 14:03:30 .. 14:06:05, peak 9.8 dB
 *   at culmination (test/campaigns/nats-eu-phase-b-validation.test.ts).
 * - GW-01 MERIDIAN-SAR-1: AOS 14:03:10 az 000, max el 28.0 at 14:06:45 (761 km),
 *   LOS 14:10:18 az 224. Charlie's.
 * - GW-01 MERIDIAN-SAR-2: AOS 14:18:42 az 130, max el 25.0 at 14:22:10 (828 km),
 *   LOS 14:25:40 az 000. C/N >= 8 dB roughly 14:20:30 .. 14:24:00.
 * - SH-02 MERIDIAN-SAR-2: AOS 14:19:32 az 162, max el 86.1 at 14:23:23 (393 km),
 *   LOS 14:27:15 az 342. Fiona's; the keyhole at the top is a later lesson.
 *
 * Contact windows are the 0 deg horizon crossings rounded to 10 s, propagated
 * per station (test/campaigns/nats-eu-contact-windows checks each against its
 * stationId pass).
 *
 * Staged state (scenario-local clones): SH-02 as Fiona left it after her last
 * acceptance run - tracker stowed south (az 180) against the wind, RX modem 1
 * on the 1370 MHz SAR-2 carrier, BUC muted. GW-01 is the shared default.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0689: Knowledge of network systems management principles and tools
 *   - T0129: Coordinate and manage system operations schedules
 *   - K0737: Knowledge of network operations planning
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** SH-02 as Fiona left it: stowed south, modem on SAR-2, BUC muted. Deep clone, never spread. */
const shetlandDebut: GroundStationConfig = structuredClone(shetlandGroundStation);
shetlandDebut.antennasState![0] = {
  ...shetlandDebut.antennasState![0],
  azimuth: 180 as Degrees,
  elevation: 3 as Degrees,
  targetAzimuth: 180 as Degrees,
  targetElevation: 3 as Degrees,
};
shetlandDebut.receivers![0].modems![0] = {
  ...shetlandDebut.receivers![0].modems![0],
  frequency: 1370 as MHz,
};
shetlandDebut.rfFrontEnds[0].buc = { ...shetlandDebut.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario5Data: ScenarioData = {
  id: 'nats-eu-scenario5',
  url: 'nats-eu/scenarios/nats-eu-scenario5',
  imageUrl: 'nats/5/card.png',
  number: 5,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario4'],
  title: 'Shetland Comes Online',
  subtitle: 'Two-Station Pass Network',
  duration: '35-40 min',
  missionType: 'Mission Planning',
  description: `SH-02 Shetland went operational overnight. Fiona MacLeod has been running acceptance up there for three weeks in weather you would not believe, and as of this morning NATS Europe is a network rather than a station.<br><br>That changes your job. Galway is no longer the only place a MERIDIAN pass can be worked, which means somebody has to decide which site takes which contact - and that somebody is the operator holding the plan. Four contacts today across two birds. Both sites can see all four. One antenna cannot be in two places at once.<br><br>And then somebody has to fly what the plan says. Fiona is out at the pedestal for the first window, so the Shetland console is yours, from Galway, for the network's first remote-operated pass.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'Contact Plan Console',
    'Pass Schedule Planner',
    'RX Modems with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation, shetlandDebut],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:40:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-5?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // A fast operator can skip the dead air between "ready" and AOS. The skip
    // is blocked while a timed objective runs and stops 2 min before the pass.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'NATS Europe Network Log',
      description: 'First day as a network, 2027-03-15. One line per contact: time, bird, site, who flew it, result.',
    },

    // M3 - two conflicting pairs; the plan only validates when each pair is
    // split across the two sites. Windows: 0 deg horizon crossings from the
    // 13:40 epoch, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 28 deg pass)', priority: 1, windowStartS: 1320, windowEndS: 1890, stationId: 'GW-01' },
        { id: 'SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 24 deg pass)', priority: 1, windowStartS: 1200, windowEndS: 1760, stationId: 'SH-02' },
        { id: 'SAR2-GW', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Galway, 25 deg pass)', priority: 1, windowStartS: 2250, windowEndS: 2810, stationId: 'GW-01' },
        { id: 'SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, 86 deg overhead pass)', priority: 2, windowStartS: 2310, windowEndS: 2900, stationId: 'SH-02' },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0737'],
      title: 'Review the Network Brief',
      description: "Open the shift brief and read the day's tasking. Four contacts, two sites, and the first window is Shetland's at 14:01.",
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Network Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Conflict Rule Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Two contacts have overlapping windows and both are visible from Galway. What makes that a conflict?',
            options: [
              'One antenna points at one satellite at a time, so overlapping windows on one site cannot both be worked.',
              'The two satellites would interfere on the downlink, so overlapping windows on one site cannot both decode.',
              'It is not a conflict, since the scheduler time-shares the antenna, so both windows on one site get worked.',
              'The two sites share one receiver, so only one contact can decode at a time whichever site is pointing.',
            ],
            correctIndex: 0,
            explanation: 'The constraint is the pedestal, not the spectrum. Overlapping windows have to go to different sites. Twenty minutes to the first AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: GALWAY SWEEP
    // ============================================================
    {
      id: 'galway-dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Clear the home board first: confirm the active alarm state on GW-01.',
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
            question: 'What is the active alarm state on GW-01 at turnover?',
            options: [
              'RX AGC at max gain (weak signal) - empty sky, not a fault; no hardware alarms',
              'No active alarms (all nominal) - board clear, sweep complete; nothing to carry over',
              'GPSDO in holdover (reference alarm) - timing at risk, not a fault; one hardware alarm',
              'Antenna drive fault (pedestal stowed) - tracker cannot slew; one hardware alarm',
            ],
            correctIndex: 0,
            explanation:
              'The AGC rail is the board telling you the antenna is looking at empty sky, not that something broke; it clears on acquisition. Shetland is the one nobody has swept from this console yet.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'galway-reference-check',
      nice: ['T0431', 'K0740'],
      title: 'GW-01 Reference Check',
      description: 'GPSDO locked and out of holdover. Charlie flies the Galway pass on this reference; confirm it before you hand him the station.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-dashboard-sweep'],
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
          type: 'gpsdo-not-in-holdover',
          description: 'GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 5: THE CONTACT PLAN
    // ============================================================
    {
      id: 'allocate-galway',
      nice: ['T0129', 'K0689', 'S0421'],
      title: 'Allocate the Galway Contacts',
      description: 'On the Contact Plan console, assign the two Galway-horizon contacts to GW-01. These are the passes this site has worked all week, and Galway keeps them.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-reference-check'],
      timeLimitSeconds: 3 * 60,
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
          description: 'SAR-1 Galway Contact on GW-01',
          params: { contactId: 'SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Galway Contact on GW-01',
          params: { contactId: 'SAR2-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'hand-shetland-the-overlaps',
      nice: ['T0129', 'K0737'],
      title: 'Hand Shetland the Overlaps',
      description: 'The two remaining contacts overlap the ones Galway is already working. Give them to SH-02 - that is what a second site is for.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['allocate-galway'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'contact-assigned',
          description: 'SAR-1 Shetland Contact on SH-02',
          params: { contactId: 'SAR1-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Shetland Contact on SH-02',
          params: { contactId: 'SAR2-SH', groundStationId: 'SH-02' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Priority Rule Read',
          params: {
            character: Character.SYSTEM,
            question: 'Three contacts are priority 1 and the Shetland SAR-2 overhead is priority 2. The plan requires priority 2 and above. What does that mean for the overhead?',
            options: [
              'It must be allocated - priority 2 is inside the required set, so the plan stays UNALLOCATED without it',
              'It can be left unassigned - only priority 1 is mandatory, so the plan validates with three contacts',
              'It goes to Galway automatically - the lower priority falls to the home site, so the plan fills itself',
              'It only affects list order - priority sets where the console lists a contact, not whether it is required',
            ],
            correctIndex: 0,
            explanation: 'Required means required: every contact at or above the threshold has to have a site. A priority 3 contact could be dropped. There are none today.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'validate-the-plan',
      nice: ['T0129', 'K0689'],
      title: 'Validate the Contact Plan',
      description: 'With every contact allocated and no site double-booked, the plan status should read DECONFLICTED. Confirm it before you publish it to Fiona.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hand-shetland-the-overlaps'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'contact-plan-valid',
          description: 'Plan Valid - No Conflicts, All Contacts Allocated',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Plan Published',
          params: {
            character: Character.SYSTEM,
            question: 'The plan validates. What has a second site actually bought the network here?',
            options: [
              'Every contact gets worked instead of one of each overlapping pair being dropped.',
              'A stronger signal, because two antennas receive the same pass and the receivers combine.',
              'Nothing operationally - it is redundancy for the day one site is down for maintenance.',
              'Longer passes, because the two horizons are added together into one contact window.',
            ],
            correctIndex: 0,
            explanation: 'Capacity, not just redundancy. Plan published to Shetland. Fiona is at the pedestal, so the first Shetland window is yours to fly from here.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 5 -> BEAT 1: THE SHETLAND CONSOLE
    // ============================================================
    {
      id: 'shetland-sweep',
      nice: ['T0431', 'S0421', 'K0741'],
      title: 'Shetland Health Check',
      description:
        'Select SH-02 in the asset tree and run the sweep from here: GPSDO locked and out of holdover, BUC temperature normal, LNB thermally stable. Same rack, seven degrees further north.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['validate-the-plan'],
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
          mustMaintain: false,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'SH-02 GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'buc-temperature-normal',
          description: 'SH-02 BUC Temperature Normal',
          params: { maxTemperature: 70, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'SH-02 LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-geometry',
      nice: ['K1032', 'K0773'],
      title: "Read Shetland's Sky",
      description: 'With SH-02 selected the Pass Schedule tab predicts from Shetland. Read the SAR-1 pass as Shetland sees it and compare it with the Galway numbers you know.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-sweep'],
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
          description: 'Geometry Read',
          params: {
            character: Character.SYSTEM,
            question:
              'SAR-1 rises over Shetland at 14:01 and peaks at 24 degrees; over Galway it rises at 14:03 and peaks at 28. Same bird, same orbit. Why does Shetland see it first and lower?',
            options: [
              'Southbound track west of Ireland: Shetland is further north, so sees it first, and further off-track, so lower',
              'Elevation mask: Shetland runs a lower mask than Galway, so it sees the bird earlier, and its peak reads lower too',
              'Element sets: the two sites are propagating different TLEs, so the times differ, and the peaks differ with them',
              'Site altitude: Shetland sits higher, so its horizon is extended, and the bird rises earlier and appears lower',
            ],
            correctIndex: 0,
            explanation:
              'Where you stand decides the pass. The ground track runs south, west of Ireland: Shetland is further north, so the bird crosses its horizon first, and further east of the track, so it never climbs as high. A sun-synchronous bird at 97 degrees inclination runs nearly pole to pole, so a site at 60 north sees more of its orbits than one at 53: more passes per day, and different ones. The SAR-2 pass at 14:19 goes 86 degrees overhead here and 25 over Galway.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-rx-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Shetland Receiver',
      description:
        'Fiona left modem 1 on the 1370 MHz SAR-2 carrier from her last acceptance run. Retune it to 1414 MHz for SAR-1 and put the analyzer on the 1389 MHz beacon with a 2 MHz span.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-geometry'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'SH-02 Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'SH-02 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-preposition',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position the Shetland Tracker',
      description:
        'The SH-02 tracker is stowed south against the wind. Slew it to the rise azimuth, 003 at 5 degrees, so the pedestal is waiting when SAR-1 clears the mask at 14:01.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-rx-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'SH-02 Parked on Az 003 / El 5',
          params: { azimuth: 3, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: MERIDIAN-SAR-1 FROM SHETLAND
    // ============================================================
    {
      id: 'acquire-from-shetland',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1 from Shetland',
      description: 'Program-track SAR-1 on the SH-02 pedestal and confirm the beacon on Shetland’s RX analysis. The network’s first remote-operated pass.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-preposition'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'SH-02 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'SH-02 Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'SAR-1 Beacon on the Shetland Analyzer',
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
      id: 'decode-from-shetland',
      nice: ['T0153', 'K0740'],
      title: 'Decode from Shetland',
      description: 'Lock the 1414 MHz imagery carrier on the SH-02 modem and hold C/N above 8 dB through the high-elevation segment, roughly 14:03:30 to 14:06.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'read-shetland-peak',
      nice: ['K0740', 'K0773'],
      title: 'Read the Shetland Peak',
      description:
        'Around 14:04:42 the bird is at 24 degrees and 860 km from Shetland. Confirm C/N of 9 dB or better at the top of the pass and compare it with what Galway gets from the same bird.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['decode-from-shetland'],
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N >= 9 dB at Culmination',
          params: { modemNumber: 1, minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Peak Compared',
          params: {
            character: Character.SYSTEM,
            question: 'Shetland peaks at about 9.8 dB at 24 degrees; Galway peaks at about 11 dB at 28 degrees on the same pass. Where does the difference come from?',
            options: [
              'Slant range: 860 km against 761 km is about 1 dB more path loss, and lower elevation adds a little atmosphere',
              'LNB temperature: the Shetland LNB runs warmer, so its noise figure is worse, and Tsys rises with it',
              'Latitude: Shetland is further north, so further from a satellite over Ireland, and that costs about 1 dB',
              'Remote link: the console link from Galway adds about a decibel of loss, and the display rounds the rest away',
            ],
            correctIndex: 0,
            explanation:
              'Same hardware, same bird, different geometry. 20 log(860 / 761) is 1.1 dB. Every dB in the difference between two sites should be explained by range and elevation; one that is not is a fault.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 4 -> BEAT 5: HAND BACK, RETUNE GALWAY
    // ============================================================
    {
      id: 'hand-back-to-galway',
      nice: ['S0421', 'K0773', 'T0129'],
      title: 'Hand Back and Retune Galway',
      description:
        'Shetland sets at 14:08 and Fiona is back on her console. Select GW-01, retune modem 1 to the 1370 MHz SAR-2 carrier, put the analyzer on its 1397 MHz beacon and park the tracker on the rise azimuth, 130 at 5 degrees. SAR-2 clears the mask at 14:18.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-shetland-peak'],
      timeLimitSeconds: 4 * 60,
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
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'GW-01 Parked on Az 130 / El 5',
          params: { azimuth: 130, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: MERIDIAN-SAR-2 FROM GALWAY
    // ============================================================
    {
      id: 'acquire-sar2-galway',
      nice: ['S0421', 'K1032', 'T0153'],
      title: 'Acquire MERIDIAN-SAR-2',
      description:
        'Program-track SAR-2 on the GW-01 pedestal and confirm its imagery carrier on RX analysis once it clears the mask. Fiona is taking the same bird overhead at Shetland.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['hand-back-to-galway'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Downlink Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-VIDEO',
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
      id: 'decode-sar2-galway',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Decode the Galway Contact',
      description: 'Lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation segment. While it holds, think about what Fiona is seeing at 86 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2-galway'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Overhead Compared',
          params: {
            character: Character.SYSTEM,
            question:
              'SAR-2 culminates at 25 degrees and 828 km over Galway, and at 86 degrees and 393 km over Shetland. Ignoring the pedestal, whose C/N should be higher at the top, and by how much?',
            options: [
              "Shetland's, by about 6.5 dB - 20 log(828 / 393) of path loss, and almost no atmosphere straight up",
              "Galway's, by about 1 dB - a lower pass (25 degrees) keeps the bird in the beam longer, so the AGC settles",
              "The same (within 1 dB) - C/N depends on the bird's EIRP, not the site, and both run the same LNB",
              "Shetland's, by about 1 dB - 20 log(860 / 761) again, the same SAR-1 difference and the same atmosphere",
            ],
            correctIndex: 0,
            explanation:
              'Range wins: an overhead pass is the strongest signal a site ever gets. "Ignoring the pedestal" is doing a lot of work in that question, and Fiona will tell you why when she rings.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4: NETWORK LOG
    // ============================================================
    {
      id: 'log-the-network',
      nice: ['T1580', 'K0645', 'K0689'],
      title: 'Log the First Network Day',
      description: 'Four contacts on the plan, four worked: two by you, one by Charlie, one by Fiona. Write the day into the network log the way the next planner needs it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2-galway'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Network Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'What does the log need to say about the SAR-1 pair, beyond "worked"?',
            options: [
              'Site and peak per contact: SH-02 remote, 9.8 dB at 24 degrees; GW-01, 11 dB at 28 degrees - both decoded',
              'That the plan validated: SAR1-SH on SH-02, SAR1-GW on GW-01; plan DECONFLICTED - both allocated',
              'Which pass was better: GW-01, 11 dB at 28 degrees; SH-02, 9.8 dB at 24 degrees - Shetland not needed',
              'The NORAD ids only: 61701 on SH-02, 61701 on GW-01; measurements go to Rotterdam - both worked',
            ],
            correctIndex: 0,
            explanation:
              'Which site flew each contact and what it measured: site, operator, number. The first remote pass is a baseline for every remote pass after it. Day one as a network: nothing dropped.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '14:01Z MERIDIAN-SAR-1 SH-02 (remote from GW-01): decoded, peak C/N 9.8 dB at 24 deg. 14:03Z MERIDIAN-SAR-1 GW-01 (C. Brooks): decoded, peak 11 dB at 28 deg. 14:18Z MERIDIAN-SAR-2 GW-01: decoded, C/N >= 8 dB. 14:19Z MERIDIAN-SAR-2 SH-02 (F. MacLeod): 86 deg overhead, worked. Plan DECONFLICTED, nothing dropped.',
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
        <em>[Text message from Charlie Brooks at 13:39]</em>
      </p>
      <p>
        "Shetland signed its acceptance card overnight, which makes us a network as of this morning and makes somebody responsible for deciding which site takes which pass. That is the console you are sitting at. Four contacts, two birds, both sites can see all four. Build the plan, and then - Fiona is out at the pedestal for the first window - fly Shetland's from here. I will take the Galway one myself; it is my station too."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'allocate-galway': {
        text: `
        <p>
          Galway keeps the passes it has been working all week. The question the plan exists to answer is what you do with the other two.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'hand-shetland-the-overlaps': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 13:46]</em>
        </p>
        <p>
          "Morning Galway. Wind's forty knots gusting fifty-five and the dish is rated for worse, so I'm not worried and neither should you be. Send me the plan when it validates. If you give me a pass that overlaps one of yours I'll assume it's deliberate and then I'll ring you."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'validate-the-plan': {
        text: `
        <p>
          "Plan received, and it's the one I'd have built. I'm going out to the pedestal for the first one - the feed heater wiring wants finishing before the weather gets its opinion in. The console's yours until I'm back. Don't be gentle with it, it's a Galway rack with a Shetland view."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'shetland-sweep': {
        text: `
        <p>
          "Reference's locked, BUC's cold, LNB's been stable since Tuesday. You'll see the same numbers I see. The only thing you can't check from there is whether the dish is still attached, and I'm standing next to it, so."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'shetland-geometry': {
        text: `
        <p>
          Look at the schedule with Shetland selected. Same bird, and it is a different pass: earlier, lower, and it will not be the last time the two sites disagree about the sky. That is the whole reason there are two of them.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'shetland-preposition': {
        text: `
        <p>
          "I left the dish stowed south, pointing at the hill, because that's where the wind isn't. Bring it round to the north before the bird's up. Nine seconds, but you don't want to be doing it at AOS."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-from-shetland': {
        text: `
        <p>
          "There it is on my analyzer, so it's on yours. First pass this site has ever flown and the operator's three hundred miles away. Rotterdam will want that in a press release."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'decode-from-shetland': {
        text: `
        <p>
          I have it on Galway's dish at the same time, two minutes behind you. Two sites, one bird, both decoding. Hold yours above eight through the top; mine will do the same, a little later and a little higher.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'read-shetland-peak': {
        text: `
        <p>
          "Nine point eight. Charlie'll get eleven and he'll mention it. Same bird, hundred kilometres further from us. Write both down; one day one of them will be wrong and you'll want to know which."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'hand-back-to-galway': {
        text: `
        <p>
          Fiona is back on her console. Give her the station and take Galway for SAR-2. Different carrier, same arithmetic, ten minutes. She has the overhead; you have the sensible one.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-sar2-galway': {
        text: `
        <p>
          "Mine's going straight over the top. Eighty-six degrees. I'll lose it for a minute at the top - the pedestal can't turn round fast enough - so tell your customer the middle third is what he gets. Yours is the one that'll decode clean, twenty-five degrees is a proper pass."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'log-the-network': {
        text: `
        <p>
          Four for four on the network's first day, one of them from a console the operator was not sitting at. Log it properly: site, who flew it, the number. Then ring Fiona and tell her eleven point two.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
    },
  },
};
