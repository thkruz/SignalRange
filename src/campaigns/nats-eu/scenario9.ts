import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 9 - "Morning Constellation" / Network Health & Daily Pass Plan
 *
 * First qualified shift (Phase 2 opener). No new mechanics. Phase 16 rewrite:
 * the whole morning, not just the two passes. Both sites are swept from the
 * Galway console (dashboard, reference, receive chain, transmit chain: four
 * objectives per site), the six-contact day plan is built, then the network is
 * flown: MERIDIAN-SAR-1 from Galway for the customer's standing collect,
 * Galway armed on program-track for its SAR-2 window and left to fly it
 * unattended, the Shetland console taken remotely when Fiona goes out to the
 * pedestal, MERIDIAN-SAR-2 flown FROM SH-02 (phase 16 E1: per-station
 * propagation), and the unattended Galway pass checked on the way back.
 *
 * This is the first scenario with its own epoch and its own element sets. The
 * clock starts 2027-03-17 06:00:00 UTC (moved 10 min earlier in phase 16 so
 * the sweeps fit before the first window) and the birds are built here with
 * the satellites.ts factories, so nothing this scenario does to a TLE can leak
 * into another scenario's sky.
 *
 * Pass timeline (scripts/author-passes.mjs, verify-only, epoch 06:00:00Z):
 *
 *   GW-01 MERIDIAN-SAR-1 #1: AOS T+18.0 (06:18:00Z, az 143), max el 30.5 deg at
 *                            T+22.8 (06:22:47Z, 716 km), LOS T+27.6 (06:27:33Z,
 *                            az 355), 9.5 min, northbound. Peak C/N ~11 dB.
 *   SH-02 MERIDIAN-SAR-1 #1: AOS T+19.1 (06:19:07Z, az 167), max el 72.8 deg at
 *                            T+24.1 (409 km), LOS T+29.1 (06:29:04Z). Fiona's.
 *   SH-02 MERIDIAN-SAR-2 #1: AOS T+30.0 (06:30:00Z, az 011), max el 23.0 deg at
 *                            T+34.6 (06:34:38Z, 879 km), LOS T+39.3 (06:39:17Z,
 *                            az 233), 9.3 min, southbound. Flown from SH-02:
 *                            peak C/N 9.7 dB, >= 7 dB for ~3.5 min (harness).
 *   GW-01 MERIDIAN-SAR-2 #1: AOS T+32.0 (06:32:00Z, az 006), max el 25.2 deg at
 *                            T+36.7 (06:36:43Z, 823 km), LOS T+41.4 (06:41:22Z,
 *                            az 224), 9.4 min, southbound. Unattended.
 *   GW-01 MERIDIAN-SAR-1 #2: AOS T+109.9 (07:49:51Z), max el 18.3 deg, LOS T+119.0
 *   SH-02 MERIDIAN-SAR-2 #2: AOS T+122.0 (08:01:59Z), max el 4.8 deg (graze)
 *
 * Contact windows: 0 deg AOS/LOS rounded to 10 s for BOTH sites, propagated per
 * station (test/campaigns/nats-eu-contact-windows checks each window against its
 * `stationId` pass). C/N thresholds are flown in
 * test/campaigns/nats-eu-phase-c-validation.test.ts, the Shetland one from
 * Shetland.
 *
 * Staged state (scenario-local clone): GW-01 RX modem 1 on the 1370 MHz SAR-2
 * carrier from the evening shift's last contact, analyzer at its 1414 / 60 MHz
 * default. SH-02 is the shared default (modem on 1414, ready for Fiona's SAR-1).
 *
 * RF is the S1 envelope, unchanged: video 28 dBm EIRP, IF 1414 / 1370 MHz,
 * C/N peaks ~11 dB at 25-30 deg max elevation under real program-track. No faults.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0431: Check system hardware availability, functionality, integrity, and efficiency
 *   - K0689: Knowledge of network systems management principles and tools
 *   - T0153: Monitor network capacity and performance
 *
 * Supporting Codes:
 *   - K0741: Knowledge of system administration concepts
 *   - T0129: Coordinate and manage system operations schedules
 *   - S0421: Skill in operating network equipment
 *   - K0740: Knowledge of system performance indicators
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0645: Knowledge of standard operating procedures
 *   - S0478: Skill in communicating with customers
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-1 (61701) element set at the S9 epoch. */
const SAR1_S9_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27076.25694444  .00001000  00000-0  10000-3 0  9995' as TleLine1,
  tle2: '2 61701  97.2000 280.0000 0010000  90.0000 275.7500 15.60000000123458' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) element set at the S9 epoch. */
const SAR2_S9_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27076.25694444  .00001000  00000-0  10000-3 0  9996' as TleLine1,
  tle2: '2 61702  98.4000  62.2500 0010000  90.0000 289.5000 15.60000000123455' as TleLine2,
};

const meridianSar1S9 = createMeridianSar1(SAR1_S9_TLE);
const meridianSar2S9 = createMeridianSar2(SAR2_S9_TLE);

/** GW-01 as the evening shift left it: modem on SAR-2. Deep clone, never spread. */
const galwayMorning: GroundStationConfig = structuredClone(galwayGroundStation);
galwayMorning.receivers![0].modems![0] = {
  ...galwayMorning.receivers![0].modems![0],
  frequency: 1370 as MHz,
};

export const natsEuScenario9Data: ScenarioData = {
  id: 'nats-eu-scenario9',
  url: 'nats-eu/scenarios/nats-eu-scenario9',
  imageUrl: 'nats/9/card.png',
  number: 9,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario8'],
  title: 'Morning Constellation',
  subtitle: 'Network Health & Daily Pass Plan',
  duration: '35 min',
  missionType: 'Network Operations',
  description: `06:00 local. First qualified shift. Two sites, two birds, six contacts on the board and nobody to hand you the plan.<br><br>Erik Halvorsen at Nordic Maritime Watch has a standing collect on the 06:18 MERIDIAN-SAR-1 window and wants to know it is covered. Fiona is on the SH-02 console for her 73 degree pass and then she is outside on the feed heater, which makes the Shetland SAR-2 window at 06:30 yours, remotely, at the same time as Galway's own.<br><br>Sweep both sites before the first window, build the day plan, fly the collect, arm Galway to fly its second window on its own, take Shetland's from here, and tell Erik what he can count on.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'Contact Plan Console',
    'Ku-Band RF Front End (GPSDO / LNB / BUC / HPA)',
    'RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayMorning, shetlandGroundStation],
    satellites: [meridianSar1S9, meridianSar2S9],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-17',
    scenarioStartWallTime: '06:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-9?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 3,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // The two P3 second-orbit contacts sit at T+110 and T+122 min. If the
    // operator keeps them in the plan, the skip gets there without sitting
    // through an hour of empty sky. The skip stops 2 min before the NEXT pass
    // at either site and is blocked while a timed objective runs, so skipping
    // before the morning windows are worked forfeits them.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 4,
    },

    workingDocument: {
      title: 'NATS Europe Morning Report',
      description: 'Qualified shift, 2027-03-17. One line per contact worked, and the customer status as sent.',
    },

    // M3 - the day plan. Two conflict pairs (SAR-1 at T+18, SAR-2 at T+30),
    // each of which has to be split across the sites, plus two P3 second-orbit
    // contacts that may be left unassigned: requiredPriorityAtOrAbove 2 means
    // only the four P1/P2 contacts have to be covered for the plan to validate.
    // Windows are 0 deg horizon crossings from the 06:00 epoch, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'M-SAR1-GW', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Galway, 30 deg pass)', priority: 1, windowStartS: 1080, windowEndS: 1650, stationId: 'GW-01' },
        { id: 'M-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 73 deg pass)', priority: 2, windowStartS: 1150, windowEndS: 1750, stationId: 'SH-02' },
        { id: 'M-SAR2-GW', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Galway, 25 deg pass)', priority: 1, windowStartS: 1920, windowEndS: 2480, stationId: 'GW-01' },
        { id: 'M-SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, 23 deg pass)', priority: 1, windowStartS: 1800, windowEndS: 2360, stationId: 'SH-02' },
        {
          id: 'M-SAR1-GW-2',
          satelliteNoradId: 61701,
          label: 'MERIDIAN-SAR-1 (Galway, second orbit, 18 deg)',
          priority: 3,
          windowStartS: 6590,
          windowEndS: 7140,
          stationId: 'GW-01',
        },
        {
          id: 'M-SAR2-SH-2',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Shetland, second orbit, 5 deg graze)',
          priority: 3,
          windowStartS: 7320,
          windowEndS: 7690,
          stationId: 'SH-02',
        },
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
      title: 'Take the Shift',
      description: 'Open the brief; confirm the six contacts, who flies what, and the health-check list for both sites.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Plan Rule Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'Six contacts, two sites. What must be true before you publish a plan to Fiona?',
            options: [
              'No site is double-booked and every P1 and P2 contact is assigned to a station.',
              'Every contact on the board, including the P3 second-orbit passes, is assigned to Galway.',
              'Both sites are assigned to the same contact so there is a backup.',
              'Every contact is assigned to the site with the higher maximum elevation.',
            ],
            correctIndex: 0,
            explanation:
              'Overlaps go to different sites, the P1/P2 contacts are all covered, and the P3 passes are yours to keep or drop. Eighteen minutes to the first window. Shift clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: GALWAY SWEEP (FOUR CHECKS)
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
            options: ['No active alarms - all systems nominal', 'GPSDO in holdover', 'BUC over-temperature', 'Antenna drive fault'],
            correctIndex: 0,
            explanation: 'Clean board. The evening shift left the hardware healthy and the receiver on the wrong bird; the next three checks find which is which.',
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
      description: 'GPSDO locked and out of holdover. Every LO in the rack keys off it; confirm it before the plan commits the site to anything.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GW-01 GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'galway-receive-chain',
      nice: ['T0431', 'S0421', 'K0773'],
      title: 'GW-01 Receive Chain',
      description:
        'LNB on the 13100 MHz LO and thermally stable. The evening shift left modem 1 on the 1370 MHz SAR-2 carrier: retune it to 1414 MHz for the 06:18 SAR-1 collect and put the analyzer on the SAR-1 beacon, 1389 MHz, with a 2 MHz span.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-reference-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'lnb-lo-set',
          description: 'GW-01 LNB LO 13100 MHz',
          params: { loFrequency: 13100 as MHz, loFrequencyTolerance: 0, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'GW-01 LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'galway-transmit-chain',
      nice: ['T0431', 'K0740', 'K0645'],
      title: 'GW-01 Transmit Chain',
      description: 'No uplink is tasked today. Confirm the chain is cold the right way: BUC on the external reference with normal current, HPA output disabled.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-receive-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-reference-locked',
          description: 'GW-01 BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-current-normal',
          description: 'GW-01 BUC Current Normal',
          params: { maxCurrentDraw: 4.5, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'GW-01 HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Cold Chain Read',
          params: {
            character: Character.SYSTEM,
            question: 'Receive-only shift. Which transmit-chain state is the correct "cold" for a site that might be tasked later today?',
            options: [
              'Modem off air, HPA output disabled, BUC muted or without drive - everything still powered and on the reference so it can be brought up in order',
              'HPA output enabled with the modem off, so the chain is ready the moment a command arrives',
              'BUC and HPA powered off entirely until tasking comes in',
              'It does not matter on a receive-only shift',
            ],
            correctIndex: 0,
            explanation:
              'Cold is not off. An HPA enabled with nothing driving it amplifies the noise floor into the feed, and a chain that was powered down needs a reference lock and a warm-up before it can be trusted. Powered, locked, disabled.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 5: THE DAY PLAN
    // ============================================================
    {
      id: 'build-the-day-plan',
      nice: ['K0689', 'T0129'],
      title: 'Build the Day Plan',
      description:
        "Allocate the morning's contacts across GW-01 and SH-02 with no site double-booked; leave the P3 second-orbit contacts to your judgment. The plan must read DECONFLICTED.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-transmit-chain'],
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
          description: 'SAR-1 06:18 Window on GW-01',
          params: { contactId: 'M-SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 Shetland Window on SH-02',
          params: { contactId: 'M-SAR2-SH', groundStationId: 'SH-02' },
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
          description: 'SAR-2 Pair Resolved',
          params: {
            character: Character.SYSTEM,
            question: 'M-SAR2-SH opens at 06:30 and M-SAR2-GW at 06:32, both priority 1, and Fiona is outside from 06:29. One operator, two sites. How does the plan get flown?',
            options: [
              'Galway is armed on program-track before you leave it and flies its window unattended; Shetland has no unattended-pass sign-off yet, so its window is flown from this console',
              'Drop the Galway SAR-2 contact; one operator cannot fly both',
              'Fly Galway from here and let Shetland miss; the customer only cares about one of them',
              'Assign both to SH-02 so one pedestal takes them back to back',
            ],
            correctIndex: 0,
            explanation:
              'A site does not need an operator to track a pass it has been armed for; it needs one to notice when it does not. GW-01 has been signed off for unattended passes since acceptance. SH-02 went live four days ago and has not. That is the difference the plan has to respect.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 5 -> BEAT 1: SHETLAND SWEEP (FOUR CHECKS, REMOTE)
    // ============================================================
    {
      id: 'shetland-dashboard-sweep',
      nice: ['T0153', 'K0741', 'S0421'],
      title: 'SH-02 Dashboard Sweep',
      description: 'Select SH-02 in the asset tree and clear its board from here: confirm the active alarm state on Shetland.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['build-the-day-plan'],
      timeLimitSeconds: 90,
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
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Remote Board Read',
          params: {
            character: Character.SYSTEM,
            question: 'SH-02 shows no active alarms. What does a clean board on a remote site tell you, and what does it not?',
            options: [
              'Nothing in the alarm set is tripped; it says nothing about configuration, which is what the next three checks are for',
              'The site is ready to fly',
              'Fiona has already checked it, so the rest of the sweep can be skipped',
              'The equipment is powered and nothing more',
            ],
            correctIndex: 0,
            explanation:
              'An alarm is a threshold crossed. A modem on the wrong carrier, an analyzer on the wrong span, an antenna stowed the wrong way - none of those is an alarm, and any of them loses a pass.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'shetland-reference-check',
      nice: ['T0431', 'K0740'],
      title: 'SH-02 Reference Check',
      description: 'Shetland GPSDO locked and out of holdover. The GNSS antenna up there has been flaky in the wind all week.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-dashboard-sweep'],
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
          type: 'gpsdo-locked',
          description: 'SH-02 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'SH-02 GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'shetland-receive-chain',
      nice: ['T0431', 'K0773', 'K1032'],
      title: 'SH-02 Receive Chain',
      description:
        "Shetland's LNB on the 13100 MHz LO and thermally stable. Leave modem 1 on 1414 MHz - Fiona flies SAR-1 on it at 06:19 - and read her pass on the schedule while you are there.",
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-reference-check'],
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
          type: 'lnb-lo-set',
          description: 'SH-02 LNB LO 13100 MHz',
          params: { loFrequency: 13100 as MHz, loFrequencyTolerance: 0, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'SH-02 LNB Thermally Stable',
          params: { requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shetland Geometry Read',
          params: {
            character: Character.SYSTEM,
            question:
              "Same LNB, same 60 K. Fiona's SAR-1 pass peaks at 73 degrees and 409 km; Galway's peaks at 30 degrees and 716 km with about 11 dB of C/N. What should Shetland see at the top, before the pedestal has its say?",
            options: [
              'About 16 dB: 20 log(716 / 409) is 4.9 dB less path loss, and almost no atmosphere that steep',
              'About 11 dB: same bird, same hardware, same number',
              'About 8 dB: a steep pass is shorter, so the receiver has less time to integrate',
              'Nothing usable: 73 degrees is inside the keyhole',
            ],
            correctIndex: 0,
            explanation:
              'Range wins, and a site at 60 north gets more of these on a sun-synchronous bird than a site at 53. 73 degrees is still tracking on a 20 deg/s pedestal; the keyhole is the last few degrees to the zenith, and that is a later shift.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'shetland-transmit-chain',
      nice: ['T0431', 'K0740', 'S0421'],
      title: 'SH-02 Transmit Chain',
      description: 'Shetland BUC on the external reference and under 70 degrees, HPA output disabled. Cold, the right way, three hundred miles from the rack.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['shetland-receive-chain'],
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
          type: 'buc-reference-locked',
          description: 'SH-02 BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'buc-temperature-normal',
          description: 'SH-02 BUC Temperature Normal',
          params: { maxTemperature: 70, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'hpa-disabled',
          description: 'SH-02 HPA Output Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE STANDING COLLECT FROM GALWAY
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Back to GW-01. AOS 06:18 from azimuth 143. Program-track MERIDIAN-SAR-1 and confirm the beacon on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['shetland-transmit-chain'],
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
      points: 10,
    },
    {
      id: 'decode-the-standing-collect',
      nice: ['T0153', 'S0421', 'K0740'],
      title: 'Decode the Standing Collect',
      description: "Lock the 1414 MHz imagery downlink and hold C/N above 8 dB through the high segment, roughly 06:20:30 to 06:25. This is Erik's contact.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
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
          description: 'Delivery Standard Read',
          params: {
            character: Character.SYSTEM,
            question: 'C/N peaks near 11 dB at 06:22:47, 30 degrees, 716 km. Erik will ask whether the frames are "good". What is the technically honest answer?',
            options: [
              'Decoded with about 5 dB over the QPSK 3/4 threshold: the frames are clean, and at this margin there is no such thing as a partly decoded one',
              'Good but degraded: anything under 12 dB loses detail',
              'Unknown until Rotterdam processes them',
              'Marginal: 11 dB is close to the 8 dB delivery standard',
            ],
            correctIndex: 0,
            explanation:
              'Digital links are a cliff, not a slope. Above threshold the frames are the frames; below it there are none. 8 dB is the delivery standard because it leaves 2 dB for weather and pointing, not because 8 dB frames look different from 11 dB ones.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 4/5: ARM GALWAY, TAKE SHETLAND
    // ============================================================
    {
      id: 'arm-galway-for-sar2',
      nice: ['S0421', 'K0645', 'T0129'],
      title: 'Arm Galway for SAR-2',
      description:
        'Galway flies its 06:32 SAR-2 window without you. Before you leave the console: modem 1 to the 1370 MHz SAR-2 carrier, program-track with MERIDIAN-SAR-2 as the target. The pedestal acquires on its own at AOS.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-the-standing-collect'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Armed',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Unattended Pass Understood',
          params: {
            character: Character.SYSTEM,
            question: 'What does an unattended pass need from you before you leave the console, and what can it not do for itself?',
            options: [
              'Receiver on the right carrier and program-track on the right target; it cannot notice a bad number, so you check it the moment you are back',
              'Nothing: the scheduler configures the station from the contact plan',
              'A recording started on the modem, so the frames are kept while nobody watches',
              'Step-track enabled, so the pedestal can find the bird without elements',
            ],
            correctIndex: 0,
            explanation:
              'The contact plan allocates; it does not configure. Program-track on current elements does not need an operator to acquire. What it needs is one to look at the C/N afterwards and decide whether the pass counts.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'take-the-shetland-console',
      nice: ['S0421', 'K0773', 'T0129'],
      title: 'Take the Shetland Console',
      description:
        'Fiona sets at 06:29 and goes outside. Select SH-02: retune modem 1 from her 1414 MHz SAR-1 carrier to 1370 MHz for SAR-2 and put the analyzer on the SAR-2 beacon, 1397 MHz. AOS 06:30 from azimuth 011.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['arm-galway-for-sar2'],
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
          type: 'rx-modem-frequency-set',
          description: 'SH-02 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'SH-02 Analyzer Centre 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: MERIDIAN-SAR-2 FROM SHETLAND
    // ============================================================
    {
      id: 'acquire-sar2-from-shetland',
      nice: ['S0421', 'K1032'],
      title: 'Acquire SAR-2 from Shetland',
      description: 'Program-track MERIDIAN-SAR-2 on the SH-02 pedestal and confirm its imagery carrier on Shetland’s RX analysis once it clears the mask.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['take-the-shetland-console'],
      conditions: [
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
          description: 'MERIDIAN-SAR-2 Downlink on the Shetland Analyzer',
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
      id: 'decode-sar2-from-shetland',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Decode SAR-2 from Shetland',
      description:
        'Lock the 1370 MHz carrier on the SH-02 modem and hold C/N above 7 dB through culmination, 23 degrees at 06:34:38 and 879 km; the peak is about 9.7 dB, a decibel under what Galway gets from the same bird. Galway is flying it two minutes behind you.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 7 dB',
          params: { modemNumber: 1, minCNRatio: 7, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Unattended Check Planned',
          params: {
            character: Character.SYSTEM,
            question: 'Galway has been tracking SAR-2 on its own since 06:32. When you get back to its console, what tells you whether its pass counted?',
            options: [
              'The pedestal still program-track locked on SAR-2 and the modem locked with C/N over threshold, read on the console while the bird is still up',
              'The contact plan showing M-SAR2-GW as assigned',
              'The absence of an alarm on the Galway dashboard',
              'Nothing until Rotterdam confirms the frames',
            ],
            correctIndex: 0,
            explanation: 'Assigned is a plan. Locked with a number is a pass. Galway sets at 06:41; the check has to happen before that or it is a guess.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 4: BACK TO GALWAY, REPORT
    // ============================================================
    {
      id: 'check-the-unattended-pass',
      nice: ['T0153', 'T0431', 'K0740'],
      title: 'Check the Unattended Pass',
      description:
        'Shetland sets at 06:39. Select GW-01 while SAR-2 is still up (until 06:41): the pedestal should be program-track locked on it and the modem locked with C/N above 6 dB on the way down.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2-from-shetland'],
      conditions: [
        {
          type: 'ground-station-selected',
          hidden: true,
          description: 'GW-01 Selected',
          params: { groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Still Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 6 dB',
          params: { modemNumber: 1, minCNRatio: 6, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'customer-status',
      nice: ['S0478', 'T1580', 'K0645'],
      title: 'Customer Status',
      description: 'Close the morning with Erik and write it into the report: what was captured, what is committed, what is best-effort.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['check-the-unattended-pass'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Status Reported to Erik',
          params: {
            character: Character.SYSTEM,
            question: 'Erik asks whether his 06:18 collect was captured and what the day looks like. What do you report?',
            options: [
              'The collect decoded with margin; both SAR-2 windows were worked, one from each site; the second-orbit contacts are best-effort.',
              'The collect decoded; every contact on the board is guaranteed from Galway alone.',
              'The collect was captured, but the SAR-2 windows were dropped because both sites were busy.',
              'The collect decoded at 11 dB C/N with 5 dB of margin over the QPSK 3/4 threshold.',
            ],
            correctIndex: 0,
            explanation:
              'Report what was captured, what is committed, and what is best-effort. Erik does not need the C/N numbers; he needs to know what he can count on. The numbers go in the report, for the people who do.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '06:18Z MERIDIAN-SAR-1 GW-01: decoded for NMW, peak C/N ~11 dB at 30 deg. 06:19Z MERIDIAN-SAR-1 SH-02 (F. MacLeod): 73 deg, worked. 06:30Z MERIDIAN-SAR-2 SH-02 (remote from GW-01): decoded, peak C/N ~9.7 dB at 23 deg. 06:32Z MERIDIAN-SAR-2 GW-01 (unattended, checked 06:38): tracking, locked. Second-orbit contacts best-effort. Customer status sent 06:42.',
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
        <em>[Text message from Erik Halvorsen at 05:52]</em>
      </p>
      <p>
        "Morning. Standing collect on the 06:18 SAR-1 window, same as every day this week. I have a vessel track that depends on it. I do not need the details - just tell me it's covered."
      </p>
      `,
      character: Character.ERIK_HALVORSEN,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'shetland-dashboard-sweep': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 06:07]</em>
        </p>
        <p>
          "On console since half five and I've not touched the equipment, so what your console shows for my site is what I've got. I'll take the seventy-three at 06:19 myself - I want eyes on the pedestal through the top - and then I'm outside on the heater cable till seven. The half-past SAR-2 is yours from there. Modem's on 1414 for mine; don't move it till I'm off."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'decode-the-standing-collect': {
        text: `
        <p>
          Got the frames. Vessel is where I thought it was. Same time tomorrow?
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'take-the-shetland-console': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 06:29]</em>
        </p>
        <p>
          "Off. Seventy-three degrees and it never wobbled - sixteen and a bit at the top, for the record. Modem's still on 1414. Console's yours; SAR-2 is up in a minute from the north. Don't be gentle with it."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'check-the-unattended-pass': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 06:38]</em>
        </p>
        <p>
          "Mine decoded from three hundred miles away and yours flew itself. Watched Galway's dish move on the site camera from the car park. Two sites, one of you. That's the network."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'customer-status': {
        text: `
        <p>
          That's what I needed. Two sites covering the morning and a straight answer on the rest. I'll take best-effort on the second orbit as long as nobody calls it guaranteed. Thanks - talk tomorrow.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
