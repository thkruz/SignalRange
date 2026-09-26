import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, createMeridianSar3, MERIDIAN_SAR3_BEACON_RF_HZ, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 11 - "LEOP: Launch Day" / SAR-3 First Acquisition (arc 1/2)
 *
 * M4 in its LEOP form. MERIDIAN-SAR-3 separated 84 minutes before the shift
 * starts and GW-01 is the first commercial station on its ground track. The
 * bird boots on the launch provider's coarse injection estimate
 * (`spaceEvents[].initialTle`, re-applied on every load so replays keep the
 * puzzle); the refined set from the first ranging arc arrives as `newTle` 45 s
 * after the brief closes (`maneuverAtS` runs on the mission clock, which
 * `freezesScenarioTimer` pauses during the brief). Phase 16 rewrite: the
 * readiness review is a station sweep (board, reference, ACU beacon plan,
 * analyzer framed for a beacon search, uplink confirmed cold), the elements
 * are loaded and the refined pass read back, then the acquisition is done as
 * analyzer work - wide span to find the tone, narrow RBW to read it, the
 * Doppler sign as proof it is the right bird - and the state of health goes
 * into the LEOP log one item at a time. No commanding on this pass: the flight
 * rules say beacon then SOH, nothing else, and there is no `commanding` block
 * to tempt anyone.
 *
 * Clock starts 2027-03-22 08:50:00 UTC (moved 10 min earlier in phase 16 so
 * the TRR fits). All three birds are scenario-local (satellites.ts
 * factories); SAR-3 is the first use of `createMeridianSar3`.
 *
 * Pass timeline (scripts/author-passes.mjs, verify-only, epoch 08:50:00Z):
 *
 *   MERIDIAN-SAR-3 refined (newTle):
 *     AOS T+18.97 (09:08:58Z, az 143), max el 31.6 deg at T+23.74 (09:13:44Z,
 *     696 km slant range), LOS T+28.55 (09:18:33Z, az 353), 9.6 min,
 *     northbound. Second pass 10:40:49Z (17.8 deg).
 *   MERIDIAN-SAR-3 coarse injection set (initialTle):
 *     AOS T+18.50 (09:08:30Z, az 142), max el 30.3 deg at T+23.27 (719 km),
 *     LOS T+28.04 (az 354). The injection estimate predicts the bird 28 s
 *     EARLY; the refined set moves AOS ~30 s later and the ground track
 *     ~0.3 deg of RAAN east.
 *   MERIDIAN-SAR-1: AOS 09:47:59Z, max el 25.1, LOS 09:57:27Z (present, not worked)
 *   MERIDIAN-SAR-2: AOS 10:06:01Z, max el 25.1, LOS 10:15:22Z (present, not worked)
 *
 * Ephemeris design: `initialTle` is `newTle` with RAAN +0.3 deg and mean
 * anomaly +2.0 deg; line 2 checksum recomputed (...123457). Since phase 16
 * the station's prediction and the spacecraft's orbit are separate
 * (`OrbitalSatellite.predictionSatellite`): at `maneuverAtS` the bird moves to
 * the refined orbit while program-track and the Pass Schedule keep the
 * injection set until Load Updated Ephemeris. Two degrees of mean anomaly is
 * 250 km along-track, so a pass flown on the injection set would not see the
 * beacon at all. The checklist orders the load before AOS; the physics now
 * agrees with it.
 *
 * Beacon frequency: GW-01 boots with the ACU beacon field on SAR-1's 11711 MHz.
 * The TRR asks for SAR-3's 11785 MHz. Typing it on the ACU tab or picking
 * SAR-3 as the program-track target (which copies the target's beacon
 * frequency into the field) both satisfy it; either is the operator
 * configuring the station for a bird it has never seen.
 *
 * SAR-3 RF plan (distinct from SAR-1/2 so the operator has to read the LEOP
 * card): video 11760 MHz (IF 1340, QPSK 3/4, 36 MHz, 28 dBm), telemetry beacon
 * 11785 MHz CW (IF 1315), TT&C uplink 14065 MHz (IF 1465), transponded
 * downlink 11810 MHz. Same 360 km / mm 15.6 orbit, so the S1 RF envelope holds.
 * The RX modem stays on SAR-1's 1414 MHz: the payload is not powered until
 * commissioning (S12), and no decode is called for.
 *
 * Staged state (scenario-local clone): BUC muted. LEOP flight rule: the
 * uplink is cold and stays cold.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0513: Supervise or manage protective or corrective measures when an incident is identified
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T1138: Perform system reconfiguration
 *
 * Supporting Codes:
 *   - K0645: Knowledge of mission-relevant capabilities
 *   - S0630: Skill in performing test readiness reviews
 *   - S0421: Skill in operating network equipment
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - K0740: Knowledge of system performance indicators
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T1611: Report system status
 *   - S0842: Skill in recording operational events
 */

/** MERIDIAN-SAR-3 (61703) refined element set: the first ranging arc (newTle). */
const SAR3_S11_REFINED_TLE: MeridianTle = {
  tle1: '1 61703U 27031A   27081.37500000  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61703  97.6000 328.0000 0010000  90.0000 272.0000 15.60000000123452' as TleLine2,
};

/**
 * MERIDIAN-SAR-3 (61703) coarse injection estimate (initialTle): the refined
 * set with RAAN +0.3 deg and mean anomaly +2.0 deg, checksum recomputed.
 */
const SAR3_S11_INJECTION_TLE: MeridianTle = {
  tle1: '1 61703U 27031A   27081.37500000  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61703  97.6000 328.3000 0010000  90.0000 274.0000 15.60000000123457' as TleLine2,
};

/** MERIDIAN-SAR-1 (61701) element set at the S11 epoch (next pass 09:48). */
const SAR1_S11_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27081.37500000  .00001000  00000-0  10000-3 0  9998' as TleLine1,
  tle2: '2 61701  97.2000 139.7500 0010000  90.0000 191.7500 15.60000000123450' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) element set at the S11 epoch (next pass 10:06). */
const SAR2_S11_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27081.37500000  .00001000  00000-0  10000-3 0  9999' as TleLine1,
  tle2: '2 61702  98.4000 120.7500 0010000  90.0000 118.0000 15.60000000123451' as TleLine2,
};

const meridianSar1S11 = createMeridianSar1(SAR1_S11_TLE);
const meridianSar2S11 = createMeridianSar2(SAR2_S11_TLE);
const meridianSar3S11 = createMeridianSar3(SAR3_S11_REFINED_TLE);

/** GW-01 under LEOP flight rules: BUC muted, uplink cold. Deep clone, never spread. */
const galwayLeop: GroundStationConfig = structuredClone(galwayGroundStation);
galwayLeop.rfFrontEnds[0].buc = { ...galwayLeop.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario11Data: ScenarioData = {
  id: 'nats-eu-scenario11',
  url: 'nats-eu/scenarios/nats-eu-scenario11',
  imageUrl: 'nats/11/card.png',
  number: 11,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario10'],
  title: 'LEOP: Launch Day',
  subtitle: 'SAR-3 First Acquisition',
  duration: '30 min',
  missionType: 'Launch and Early Orbit',
  description: `08:50 local. MERIDIAN-SAR-3 separated from the upper stage 84 minutes ago and nobody on the ground has heard from her yet.<br><br>Rotterdam's only element set is the launch provider's injection estimate, quoted with a 20 s along-track uncertainty. A refined set from the first ranging arc is due on your console any minute. GW-01 is the first commercial station on her ground track, AOS in about nineteen minutes.<br><br>Anneke is LEOP lead. She wants a test readiness review, the refined elements loaded before AOS, the beacon found and read on the analyzer, and a state-of-health call built one line at a time. Nothing goes up on this pass.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Pass Schedule Console (ephemeris status)',
    'Ku-Band RF Front End (LNB LO 13100 MHz)',
    'Spectrum Analyzer (1315 MHz beacon IF)',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayLeop],
    satellites: [meridianSar1S11, meridianSar2S11, meridianSar3S11],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-22',
    scenarioStartWallTime: '08:50:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-11?content-only=true&dark=true',

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
      title: 'SAR-3 LEOP Log',
      description: 'First-acquisition record for Rotterdam. Sections: Readiness, State of Health, Close-out.',
    },

    // M4 - the injection estimate and the refined set. maneuverAtS is mission
    // clock seconds, so the refined set reaches the console 45 s after the
    // brief closes; the ephemeris panel shows STALE and the operator loads it.
    spaceEvents: [
      {
        id: 'SAR3-INJ',
        satelliteNoradId: 61703,
        maneuverAtS: 45,
        label: 'SAR-3 refined elements (first ranging arc)',
        initialTle: SAR3_S11_INJECTION_TLE,
        newTle: SAR3_S11_REFINED_TLE,
      },
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K1032'],
      title: 'Read the LEOP Card',
      description: "Open the LEOP card. It has the SAR-3 frequency plan, the injection set's stated uncertainty, and the flight rules for this pass.",
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'LEOP Card Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Acquisition Risk Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The injection set has a stated 1-sigma along-track error of 20 s. Your beam is 0.45 deg wide. What does that mean for acquisition?',
            options: [
              'At AOS the bird can be a few degrees from prediction. Refined elements before the pass, or a beacon search wider than the beam, are needed.',
              'At AOS the bird is inside the pass window. 20 s is well inside the pass duration, so program-track will find her somewhere in it.',
              'The beacon frequency is uncertain by the same amount. A wider receiver bandwidth on the modem, or a wider analyzer span, is needed.',
              'Step-track will pull the pedestal onto her. Once she is within a beamwidth the ACU takes over, so no change to the elements is needed.',
            ],
            correctIndex: 0,
            explanation:
              'A LEO bird moves about 7.5 km every second; 20 s along-track at 700 km range is several beamwidths of pointing error. Either the elements get better before AOS, or the search does. LEOP clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: THE READINESS REVIEW AS A SWEEP
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'A new spacecraft starts with the board read. Confirm the active alarm state on GW-01.',
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
            question: 'What is the active alarm state on GW-01 as the LEOP card opens?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for LEOP',
              'GPSDO in holdover - reference alarm, timing at risk for the pass',
              'Antenna drive fault - hardware alarm, pedestal down for the pass',
            ],
            correctIndex: 0,
            explanation:
              'The AGC rail is empty sky, not a fault. On a new spacecraft every anomaly will be blamed on the bird first; the board is how you prove it was not the station.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'reference-check',
      nice: ['T0431', 'K0740', 'S0630'],
      title: 'Reference Check',
      description: 'GPSDO locked and out of holdover. Rotterdam wants the reference state on the readiness line, and the pass will show you why.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
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
        {
          type: 'status-check',
          description: 'Reference as Evidence',
          params: {
            character: Character.SYSTEM,
            question: 'Why does the LEOP card want the GW-01 reference status recorded before the pass, on a receive-only contact?',
            options: [
              'The Doppler curve is SOH evidence: a reference error at the station looks exactly like a frequency error on the bird',
              'The uplink needs it: if the flight rules change mid-pass, a command goes up on the reference the card has recorded',
              'It is a formality: the reference does not affect a receive-only contact, but the card has a line for it either way',
              'The pass planner needs it: the AOS time-tag comes from the GPSDO, so the log has to show which clock it came from',
            ],
            correctIndex: 0,
            explanation:
              'The reference has to be on record before the measurement counts. A beacon 20 kHz off frequency on a new bird is either her transmitter or your LNB LO. With the GPSDO disciplined and logged, it is hers, and Rotterdam can act on it. Without the log line, nobody can say.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'test-readiness',
      nice: ['S0630', 'T0513'],
      title: 'Test Readiness Review',
      description:
        "Configure the station for a bird it has never seen: set the ACU beacon frequency to SAR-3's telemetry beacon (11785 MHz), then close the TRR checklist into the log.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-beacon-frequency-set',
          description: 'ACU Beacon Frequency 11785 MHz',
          params: { beaconFrequency: MERIDIAN_SAR3_BEACON_RF_HZ },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'TRR Checklist Closed',
          params: {
            character: Character.SYSTEM,
            question: 'TRR for a first acquisition. Which line set below is the one that goes in the LEOP log?',
            options: [
              'Beacon 11785 MHz on the ACU, reference disciplined, injection set loaded and flagged as provisional, uplink cold.',
              'Beacon 11711 MHz on the ACU, video IF 1414 MHz on the receiver, injection set loaded and flagged as provisional, uplink cold.',
              'Beacon 11785 MHz on the ACU, reference disciplined, TT&C uplink 14065 MHz keyed and ready to command, injection set loaded.',
              'Beacon 11785 MHz on the ACU, reference in holdover, refined set loaded and flagged as current, uplink cold.',
            ],
            correctIndex: 0,
            explanation:
              'SAR-3 has her own frequency plan; 11711 and 1414 are SAR-1. The uplink stays cold: no command goes up before SOH is confirmed. The refined set is not here yet, and the log says so.',
            pointPenalty: 5,
            documentSection: 'Readiness',
            documentLine: 'TRR complete 08:5x: ACU beacon 11785 MHz (SAR-3), GPSDO locked / no holdover, injection set loaded and flagged provisional, uplink cold.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'analyzer-on-the-beacon',
      nice: ['S0421', 'K0773'],
      title: 'Analyzer on the Beacon',
      description:
        'Frame the search. Centre the analyzer on the predicted beacon IF, 1315 MHz, with a 2 MHz span: wide enough to hold +/- 270 kHz of Doppler and a transmitter that has never been measured.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['test-readiness'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1315 MHz',
          params: { centerFrequency: 1315e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Search Span Read',
          params: {
            character: Character.SYSTEM,
            question: 'The analyzer boots at 60 MHz span, 1 MHz RBW, centred on 1414. Why not search for the beacon there?',
            options: [
              'At 60 MHz span a CW tone is one pixel over a 1 MHz noise bin, and 1315 is not even on screen; 2 MHz across 1315 shows the whole Doppler walk',
              'The analyzer cannot display anything below 1400 MHz at that span, and 1315 is off the low edge; 2 MHz across 1315 is the only way to reach it',
              'It would work at 60 MHz, and 1315 is inside the screen with 1 MHz RBW; 2 MHz across 1315 is a Rotterdam preference for the log',
              'The video carrier at 1340 would hide the beacon at that span, and 1315 sits under its skirt; 2 MHz across 1315 keeps 1340 off the screen',
            ],
            correctIndex: 0,
            explanation:
              'Span decides what you can see, RBW decides how well. At 2 MHz the tone stands clear of the floor. A first acquisition is a search: wide enough for the uncertainty, narrow enough that a 0 dBm CW tone is unmistakable. 2 MHz is both.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'uplink-cold-check',
      nice: ['T0431', 'K0645', 'S0630'],
      title: 'Uplink Cold Check',
      description:
        'Flight rule: nothing goes up. Confirm the transmit chain is cold - HPA output disabled, BUC muted, modem off air - and that it will stay that way for the whole pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['analyzer-on-the-beacon'],
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
          description: 'Flight Rule Read',
          params: {
            character: Character.SYSTEM,
            question: 'The link comes up clean and the uplink chain is right there. Which state satisfies "cold" for the flight rule?',
            options: [
              'Modem off air, BUC muted, HPA output disabled; all powered and on the reference, so the chain comes up in order on Wednesday',
              'BUC and HPA powered down, modem off air; nothing on the reference, so the chain gets a full warm-up and re-lock on Wednesday',
              'HPA enabled but the modem off, BUC muted; no carrier can go up, so the chain is ready the moment the Wednesday command arrives',
              'Doppler compensation off on the TT&C console, modem off air; no uplink can be tuned, so nothing can go up before Wednesday',
            ],
            correctIndex: 0,
            explanation: 'Cold is a defined state, not an absence. Every element idle, every element ready, and nothing that could radiate if somebody leaned on a switch.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'load-refined-elements',
      nice: ['T1138', 'K1032'],
      title: 'Load the Refined Elements',
      description: "Rotterdam's ranging solution replaces the injection estimate. When the ephemeris panel flags SAR-3 as STALE, load the refined set before AOS.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['uplink-cold-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Pass Schedule Tab Open',
          params: { tab: 'pass-schedule' },
          mustMaintain: false,
        },
        {
          type: 'ephemeris-updated',
          description: 'Refined Elements Loaded',
          params: { eventId: 'SAR3-INJ' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Origin Over Age',
          params: {
            character: Character.SYSTEM,
            question: 'The injection set is 84 minutes old and about 30 s wrong along-track. The refined set is twenty minutes old. Which matters more, the age or the origin?',
            options: [
              'Origin: one is a launch-provider estimate from separation, the other is a solution fitted to ranging; age grows the error of either',
              'Age: the younger set is always the better set, whatever produced it; a solution fitted an hour ago has had an hour of drag on it',
              'Neither: on a 0.45 degree beam the two sets are equivalent; 30 s along-track at 700 km is still inside the search the ACU runs',
              'Age: an element set older than an hour cannot be used for program-track; the injection set is out of date whatever its origin',
            ],
            correctIndex: 0,
            explanation:
              'A TLE is a fit to observations. The injection set is a fit to none; it is what the rocket said it did. Along-track error grows with age for both, which is why the refined set gets replaced again after this pass.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'read-the-refined-pass',
      nice: ['K1032', 'S0421'],
      title: 'Read the Refined Pass',
      description: 'With the refined set loaded, read the pass off the schedule: AOS time and azimuth, peak, LOS. Those are the numbers the SOH is measured against.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['load-refined-elements'],
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
          description: 'Refined Pass Read',
          params: {
            character: Character.SYSTEM,
            question: 'On the refined set, when and where does SAR-3 rise, and how high does she go?',
            options: [
              'AOS 09:08:59 at azimuth 143, 31.6 degrees at 09:13:44 and 696 km, LOS 09:18:33 toward 353',
              'AOS 09:08:30 at azimuth 142, 30.3 degrees at 09:13:16 and 719 km, LOS 09:18:02 toward 354',
              'AOS 09:08:59 at azimuth 143, 25.1 degrees at 09:13:44 and 696 km, LOS 09:18:33 toward 353',
              'AOS 09:08:59 at azimuth 353, 31.6 degrees at 09:13:44 and 696 km, LOS 09:18:33 toward 143',
            ],
            correctIndex: 0,
            explanation:
              'Thirty seconds later and a degree higher than the injection estimate said. Northbound, rising in the south-east. 25.1 degrees is the 09:48 pass, and that is SAR-1, who is not on the card.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: FIRST ACQUISITION AS ANALYZER WORK
    // ============================================================
    {
      id: 'first-acquisition',
      nice: ['T0513', 'S0421', 'K1032'],
      title: 'First Acquisition',
      description: 'AOS 09:08:59 from azimuth 143. Program-track MERIDIAN-SAR-3 on the refined set and find the beacon on the analyzer at 1315 MHz IF.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-refined-pass'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-3',
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
      points: 25,
    },
    {
      id: 'narrow-the-analyzer',
      nice: ['S0421', 'K0773', 'K1032'],
      title: 'Narrow the Analyzer',
      description: 'Tone found. Drop the resolution bandwidth to 10 kHz so the CW line is a line, and read which way it is walking.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-acquisition'],
      conditions: [
        {
          type: 'speca-rbw-set',
          description: 'RBW 10 kHz',
          params: { rbw: 10e3, frequencyTolerance: 1e3 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Doppler Sign Read',
          params: {
            character: Character.SYSTEM,
            question: 'The tone sits below 1315 MHz at IF and is sliding upward toward it. Is that SAR-3 approaching, and how do you know?',
            options: [
              'Yes: the high-side LNB LO inverts the spectrum, so an approaching bird sits BELOW nominal at IF, and the upward slide is the range rate falling',
              'No: an approaching bird is always above nominal, whatever the LO, so a tone below 1315 sliding upward is something receding',
              'Cannot tell: the analyzer shows a tone and a direction, but only the ACU knows the range rate, so the sign has to come from there',
              'Yes: a tone below nominal means a transmitter running slow, which is normal for a cold spacecraft, and the slide is her warming up',
            ],
            correctIndex: 0,
            explanation:
              'IF = LO - RF. Approach raises the RF and lowers the IF; as she climbs the shift shrinks and the tone rises through 1315 at culmination, then keeps rising as she recedes. A tone on the wrong side sliding the wrong way is not your bird.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acu-beacon-lock',
      nice: ['T0513', 'S0421', 'S0842'],
      title: 'ACU Beacon Lock',
      description: 'Confirm the ACU has beacon lock on 11785 MHz and record it. The pedestal seeing her in the beam centre is the first line of the state of health.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['narrow-the-analyzer'],
      conditions: [
        {
          type: 'antenna-beacon-locked',
          description: 'ACU Beacon Lock',
          params: { requiresObservation: true, observationTab: 'acu-control' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Lock Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'The ACU reports beacon LOCK under program-track. What does that add to the SOH that the tone on the analyzer did not?',
            options: [
              "The pedestal's own receiver sees the beacon at the centre of the beam: pointing, elements and transmitter all agree at once",
              'Nothing new: lock is a display of the same signal the analyzer shows, so pointing and elements are no better proven than before',
              'That the beacon is modulated with telemetry: the ACU tracks the subcarrier, so the transmitter is proven to be doing more than CW',
              'That the injection set was good enough after all: the pedestal found her on program-track, so the refined set was not needed',
            ],
            correctIndex: 0,
            explanation:
              'A tone on the analyzer alone could be a sidelobe. Three independent things agreeing is what "acquired" means. Rotterdam logs the lock time; it is the first timestamp in the spacecraft\'s commercial life.',
            pointPenalty: 5,
            documentSection: 'State of Health',
            documentLine: 'SOH 1: ACU beacon lock on 11785 MHz under program-track on the refined set; pointing, elements and transmitter agree.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'beacon-level',
      nice: ['T1611', 'S0842', 'K0740'],
      title: 'Beacon Level',
      description:
        'Read the beacon level on RX analysis near culmination (09:13:44, 696 km) and record it against the prediction. A CW beacon should clear -65 dBm at the analyzer input up here.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acu-beacon-lock'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'SAR-3 Beacon >= -65 dBm at RX IF',
          params: {
            signalId: 'MERIDIAN-SAR-3-Beacon',
            minPower: -65 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Level Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Rotterdam wants the beacon level as a number, not "present". Why?',
            options: [
              "A level against the prediction is the transmitter's health: 10 dB low with the right Doppler is a sick transmitter on a good orbit",
              'A level against the contract is the billing basis: the customer pays for a pass that met the committed margin, not one merely present',
              'A level against the noise floor sets the ACU search bandwidth: the next pass is searched only as wide as the tone needs to stand clear',
              'A level with a marker is what the analyzer can record: without a number the trace cannot be saved, and a saved trace is what the log needs',
            ],
            correctIndex: 0,
            explanation:
              "Today's number is the baseline every later pass is compared with. The first measurement of anything on a new spacecraft is the one every trend starts from. Take it near culmination, where the geometry is best known, and write the elevation next to it.",
            pointPenalty: 5,
            documentSection: 'State of Health',
            documentLine: 'SOH 2: beacon level at culmination (31.6 deg, 696 km) above -65 dBm at RX IF, within prediction; CW, on frequency after Doppler.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'state-of-health',
      nice: ['T1611', 'S0842'],
      title: 'Initial State of Health',
      description: 'Close the SOH: beacon present, tracking, Doppler profile matching the refined set. Make the call for Rotterdam.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['beacon-level'],
      conditions: [
        {
          type: 'status-check',
          description: 'SOH Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'Beacon present and on level, antenna tracking, Doppler profile matches the refined set. What is the SOH call?',
            options: [
              'Spacecraft transmitting on the expected frequency and orbit; no anomaly; recommend proceeding to command checkout next pass.',
              'Spacecraft transmitting on the expected frequency and orbit; healthy; recommend commanding the payload on now while the link is up.',
              'Spacecraft transmitting but the video not decoded; inconclusive; recommend holding commissioning until the imagery is seen.',
              'Spacecraft transmitting on the expected frequency and orbit; healthy; recommend Shetland repeat the acquisition before commissioning.',
            ],
            correctIndex: 0,
            explanation:
              'A CW beacon on frequency with the right Doppler curve tells you the transmitter, the reference, and the orbit are all as expected. If the elements had been loaded after AOS the call would carry a qualifier, because the first minute of track would have been on a set you knew was stale.',
            pointPenalty: 5,
            documentSection: 'State of Health',
            documentLine: 'SOH 3: beacon acquired, orbit matches refined set, Doppler profile nominal, no anomaly. Recommend command checkout next pass.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4: CLOSE OUT
    // ============================================================
    {
      id: 'secure-after-los',
      nice: ['T0431', 'K0645', 'S0842'],
      title: 'Secure After LOS',
      description: 'LOS 09:18:33. Confirm the uplink stayed cold for the whole pass and close the LEOP log for this contact.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['state-of-health'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Still Disabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Still Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Contact Closed',
          params: {
            character: Character.SYSTEM,
            question: "SAR-3's next Galway pass is 10:40. What happens to the element sets between now and then?",
            options: [
              'The injection set is superseded and stays that way; Rotterdam fits a new solution to this pass and pushes it before 10:40',
              'Nothing changes; the refined set is good for the rest of the day, and the panel stays CURRENT until Rotterdam says otherwise',
              'The injection set is reloaded; the 10:40 pass is flown on it so the two sets can be compared, and the panel reads STALE until then',
              'The station propagates its own set; the beacon Doppler from this pass is fitted on the console, and the panel reads CURRENT on it',
            ],
            correctIndex: 0,
            explanation:
              'The panel will read STALE again when the new set arrives. Every pass is more ranging. Along-track error grows with age on every set, so a bird a day old gets a set an hour old. Load what Rotterdam sends, every time, before AOS.',
            pointPenalty: 5,
            documentSection: 'Close-out',
            documentLine:
              '09:19Z contact closed: uplink cold throughout (HPA disabled, BUC muted, modem off air). Refined set loaded before AOS. Next Galway pass 10:40:49Z; await post-pass elements.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'leop-handover',
      nice: ['T0513', 'K0645'],
      title: 'LEOP Handover',
      description: 'Tell Anneke what she has.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['secure-after-los'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Handover Given',
          params: {
            character: Character.SYSTEM,
            question: 'You had the bird, the link was clean and the uplink chain was right there. Why did nothing go up?',
            options: [
              'The flight rules sequence LEOP: no command until SOH is confirmed and tracking is shown. A rejected command on a new bird is unexplainable.',
              'The TT&C key had not been loaded: no command can be authenticated without it. On a pass with the key in place it would have been fine.',
              'The pass was too short: the chain takes minutes to bring up in order. On a longer pass with time to warm up it would have been fine.',
              'The BUC was muted: there was no time to bring the chain up in order. On a pass with the chain already warm it would have been fine.',
            ],
            correctIndex: 0,
            explanation:
              'On a new spacecraft every first is evidence. If a command fails before tracking and SOH are on record, nobody can say whether the bird, the link, or the station was the cause. Commissioning is next pass.',
            pointPenalty: 5,
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
        <em>[Text message from Anneke Visser at 08:47]</em>
      </p>
      <p>
        "Separation confirmed at 07:26. SAR-3 is on her own and Galway is the first commercial site on her track, AOS about 09:09. All I have is the launch provider's injection set; the first ranging arc is being solved now and I will push the refined elements to your console as soon as it closes. Readiness review, elements, beacon, then state of health. Nothing else."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'test-readiness': {
        text: `
        <p>
          TRR noted, thank you. The refined set from the first ranging arc is on its way to your console now; load it the moment the panel flags it. The injection numbers had her thirty seconds out, which on a 0.45 degree beam is not a small thing.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'uplink-cold-check': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at 09:02]</em>
        </p>
        <p>
          "Cold chain logged on my side as well. I know it feels like a formality. On Wednesday, when we send the first command, the fact that nothing went up today is the reason a rejected command will mean something."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'first-acquisition': {
        text: `
        <p>
          That's her. First contact from a commercial site, on frequency, on the refined orbit. Read her for me - level, Doppler, lock - one line at a time; I have the whole room waiting on it.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'acu-beacon-lock': {
        text: `
        <p>
          Lock time logged. The room just noticed. Carry on.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'leop-handover': {
        text: `
        <p>
          Logged. Beacon acquired, level and Doppler on record, orbit confirmed, no anomaly, and nobody sent anything they could not explain afterwards. That is exactly what launch day is supposed to look like. Commissioning is Wednesday; I will send the acceptance test plan tonight. Well done, Galway.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
