import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 *                            az 355), 9.5 min, northbound. Peak C/N ~11.5-12 dB.
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
 * C/N peaks ~11.5-12 dB at 25-30 deg max elevation under real program-track. No faults.
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
  imageUrl: 'nats-eu/9/card.png',
  number: 9,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario8'],
  title: 'Morning Constellation',
  subtitle: 'Network Health & Daily Pass Plan',
  duration: '35 min',
  missionType: 'Network Operations',
  description: `06:00 local. First qualified shift: two sites, two satellites, six contacts on the board, and nobody to hand you the plan.<br><br>Erik Halvorsen at Nordic Maritime Watch has a standing collect on the 06:18 MERIDIAN-SAR-1 window, and he wants to know it's covered. Fiona is on the SH-02 console for her 73 degree pass, then she's outside working on the feed heater. That makes the Shetland SAR-2 window at 06:30 yours to fly remotely, at the same time as Galway's own.<br><br>Sweep both sites before the first window, build the day plan, and fly the collect. Then arm Galway to fly its second window on its own, take Shetland's from here, and tell Erik what he can count on.`,
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
      description: 'Open the brief and confirm the six contacts, who flies what, and the health checks for both sites. P1 to P3 are the contact priorities, with P1 the highest.',
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
            question: 'There are six contacts and two sites. What must be true before you publish the plan to Fiona?',
            options: [
              'No site is double-booked and every P1 and P2 contact is assigned to a station.',
              'Every contact on the board, including the P3 second-orbit passes, is assigned to Galway.',
              'Both sites are assigned to the same contact so there is a backup.',
              'Every contact is assigned to the site with the higher maximum elevation.',
            ],
            correctIndex: 0,
            explanation:
              "Overlapping contacts go to different sites, because one site can't track two satellites at once. Every P1 and P2 contact needs a station, and the P3 passes are yours to keep or drop. The first window opens in about eighteen minutes.",
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
      description: 'Start with the Galway board. Open the dashboard and confirm which alarms are active on GW-01.',
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
            question: "What's the active alarm state on GW-01 as the shift starts?",
            options: [
              'Receive AGC on noise only: no carrier on an empty sky, no alarm',
              'No active alarms: every system nominal and the board clear',
              'GPSDO in holdover: a reference alarm putting pass timing at risk',
              'Antenna drive fault: a hardware alarm with the pedestal down',
            ],
            correctIndex: 0,
            explanation:
              "The AGC, the receiver's automatic gain control, warns of no carrier because nothing is in the beam, so it isn't a fault. The evening shift left the hardware healthy but the receiver tuned to the wrong satellite, and the next three checks sort out which is which.",
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
      description:
        "Confirm the GPSDO, the GPS-disciplined oscillator that is the site's clock reference, is locked and out of holdover. Every local oscillator in the rack keys off it, so check it before the plan commits the site to anything.",
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
        "Confirm the LNB's local oscillator is on 13100 MHz and the LNB is thermally stable. The evening shift left modem 1 on the 1370 MHz SAR-2 carrier, so retune it to 1414 MHz for the 06:18 SAR-1 collect. Then put the analyzer on the SAR-1 beacon at 1389 MHz with a 2 MHz span.",
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
      description:
        'No uplink is tasked today, so confirm the transmit chain is cold the right way. The BUC, the block upconverter, should be on the external reference and drawing normal current. The HPA, the high-power amplifier, should have its output disabled.',
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
            question: 'This is a receive-only shift. Which transmit-chain state counts as "cold" for a site that might be tasked later today?',
            options: [
              'Modem off air, HPA output disabled, BUC muted: everything still powered and on the reference so it can come up in order',
              'HPA output enabled with the modem off, BUC unmuted: the chain is ready the moment a command arrives, with no carrier up',
              'BUC and HPA powered off entirely, modem off air: nothing draws power or warms the feed until tasking comes in',
              'Modem off air, HPA output enabled, BUC muted: the mute is the only barrier needed, and the HPA stays warm for tasking',
            ],
            correctIndex: 0,
            explanation:
              "Cold isn't the same as off. An HPA that's enabled with nothing driving it amplifies the noise floor into the feed, and a chain that was powered down needs a reference lock and a warm-up before anyone can trust it. So the right state is powered, locked and disabled.",
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
        "Assign the morning's contacts to GW-01 and SH-02 without double-booking either site. The two P3 second-orbit contacts are your call. The plan badge has to read DECONFLICTED.",
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
            question:
              "M-SAR2-SH opens at 06:30 and M-SAR2-GW at 06:32. Both are priority 1, and Fiona is outside from 06:29. You're one operator with two sites, so how does the plan get flown?",
            options: [
              'Galway is armed on program-track and flies unattended; Shetland has no unattended sign-off yet, so you fly it from here',
              "Drop the Galway SAR-2 contact from the plan, because one operator can't fly both sites and Shetland is the one Fiona can't cover",
              'Fly Galway from here and let Shetland miss its window, because the customer has one collect on the board and one site covers it',
              'Assign both contacts to SH-02 in the plan, because one pedestal takes them back to back and its console is the one in front of you',
            ],
            correctIndex: 0,
            explanation:
              "A site doesn't need an operator to track a pass it's armed for, but it does need one to notice when the track goes wrong. GW-01 has been signed off for unattended passes since acceptance. SH-02 went live four days ago and hasn't been. The two windows overlap, so one site can't take both, and the plan has to respect that difference.",
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
      description: 'Select SH-02 in the asset tree and open its dashboard from here. Confirm which alarms are active on Shetland.',
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
            question:
              "SH-02 shows one warning, the receive AGC on noise with no carrier, and nothing else. What does that board tell you about a remote site, and what doesn't it?",
            options: [
              'No alarm is tripped, and the AGC no-carrier warning is just empty sky; it says nothing about configuration',
              'The site is ready to fly and the receiver is on the carrier; it says nothing about whether the pedestal is armed',
              'Fiona has already checked it and left it configured; it says nothing that the rest of the sweep would add',
              'The equipment is powered and the reference is locked; it says nothing about whether the receive chain has a fault',
            ],
            correctIndex: 0,
            explanation:
              "Configuration is what the next three checks are for. An alarm is a threshold being crossed, and an AGC levelling out on noise with nothing in the beam is behaving normally. A modem on the wrong carrier, an analyzer on the wrong span or an antenna stowed the wrong way isn't an alarm, but any of them can lose a pass.",
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
      description: 'Confirm the Shetland GPSDO is locked and out of holdover. Its GNSS antenna has been flaky in the wind all week, so read the lock state rather than assume it.',
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
        "Confirm the Shetland LNB's local oscillator is on 13100 MHz and the LNB is thermally stable. Leave modem 1 on 1414 MHz, because Fiona flies SAR-1 on it at 06:19, and read her pass on the schedule while you're there.",
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
              "It's the same LNB at the same 60 K. Fiona's SAR-1 pass peaks at 73 degrees and 409 km, while Galway's peaks at 30 degrees and 716 km with about 12 dB of C/N. What should Shetland see at the top, assuming the pedestal tracks cleanly?",
            options: [
              'About 17 dB: 20 log(716 / 409) is 4.9 dB less path loss, and very little atmosphere at that elevation',
              'About 12 dB: same satellite, same LNB and same 60 K, so the same number at any elevation',
              'About 8 dB: a steep pass is shorter, so the receiver has less time to integrate the carrier',
              'Nothing usable: 73 degrees is inside the keyhole, so the pedestal loses the satellite at the top of the pass',
            ],
            correctIndex: 0,
            explanation:
              "Range wins: the shorter path costs 4.9 dB less, and a steep pass crosses less atmosphere. A site at 60 north also gets more passes of a sun-synchronous satellite than a site at 53. At 73 degrees the pedestal is still tracking, since it turns at up to 10 degrees a second. The keyhole, where the pedestal can't turn fast enough near the zenith, is the last few degrees, and that's a later shift.",
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
      description:
        "Confirm the Shetland BUC is on the external reference and under 70 degrees, with the HPA output disabled. That's the same cold chain as Galway's, checked from a console away from the rack.",
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
      description:
        'Go back to GW-01. AOS, the moment the satellite rises, is 06:18 at azimuth 143. Turn on program-track for MERIDIAN-SAR-1 and confirm its beacon on the RX Analysis tab.',
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
      description: "Lock modem 1 on the 1414 MHz imagery downlink and keep C/N above 8 dB through the high part of the pass, roughly 06:20:30 to 06:25. This is Erik's contact.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Delivery Standard Read',
          params: {
            character: Character.SYSTEM,
            question: 'C/N peaks near 12 dB at 06:22:47, when the satellite is at 30 degrees and 716 km. Erik will ask whether the frames are "good". What\'s the accurate answer?',
            options: [
              'Decoded with about 8 dB over the QPSK 3/4 threshold, so the frames are clean with no partial ones',
              'Good but degraded: anything under 14 dB loses detail, so at 12 dB the frames are usable but not at full quality',
              "Unknown until Rotterdam reports back: the station only sees C/N, so it can't tell whether any frames decoded",
              'Marginal: 12 dB is close to the 8 dB delivery standard, so the frames are in but a fade would have cost them',
            ],
            correctIndex: 0,
            explanation:
              'A digital link is a cliff, not a slope: above the threshold the frames decode cleanly, and below it you get none. The 8 dB delivery standard sits nearly 4 dB over the 4.2 dB threshold to leave room for weather and pointing, not because 8 dB frames look different from 12 dB ones.',
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
        'Galway will fly its 06:32 SAR-2 window without you. Before you leave the console, retune modem 1 to the 1370 MHz SAR-2 carrier and set program-track with MERIDIAN-SAR-2 as the target. The pedestal then acquires the satellite on its own when it rises.',
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
            question: "What does an unattended pass need from you before you leave the console, and what can't it do for itself?",
            options: [
              "Receiver on the right carrier and program-track on the right target; it can't notice a bad number, so you check on return",
              "Nothing before you leave; the scheduler configures the station from the contact plan, but it can't start the modem recording",
              "A recording started on the modem so the frames are kept; it can't lock the pedestal, so program-track is left to the scheduler",
              "Step-track enabled so the pedestal finds the satellite without elements; it can't judge C/N, so the number is read on return",
            ],
            correctIndex: 0,
            explanation:
              "The contact plan decides who flies what, but it doesn't configure the station. Program-track on current orbital elements, the satellite's predicted position, doesn't need an operator to acquire. What the pass needs is someone to look at the C/N afterwards and decide whether it counts.",
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
        'Fiona hands over when SAR-1 sets at Shetland, around 06:29, and then goes outside. Select SH-02, retune modem 1 from her 1414 MHz SAR-1 carrier to 1370 MHz for SAR-2, and put the analyzer on the SAR-2 beacon at 1397 MHz. SAR-2 rises at 06:30 from azimuth 011. Your three minutes start when SAR-1 sets at Shetland, not before.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['arm-galway-for-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Pass Over at Shetland (LOS)',
          params: { noradId: 61701, phase: 'set' },
          mustMaintain: false,
        },
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
      description:
        'Turn on program-track for MERIDIAN-SAR-2 on the SH-02 pedestal, and confirm its 1397 MHz beacon on the analyzer you centred on it. The beacon shows once the satellite clears the elevation mask, the lowest angle the pedestal will track.',
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
          description: 'MERIDIAN-SAR-2 Beacon on the Shetland Analyzer',
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
      id: 'decode-sar2-from-shetland',
      nice: ['T0153', 'K0740', 'K1032'],
      title: 'Decode SAR-2 from Shetland',
      description:
        'Lock the 1370 MHz carrier on the SH-02 modem and keep C/N above 7 dB through culmination, the highest point of the pass: 23 degrees at 06:34:38 and 879 km. The peak is about 10 dB, a couple of decibels under the SAR-1 pass at Galway, because this pass is lower and farther away. Galway is flying the same satellite two minutes behind you.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['acquire-sar2-from-shetland'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'SH-02 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SH-02 C/N Above 7 dB',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', minCNRatio: 7, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Unattended Check Planned',
          params: {
            character: Character.SYSTEM,
            question: "Galway's own SAR-2 pass starts at 06:32, with no operator at the console. When you go back to it, what tells you whether the pass counted?",
            options: [
              'The pedestal still program-track locked on SAR-2 and the modem locked over threshold, read while the satellite is up',
              'The contact plan showing M-SAR2-GW as assigned to Galway and the window closed, read after the satellite has set',
              'The absence of an alarm on the Galway dashboard and the AGC no-carrier warning cleared, read while the satellite is up',
              'The processing confirmation from Rotterdam and the frame count it reports, read after the satellite has set',
            ],
            correctIndex: 0,
            explanation:
              "Assigned is only a plan, while locked with a good C/N number is a pass. Galway's window closes at 06:41, so the check has to happen before then, or the answer is only a guess.",
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
        'SAR-2 sets at Shetland at 06:39. Select GW-01 while SAR-2 is still above Galway, until 06:41, and check that the pedestal is program-track locked on it and the modem is locked with C/N above 6 dB on the way down.',
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
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', minCNRatio: 6, requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: 'Answer Erik and write it into the report: what was captured, what is committed, and what is best-effort.',
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
              'The collect decoded with margin; both SAR-2 windows were worked, one per site; second-orbit contacts are best-effort.',
              'The collect decoded; every contact on the board is committed from Galway alone; the second-orbit contacts are guaranteed.',
              'The collect was captured; both SAR-2 windows were dropped because both sites were busy; the second orbit will cover them.',
              'The collect decoded at 12 dB C/N; the margin over the QPSK 3/4 threshold was about 8 dB; the SAR-2 windows decoded as well.',
            ],
            correctIndex: 0,
            explanation:
              "Report what was captured, what's committed and what's best-effort, because that tells Erik what he can count on. He doesn't need the C/N numbers; they go in the report for the people who do. Best-effort means you'll try but won't promise, which is why the second orbit can't be called guaranteed.",
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '06:18Z MERIDIAN-SAR-1 GW-01: decoded for NMW, peak C/N about 12 dB at 30 deg. 06:19Z MERIDIAN-SAR-1 SH-02 (F. MacLeod): 73 deg, worked. 06:30Z MERIDIAN-SAR-2 SH-02 (remote from GW-01): decoded, peak C/N about 10 dB at 23 deg. 06:32Z MERIDIAN-SAR-2 GW-01 (unattended, checked {{at:obj:check-the-unattended-pass|06:38}}): tracking, locked. Second-orbit contacts best-effort. Customer status sent.',
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
        "Morning. The standing collect is on the 06:18 SAR-1 window, same as every day this week, and I've got a vessel track that depends on it. I don't need the details. Just tell me it's covered."
      </p>
      `,
      character: Character.ERIK_HALVORSEN,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/intro.mp3'),
    },
    objectives: {
      'shetland-dashboard-sweep': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod]</em>
        </p>
        <p>
          "I've been on console since half five and haven't touched the equipment, so what your console shows for my site is what I've got. I'll fly the seventy-three degree pass at 06:19 myself, because I want eyes on the pedestal through the top. Then I'm outside at the pedestal with a torch, finishing the feed heater cable, until seven. The half-past SAR-2 is yours from there. Modem's on 1414 for mine, so don't move it till I'm off."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/obj-shetland-dashboard-sweep.mp3'),
      },
      'decode-the-standing-collect': {
        text: `
        <p>
          I've got the frames, and the vessel is where I thought it was. That window was the only chance to see it, so thank you for holding the lock.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/obj-decode-the-standing-collect.mp3'),
      },
      'take-the-shetland-console': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod]</em>
        </p>
        <p>
          "Off. My seventy-three degrees held all the way over, and the top read seventeen dB, for the record. I left the modem on 1414 and I see you've already moved it. The console's yours, and SAR-2 rises from the north at 06:30, so get program-track on it. Don't be gentle with it."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/obj-take-the-shetland-console.mp3'),
      },
      'check-the-unattended-pass': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod]</em>
        </p>
        <p>
          "You decoded SAR-2 from my site, and then you went and looked at Galway's pedestal and C/N, which is the only way to know that pass counted. Two sites, one operator: that's the network."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/obj-check-the-unattended-pass.mp3'),
      },
      'customer-status': {
        text: `
        <p>
          That's what I needed: the morning's collect in hand, and SAR-2 covered across two sites, and a straight answer on the rest of the day. I'll take best-effort on the second orbit, as long as nobody calls it guaranteed, because I plan around what you tell me. Thanks, talk tomorrow.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/9/obj-customer-status.mp3'),
      },
    },
  },
};
