import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
 * the operator loads the update (reloadTle). The burn is 0.06 deg of mean
 * anomaly, about 7.5 km along track - a real avoidance burn, not a new orbit.
 * At 828 km that is half a degree, which at a 0.45 deg Ku beamwidth costs
 * ~15 dB. Measured on the stale set: C/N peaks ~3 dB on the rising leg and
 * FALLS to about -5 dB at culmination as the range shortens and the angular
 * error grows; on the loaded set ~10.6 dB at 25 deg with 174 s above 8 dB
 * (test/campaigns/nats-eu-phase-b-validation.test.ts). Phase 19.4 doubled the
 * burn from 0.03 deg: the old 3.5 km only produced the falling tell because
 * the engine charged the pointing error twice (DEV-ANT-02); charged once, a
 * third of a degree left the stale carrier flat at ~6 dB.
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
  imageUrl: 'nats-eu/7/card.png',
  number: 7,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario6'],
  title: 'Moving Target',
  subtitle: 'Ephemeris Management',
  duration: '35-40 min',
  missionType: 'Anomaly Response',
  description: `Anneke called at 05:40. Space Surveillance flagged a conjunction, a close approach, between MERIDIAN-SAR-2 and a spent upper stage, and the constellation would rather burn than argue about probabilities. Go / no-go is at 14:00, and if it's go, the burn executes at 14:12, between your two passes.<br><br>The burn will be small, but everything at GW-01 is computed from an element set that will describe an orbit the spacecraft is no longer in. That includes your pass predictions, your program-track pointing and the antenna's idea of where to look at AOS.<br><br>Work SAR-1 first on current elements so you know what right looks like. Then find out what wrong looks like.`,
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
    // old one until the operator loads the update. Mean anomaly +0.06 deg. The
    // new set's epoch is 14:12:30, after the burn (the Pass Schedule tab prints
    // it); its mean anomaly is re-propagated so the position is unchanged.
    spaceEvents: [
      {
        id: 'SAR2-CAM',
        satelliteNoradId: 61702,
        maneuverAtS: 1620,
        label: 'MERIDIAN-SAR-2 conjunction-avoidance manoeuvre executed 14:12Z',
        newTle: {
          tle1: '1 61702U 27015A   27074.59201389  .00001000  00000-0  10000-3 0  9993',
          tle2: '2 61702  98.4000  42.0103 0010000  89.9898 288.7888 15.60000000123457',
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
              'Pass predictions and pointing - the antenna aims where the old elements say, so it looks where the bird used to be',
              'Nothing at the station - a small burn is a problem for the spacecraft operator, and the Ku beam is wide enough to cover it',
              'The receiver frequency - the new orbit changes the Doppler profile, so the modem has to be retuned before the bird rises',
              'The link budget - the burn changes the transmit power and the range at culmination, so the predicted C/N no longer holds',
            ],
            correctIndex: 0,
            explanation:
              "The element set is the station's whole model of where the satellite is, so a stale set points the antenna confidently at the wrong place. The Ku beam is only about 0.45 degrees wide, so a small burn is more than enough to move the bird out of it. SAR-1 didn't burn, so work it first.",
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
      description: 'Check the dashboard and confirm which alarms are active on GW-01.',
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
            question: 'What is the alarm state on GW-01 at the start of the shift?',
            options: [
              'RX AGC on noise only - no carrier on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear',
              'Ephemeris stale on MERIDIAN-SAR-2 - pass schedule alarm, pointing at risk',
              'GPSDO in holdover - reference alarm, timing at risk',
            ],
            correctIndex: 0,
            explanation: `The AGC no-carrier warning is showing because the sky is empty, so the board isn't clear, but it isn't a hardware fault either. There's no stale flag yet because the burn hasn't happened. When it does, the ephemeris panel on the Pass Schedule tab is where it shows, not the dashboard.`,
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
      description: 'Confirm the GPSDO is locked and out of holdover. Timing is half of an element set, because an epoch means nothing against a wrong clock.',
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
      description: 'Open the Pass Schedule tab, where both birds show current elements with a 14:00 epoch. Be ready to say what would make either set stale.',
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
            question: 'Both sets read current on the panel. What makes an element set stale?',
            options: [
              'A manoeuvre at once, or age - drag and model error grow the along-track error each day until the beam misses',
              'Only a manoeuvre - without one an element set stays good indefinitely, because the orbit does not change on its own',
              'Age alone - any set older than one orbit is stale, because the propagator cannot carry it past a single revolution',
              'A change of ground station - elements are fitted per site, so a set computed for Galway is stale at Shetland',
            ],
            correctIndex: 0,
            explanation: `Two clocks run on an element set: the calendar, which erodes it slowly as drag and model error add along-track error every day, and the thruster, which breaks it at once. That's why "only a manoeuvre" is wrong, because even a quiet orbit drifts away from its set. Rotterdam distributes a fresh set every few days for the first reason and within minutes for the second.`,
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
      description: "Modem 1 is still on yesterday's 1370 MHz SAR-2 carrier. Retune it to 1414 MHz for SAR-1, then center the analyzer on the 1389 MHz beacon with a 2 MHz span.",
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
      description: 'The tracker is stowed pointing south. Slew it to azimuth 000, elevation 5 degrees, where SAR-1 will rise, before 14:03.',
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
      description:
        'Switch to program-track so the antenna follows SAR-1 on the current elements, and confirm the beacon on RX Analysis. This is what a good element set looks like.',
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
        'Lock the 1414 MHz carrier and hold C/N above 8 dB through the high-elevation part of the pass. Read the peak at culmination, the highest point of the pass (14:06:45, 28 degrees), and remember what the curve looks like.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 9 dB at Culmination',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'On current elements, what does C/N do from AOS to culmination?',
            options: [
              'Climbs steadily with elevation to a peak of about 11 dB at 28 degrees - shorter range, nothing else',
              'Peaks at AOS and falls through the pass - the beam is widest at the horizon and narrows as the bird climbs',
              'Stays flat at about 8 dB throughout - the AGC holds the carrier level constant once the modem has locked',
              'Climbs, then dips at the top of the pass - the azimuth rate at culmination pulls the pedestal off the bird',
            ],
            correctIndex: 0,
            explanation: `A shorter range means less path loss, so C/N rises with elevation and peaks where the bird is closest. The antenna beam doesn't change as the bird climbs, so the "peaks at AOS" answer has it backwards. Hold that picture, because the next pass won't draw it.`,
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
      description: 'Record the SAR-1 result in the ephemeris log: which element set you flew on, its epoch, and what it delivered.',
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
              'Elements current (epoch 14:00), program-track locked, decoded, peak C/N not recorded for a baseline',
              'Elements stale (epoch 14:00), program-track locked, decoded anyway, peak C/N about 11 dB at 28 degrees',
              'Elements current (epoch 14:03), step-track locked, decoded, peak C/N about 8 dB at 28 degrees',
            ],
            correctIndex: 0,
            explanation:
              'The log entry pairs the set and its epoch with the result, because when a pass goes wrong, the first question is which elements it was flown on. The other entries each get one fact wrong: they call a current set stale, drop the peak C/N a baseline needs, or name the wrong tracking mode and epoch.',
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
        'The burn is due at 14:12, between your passes, and SAR-2 rises at 14:18 from azimuth 130. Retune modem 1 to its 1370 MHz carrier and center the analyzer on its 1397 MHz beacon. Leave the elements alone for now.',
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
      description: 'Switch to manual mode and slew the tracker to azimuth 130, elevation 5 degrees, where the old elements say SAR-2 will rise.',
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
        'Switch to program-track on SAR-2 with the old element set. The pedestal will report LOCKED. Watch RX Analysis as the bird rises: the carrier is there but weak, and it gets weaker as the elevation climbs. Work out what that means before you fix it.',
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
          type: 'satellite-pass-phase',
          description: 'SAR-2 Past Culmination',
          params: { noradId: 61702, phase: 'past-culmination' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Stuck Below 5 dB',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', maxCNRatio: 5, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Pointing Error Diagnosed',
          params: {
            character: Character.SYSTEM,
            question: 'Pedestal LOCKED, every drive indicator green, and C/N is falling as the bird climbs. What is happening?',
            options: [
              'The pedestal is locked to a prediction, not the bird - the same along-track error is a bigger angle at shorter range',
              'The receiver has lost lock and needs retuning - the Doppler on the new orbit walked the carrier out of the capture range',
              'Rain fade on the rising leg - a wet path at low elevation costs several dB at Ku and the carrier is barely above the floor',
              'The pedestal is slewing too slowly and lagging the pass - the azimuth rate grows toward culmination and the drive cannot keep up',
            ],
            correctIndex: 0,
            explanation: `Program-track lock means the pedestal is where it was told to go, and it was told wrong. A fixed 7.5 km of along-track error covers a bigger angle as the bird gets closer: 0.2 degrees at 2000 km and half a degree at 828 km. Rain fade would ease as the elevation climbs, so it can't explain a carrier that gets weaker.`,
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
        'On the Pass Schedule tab, the SAR-2 entry reads EPHEMERIS STALE. Press Load Updated Ephemeris, and the station recomputes the pass so program-track slews to where the bird actually is.',
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
              "The epoch: the new set is timed after 14:12, and an older set can't know about a burn made after it was fitted",
              'The NORAD number: the catalogue issues a new number for each orbit change, so the higher one is the current orbit',
              'The load order: the set the panel loaded most recently is always the current one, whatever its epoch says',
              'Neither: they describe the same orbit, and the burn only shifted the pass timing by under ten seconds',
            ],
            correctIndex: 0,
            explanation: `An element set is a snapshot of the orbit at its epoch, so anything the spacecraft does after that instant is invisible to it. The NORAD number stays the same through a burn, and the two sets aren't equivalent, because they put the bird about 7.5 km apart along track. That's why the epoch decides it: only the set fitted after the burn knows about it.`,
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
      description: 'Program-track slews the half degree to where the bird really is. Confirm the 1397 MHz beacon comes up on RX Analysis where the new prediction says it should.',
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
          // The analyzer is framed on the 1397 MHz beacon (2 MHz span) by the
          // retune step: the CW beacon is what acquisition watches (phase 27 B2)
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
      points: 20,
    },
    {
      id: 'verify-the-reacquisition',
      nice: ['T0153', 'K0740'],
      title: 'Verify the Reacquisition',
      description:
        "Lock the 1370 MHz carrier and hold C/N above 8 dB through what's left of the high-elevation part of the pass. A clean reacquisition draws the same curve SAR-1 drew.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reacquire-sar2'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-2',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 8 dB',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
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
      description: 'Close the ephemeris log entry and tell Anneke that SAR-2 came up where the new elements said it would.',
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
              'That the post-burn set was loaded, its epoch, and that SAR-2 was reacquired and decoded on it',
              'That the old elements still worked, the C/N they gave, and that SAR-2 was decoded on them through culmination',
              'That the pass was attempted on the old set, the time it was missed, and that the pedestal reported LOCKED',
              'That the pre-burn set was flagged stale, the time the flag appeared, and that the station awaits a confirmed set',
            ],
            correctIndex: 0,
            explanation: `A constellation operator distributes the elements, but the ground sites are how it learns they're right. Your reacquisition on the loaded set is its ground confirmation, so the report that helps is the set, its epoch and the decode. The other answers describe the old set or a pending state, and none of them tells Rotterdam the new elements are good.`,
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
        "Anneke rang at 05:40, which tells you how her night went. Space Surveillance has a conjunction on SAR-2 with a spent upper stage, which means the two could pass dangerously close. Rotterdam decides at 14:00, and if it's go, the burn is at 14:12, between your passes."
      </p>
      <p>
        "It's a small burn, so the new orbit is only slightly different. The trouble is that 'slightly' is enough. Every prediction this station makes comes from the element set. That's the list of numbers describing the orbit, and after the burn it describes an orbit SAR-2 isn't in any more."
      </p>
      <p>
        "Work SAR-1 first. It didn't burn, and I want you to know what right looks like before you meet wrong."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/intro.mp3'),
    },
    objectives: {
      'ephemeris-epoch-check': {
        text: `
        <p>
          <em>[Text message from Anneke Visser, MERIDIAN Ops, at {{stationTime}}]</em>
        </p>
        <p>
          "Galway, conjunction MER-OPS-CAM-2027-014 on SAR-2 is go / no-go at 14:00, with the burn at 14:12 if it's go. The burn is a small along-track adjustment. That means the satellite moves a few kilometres along its orbit, so the payload schedule is unaffected. If we burn, treat your SAR-2 set as stale from that moment and load the post-burn elements before your 14:18 window. The pass timing shifts by under ten seconds, but your 4 m dish has a beam only 0.45 degrees wide, so the pointing error matters far more."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-ephemeris-epoch-check.mp3'),
      },
      'preposition-for-aos': {
        text: `
        <p>
          The antenna is waiting at azimuth 000, where SAR-1 will come up over the horizon. That's the same routine as any other pass, and today that's the point, because this is the pass we compare the next one against.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-preposition-for-aos.mp3'),
      },
      'acquire-sar1': {
        text: `
        <p>
          The beacon is exactly where the elements put it, and there's nothing remarkable about that, which is the point. Remember how unremarkable it feels.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-acquire-sar1.mp3'),
      },
      'baseline-decode': {
        text: `
        <p>
          The C/N climbed with the elevation, peaked at the top of the pass and came down the other side. That's the curve a good set draws. You'll see a different one on the next pass, so log this one first.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-baseline-decode.mp3'),
      },
      'retune-for-sar2': {
        text: `
        <p>
          <em>[Text message from Anneke Visser at {{stationTime}}]</em>
        </p>
        <p>
          "The burn is go for 14:12:00, and your SAR-2 set is stale from that moment. The post-burn elements will reach your ephemeris inbox within two minutes, and the panel will flag them. Please load them before 14:18 if you can. If you can't, I'd still like to hear what you saw."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-retune-for-sar2.mp3'),
      },
      'stale-acquisition-attempt': {
        text: `
        <p>
          The pedestal told you it was locked. Locked on what, though? The carrier was weak, and it got weaker as the bird got closer, which is backwards. The dish is exactly where it was told to be, and that's the problem, so it's time to fix the elements.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.SKEPTICAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-stale-acquisition-attempt.mp3'),
      },
      'load-the-ephemeris': {
        text: `
        <p>
          "Good, the new set is in. Its epoch is 14:12:30, which is after the burn, and the old one was 14:00 and knew nothing about it. The pedestal will now move about half a degree, which at this beamwidth is the whole link."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-load-the-ephemeris.mp3'),
      },
      'reacquire-sar2': {
        text: `
        <p>
          And there it is. The pedestal moved half a degree to where the bird really is. The burn moved SAR-2 only a few kilometres, and the station couldn't see it. The antenna was precise, but it was pointed at the wrong place.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-reacquire-sar2.mp3'),
      },
      'verify-the-reacquisition': {
        text: `
        <p>
          "You've got the carrier lock back on the new set, and that's the ground confirmation we needed. Thank you, Galway. Sleep is now a possibility. Close your log entry and tell me what you saw."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-verify-the-reacquisition.mp3'),
      },
      'report-to-rotterdam': {
        text: `
        <p>
          Good, both passes are logged with the element set each one was flown on. The next time a bird comes up weak, the first question will be which elements, and the log will answer it before anyone has to ask.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/7/obj-report-to-rotterdam.mp3'),
      },
    },
  },
};
