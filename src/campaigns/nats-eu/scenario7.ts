import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 7 - "Moving Target" / Ephemeris Management
 *
 * New mechanic: M4 space-domain events. A conjunction-avoidance burn on
 * MERIDIAN-SAR-2 invalidates the element set the station is tracking on. The
 * operator has a baseline to compare against - the SAR-1 pass worked on
 * current elements an hour earlier - then attempts SAR-2 on the stale set,
 * watches the pedestal read LOCKED while the carrier sinks as the bird rises,
 * loads the post-burn elements, reacquires, and reports to Rotterdam.
 *
 * Phase 16: the miss is experienced, not asserted. At `maneuverAtS` the
 * spacecraft moves onto `newTle` while the station's element set stays where
 * it was (OrbitalSatellite.maneuverTo); program-track follows the old set until
 * the operator loads the update (reloadTle). The burn is 0.03 deg of mean
 * anomaly, about 3.5 km along track - a real avoidance burn, not a new orbit.
 * At 828 km that is a third of a degree, which at a 0.45 deg Ku beamwidth is
 * the difference between 10 dB and 4 dB. Measured on the stale set: C/N peaks
 * 4.2 dB at 12 deg elevation and FALLS to -2.6 dB at culmination as the range
 * shortens and the angular error grows; on the loaded set 10.2 dB at 25 deg
 * with 174 s above 8 dB (test/campaigns/nats-eu-phase-b-validation.test.ts).
 *
 * Clock: sim starts 2027-03-15 13:45:00 UTC. `maneuverAtS` runs on the mission
 * clock: the burn executes at 14:12:00 (T+1620), between the two passes.
 * - MERIDIAN-SAR-1 (baseline, current elements): AOS 14:03:10 az 000, max el
 *   28.0 at 14:06:45 (761 km), LOS 14:10:18 az 224. C/N >= 8 dB ~14:05 .. 14:08:30.
 * - MERIDIAN-SAR-2 (burned): AOS 14:18:42 az 130, max el 25.0 at 14:22:10
 *   (828 km), LOS 14:25:40 az 000. Loaded set: C/N >= 8 dB 14:20:45 .. 14:23:40.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on the 1370 MHz
 * SAR-2 carrier and the tracker stowed south (az 180) after yesterday's shift.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0431: Monitor and maintain system operations
 *   - T1138: Perform system reconfiguration
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** GW-01 as yesterday's shift left it: modem on SAR-2, tracker stowed south. Deep clone, never spread. */
const galwayMovingTarget: GroundStationConfig = structuredClone(galwayGroundStation);
galwayMovingTarget.antennasState![0] = {
  ...galwayMovingTarget.antennasState![0],
  azimuth: 180 as Degrees,
  elevation: 3 as Degrees,
  targetAzimuth: 180 as Degrees,
  targetElevation: 3 as Degrees,
};
galwayMovingTarget.receivers![0].modems![0] = {
  ...galwayMovingTarget.receivers![0].modems![0],
  frequency: 1370 as MHz,
};

export const natsEuScenario7Data: ScenarioData = {
  id: 'nats-eu-scenario7',
  url: 'nats-eu/scenarios/nats-eu-scenario7',
  imageUrl: 'nats/7/card.png',
  number: 7,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario6'],
  title: 'Moving Target',
  subtitle: 'Ephemeris Management',
  duration: '35-40 min',
  missionType: 'Anomaly Response',
  description: `Anneke called at 05:40. Space Surveillance flagged a conjunction between MERIDIAN-SAR-2 and a spent upper stage, close enough that the constellation would rather burn than argue about probabilities. Go / no-go at 14:00; if it is go, the burn executes at 14:11, between your two passes.<br><br>The burn will be small. The problem is that everything at GW-01 - your pass predictions, your program-track pointing, the antenna's idea of where to look at AOS - is computed from an element set that will describe an orbit the spacecraft is no longer in.<br><br>Work SAR-1 first on current elements so you know what right looks like. Then find out what wrong looks like.`,
  equipment: ['GW-01 Galway: 4m Ku-Band LEO Tracker', 'Pass Schedule Console (ephemeris status)', 'Spectrum Analyzer', 'QPSK 3/4 Receiver'],
  settings: {
    isSync: true,
    groundStations: [galwayMovingTarget, shetlandGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-7?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // Two-hour search horizon: after the 14:18 pass the next contact at the
    // mask is SAR-2 over Galway at 15:50, which is the dead hour the skip is
    // for (and what e2e/specs/nats-eu-time-skip.spec.ts exercises here).
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 2,
    },

    workingDocument: {
      title: 'GW-01 Ephemeris Log',
      description: 'Element-set events on the station: which set, which epoch, what it did to the pass.',
    },

    // M4 - the avoidance burn on SAR-2, on the mission clock at 14:12:00. The
    // spacecraft moves onto the new set; the station keeps predicting from the
    // old one until the operator loads the update. Mean anomaly +0.03 deg.
    spaceEvents: [
      {
        id: 'SAR2-CAM',
        satelliteNoradId: 61702,
        maneuverAtS: 1620,
        label: 'MERIDIAN-SAR-2 conjunction-avoidance manoeuvre executed 14:11Z',
        newTle: {
          tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997',
          tle2: '2 61702  98.4000  42.0000 0010000  90.0000 240.0300 15.60000000123458',
        },
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
      title: 'Review the Conjunction Notice',
      description: 'Open the shift brief and read the conjunction report and the decision timeline.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Conjunction Notice Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Impact Understood',
          params: {
            character: Character.SYSTEM,
            question: 'If the burn goes ahead and you keep the old SAR-2 element set, what breaks at the ground station?',
            options: [
              'Pass predictions and program-track pointing - the antenna computes where to look from the elements, so it looks where the bird used to be.',
              'Nothing at the station. Elements only matter to the spacecraft operator.',
              'The receiver frequency, because the Doppler profile changes.',
              'The link budget, because the burn changes the transmit power.',
            ],
            correctIndex: 0,
            explanation: "The element set is the station's entire model of where the satellite is. A stale set is a confidently wrong antenna. SAR-1 did not burn; work it first.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS FOR THE BASELINE
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Clear the board: confirm the active alarm state on GW-01.',
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
            options: ['No active alarms - all systems nominal', 'Ephemeris stale on MERIDIAN-SAR-2', 'GPSDO in holdover', 'Antenna drive fault'],
            correctIndex: 0,
            explanation:
              'Clean board, and no stale flag yet: the burn has not happened. When it does, the ephemeris panel on the Pass Schedule tab is where it shows, not the dashboard.',
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
      nice: ['T0431', 'K0740'],
      title: 'Reference Check',
      description: 'GPSDO locked and out of holdover. Timing is half of an element set: the epoch means nothing against a wrong clock.',
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
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'ephemeris-epoch-check',
      nice: ['K1032', 'T0431'],
      title: 'Check the Element Sets',
      description: 'Open the Pass Schedule tab. Both birds show current elements with the 14:00 epoch. Know what would make either of them stale.',
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
          description: 'Staleness Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Both sets are hours old and the panel reads current. What makes an element set stale?',
            options: [
              'A manoeuvre, immediately; or age - drag and model error grow the along-track error by hundreds of metres a day at 360 km, until the beam misses',
              'Only a manoeuvre; without one an element set is good indefinitely',
              'Any set older than one orbit',
              'A change of ground station, because elements are computed per site',
            ],
            correctIndex: 0,
            explanation:
              'Two clocks run on a TLE: the calendar, which erodes it slowly, and the thruster, which breaks it at once. Rotterdam distributes a fresh set every few days for the first reason and within minutes for the second.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-1',
      description: "Modem 1 is on yesterday's 1370 MHz SAR-2 carrier. Retune it to 1414 MHz for SAR-1 and put the analyzer on the 1389 MHz beacon with a 2 MHz span.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['ephemeris-epoch-check'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'The tracker is stowed south. Slew it to the SAR-1 rise azimuth, 000 at 5 degrees, before 14:03.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 000 / El 5',
          params: { azimuth: 0, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE BASELINE PASS
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Program-track SAR-1 on current elements and confirm the beacon on RX analysis. This is what a good element set looks like.',
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
      points: 15,
    },
    {
      id: 'baseline-decode',
      nice: ['T0153', 'K0740'],
      title: 'Decode the Baseline Pass',
      description:
        'Lock the 1414 MHz carrier, hold C/N above 8 dB through the high-elevation segment and read the peak at culmination (14:06:45, 28 degrees). Remember the shape of the curve.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 9 dB at Culmination',
          params: { modemNumber: 1, minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'On current elements, how did C/N behave from AOS to culmination?',
            options: [
              'Climbed steadily with elevation to a peak of about 11 dB at 28 degrees - the range got shorter and nothing else changed',
              'Peaked at AOS and fell through the pass',
              'Flat at about 8 dB throughout',
              'Climbed, then dipped at the top of the pass',
            ],
            correctIndex: 0,
            explanation:
              'Shorter range, less path loss, more signal: C/N rises with elevation and peaks where the bird is closest. Hold that picture; the next pass will not draw it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // BEAT 4 -> BEAT 5: LOG, RETUNE, THE BURN
    // ============================================================
    {
      id: 'log-the-baseline',
      nice: ['T1580', 'K0645'],
      title: 'Log the Baseline',
      description: 'Write the SAR-1 result into the ephemeris log: which set, which epoch, what it delivered.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['baseline-decode'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Baseline Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the ephemeris log for the SAR-1 contact?',
            options: [
              'Elements current (epoch 14:00), program-track locked, decoded, peak C/N about 11 dB at 28 degrees',
              'Decoded',
              'Elements stale, decoded anyway',
              'Nothing - SAR-1 did not manoeuvre',
            ],
            correctIndex: 0,
            explanation: 'The set and its epoch belong next to the result. When a pass goes wrong, the first question is which elements it was flown on.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine: '14:03Z MERIDIAN-SAR-1 GW-01: elements current (epoch 2027-03-15 14:00Z), program-track locked, decoded, peak C/N ~11 dB at 28 deg. Baseline.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'retune-for-sar2',
      nice: ['S0421', 'K0773'],
      title: 'Retune for SAR-2',
      description:
        'The burn executed at 14:11. SAR-2 rises at 14:18 from azimuth 130: retune modem 1 to its 1370 MHz carrier and the analyzer to its 1397 MHz beacon. Leave the elements alone for now.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-baseline'],
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
          description: 'Analyzer Centre 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'preposition-for-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for SAR-2',
      description: 'Manual mode, and park the tracker on the SAR-2 rise azimuth, 130 at 5 degrees, as the old elements predict it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-for-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 130 / El 5',
          params: { azimuth: 130, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 2 ON THE STALE SET: THE MISS
    // ============================================================
    {
      id: 'stale-acquisition-attempt',
      nice: ['K1032', 'T0431', 'K0740'],
      title: 'Attempt SAR-2 on the Old Elements',
      description:
        'Program-track SAR-2 on the set you have. The pedestal will report LOCKED. Watch RX analysis as the bird rises: the carrier is there, weak, and it gets weaker as the elevation climbs. Read what that is telling you before you fix it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-sar2'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Pedestal Reports LOCKED on SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Stuck Below 5 dB',
          params: { modemNumber: 1, maxCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Pointing Error Diagnosed',
          params: {
            character: Character.SYSTEM,
            question: 'Pedestal LOCKED, every drive indicator green, and C/N is falling as the bird climbs. What is happening?',
            options: [
              'The pedestal is locked to a prediction, not to the bird. A fixed along-track error is a bigger angle at shorter range, so the beam misses by more at the top of the pass than at AOS.',
              'The receiver has lost lock and needs retuning',
              'Rain fade on the rising leg',
              'The pedestal is slewing too slowly and lagging the pass',
            ],
            correctIndex: 0,
            explanation:
              'Program-track lock means the pedestal is where it was told to go. It was told wrong. Three and a half kilometres along track is 0.1 deg at 2000 km and 0.25 deg at 828 km: the closer the bird, the worse the miss.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'load-the-ephemeris',
      nice: ['T1138', 'K1032', 'T0431'],
      title: 'Load the Post-Burn Elements',
      description:
        'On the Pass Schedule tab the SAR-2 entry reads EPHEMERIS STALE. Press Load Updated Ephemeris. The station recomputes the pass and program-track slews to where the bird actually is.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['stale-acquisition-attempt'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'Post-Burn Ephemeris Loaded',
          params: { eventId: 'SAR2-CAM' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Epoch Read',
          params: {
            character: Character.SYSTEM,
            question: 'Two element sets for SAR-2, both dated today. What tells you which one describes the orbit the bird is in now?',
            options: [
              'The epoch: the post-burn set is timed after 14:11, and an older set cannot know about a burn that happened after it was fitted',
              'The higher NORAD number',
              'The one the panel loaded most recently is always right',
              'They describe the same orbit; the burn only changed the timing',
            ],
            correctIndex: 0,
            explanation:
              'An element set is a snapshot of the orbit at its epoch. Anything the spacecraft does after that instant is invisible to it. Newer is not always better; post-burn is.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEATS 2-3: REACQUIRE ON THE NEW SET
    // ============================================================
    {
      id: 'reacquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Reacquire MERIDIAN-SAR-2',
      description: 'Program-track slews the third of a degree to the real bird. Confirm the imagery carrier comes up on RX analysis where the new prediction says it should.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['load-the-ephemeris'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2 on Current Elements',
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
      points: 20,
    },
    {
      id: 'verify-the-reacquisition',
      nice: ['T0153', 'K0740'],
      title: 'Verify the Reacquisition',
      description: 'Lock the 1370 MHz carrier and hold C/N above 8 dB through what is left of the high-elevation segment. A clean reacquisition draws the same curve SAR-1 drew.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reacquire-sar2'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },

    // ============================================================
    // BEAT 4: REPORT
    // ============================================================
    {
      id: 'report-to-rotterdam',
      nice: ['T1580', 'K1032', 'K0645'],
      title: 'Report to Rotterdam',
      description: 'Close the ephemeris log and tell Anneke the bird came up where it should.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['verify-the-reacquisition'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Report Filed',
          params: {
            character: Character.SYSTEM,
            question: 'What does Rotterdam need from this station about the burn?',
            options: [
              'That the post-burn set was loaded, its epoch, and that SAR-2 was reacquired and decoded on it - the ground confirmation that the new elements are good',
              'That the old elements still worked',
              'Nothing - the burn was their event',
              'The time the pass was missed',
            ],
            correctIndex: 0,
            explanation: 'A constellation operator distributes elements; the ground sites are how they learn the elements are right. Your reacquisition is their verification.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '14:18Z MERIDIAN-SAR-2 GW-01: attempted on pre-burn elements, pedestal LOCKED, C/N below 5 dB and falling with elevation (pointing error). Post-burn set loaded (SAR2-CAM), reacquired, decoded, C/N >= 8 dB. Reported to MERIDIAN Ops.',
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
        "Anneke rang at 05:40, which tells you how her night went. Space Surveillance has a conjunction on SAR-2 with a spent upper stage. Rotterdam decides at 14:00; if it is go, the burn is at 14:11, which is between your passes. Small burn. New orbit, slightly. Here is the problem with slightly: every prediction this station makes comes from an element set that will describe an orbit the bird is not in. Work SAR-1 first. It did not burn, and I want you to know what right looks like before you meet wrong."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'ephemeris-epoch-check': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at 13:52]</em>
        </p>
        <p>
          "Galway - conjunction MER-OPS-CAM-2027-014 on SAR-2 is go / no-go at 14:00, burn at 14:11 if go. It is a small along-track adjustment; the payload schedule is unaffected. If we burn, treat your SAR-2 set as stale from that moment and load the post-burn elements before your 14:18 window. The pass shift is under ten seconds. The pointing error at a 4 m Ku beamwidth is not."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'preposition-for-aos': {
        text: `
        <p>
          Park it on the rise. Same as any other day - and today "any other day" is the measurement.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-sar1': {
        text: `
        <p>
          Beacon where the elements said it would be. Nothing remarkable about it, which is the point. Remember how unremarkable this felt.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'baseline-decode': {
        text: `
        <p>
          Watch the number climb with the elevation. Up, up, peak at the top, down the other side. That is the curve a good set draws. You are about to see a different one.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'retune-for-sar2': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at 14:12]</em>
        </p>
        <p>
          "Burn executed 14:11:00, nominal. Your SAR-2 set is stale as of now. Post-burn elements are on your ephemeris inbox within two minutes; the panel will flag them. Load before 14:18 if you can - and if you cannot, I would still like to hear what you saw."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'stale-acquisition-attempt': {
        text: `
        <p>
          Locked, is it. Locked on what? Look at the carrier, not the pedestal. It is there, it is weak, and it is getting weaker as the bird gets closer, which is backwards. The dish is exactly where it was told to be. That is the problem.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: '',
      },
      'load-the-ephemeris': {
        text: `
        <p>
          "Epoch on the new set is 14:11:30 - after the burn. The old one is 14:00 and knows nothing about it. Load it and the pedestal will move about a third of a degree, which at this beamwidth is the whole link."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'reacquire-sar2': {
        text: `
        <p>
          And there it is. A third of a degree. The bird never moved more than a few kilometres and the station could not see it. Precise antenna, wrong place.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'verify-the-reacquisition': {
        text: `
        <p>
          "Seeing your lock from here. That is the ground confirmation we needed on the new set - thank you. Sleep is now a possibility."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'report-to-rotterdam': {
        text: `
        <p>
          Log both passes with the set they were flown on. Next time a bird comes up weak the first question is "which elements", and the log should answer it before anyone has to ask.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
