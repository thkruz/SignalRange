import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * NATS Europe - Scenario 1: "First Light Over Galway"
 *
 * The player's first shift at the Galway LEO downlink station, and the site's
 * first end-to-end contact. Charlie Brooks is site lead and teaches only what
 * is new about LEO and Ku; everything Campaign 1 taught is assumed.
 *
 * Phase 16 rewrite: the whole shift, not just the pass. Five beats around each
 * contact (plan section 3): a station sweep and receiver set-up before AOS,
 * the acquisition, the in-pass work, and the retune between contacts, then the
 * shift log. Every threshold is on a flown pass (nats-eu-rf-validation.test.ts).
 *
 * Clock: sim starts 2027-03-15 13:48:00 UTC; the brief freezes it until read.
 * Pass timeline (Galway, 5 deg mask as the Pass Schedule tab shows it):
 * - MERIDIAN-SAR-1: AOS 14:03:10 az 000, max el 28.0 at 14:06:45 (761 km),
 *   LOS 14:10:18 az 224. Horizon crossings 14:01:59 / 14:11:28.
 *   C/N >= 8 dB roughly 14:05:00 .. 14:08:30, peak ~11 dB at culmination.
 * - MERIDIAN-SAR-2: AOS 14:18:42 az 130, max el 25.0 at 14:22:10 (828 km),
 *   LOS 14:25:40 az 000. C/N >= 8 dB roughly 14:20:30 .. 14:24:00.
 * Doppler on the 11.7 GHz downlink: +274 kHz at the horizon rising, through 0
 * at culmination, to -271 kHz at LOS. With the high-side LNB LO the IF
 * spectrum is inverted, so the beacon appears BELOW 1389 MHz while the bird
 * approaches and ABOVE it after culmination.
 *
 * Staged state (scenario-local clone of GW-01): the acceptance crew left the
 * tracker stowed south (az 180) and RX modem 1 on their 1400 MHz BPSK 1/2 test
 * carrier. The operator has fifteen minutes to make the station ready.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *   - K1032: Knowledge of satellite-based communication systems and software
 *
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures (SOPs)
 *   - K0740: Knowledge of system performance indicators
 *   - K0741: Knowledge of system availability measures
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - T1580: Report service status to stakeholders
 */

/**
 * GW-01 as the acceptance crew left it. Deep clone: nested state is handed to
 * the equipment constructors and mutated at runtime.
 */
const galwayFirstLight: GroundStationConfig = structuredClone(galwayGroundStation);
galwayFirstLight.antennasState![0] = {
  ...galwayFirstLight.antennasState![0],
  azimuth: 180 as Degrees,
  elevation: 3 as Degrees,
  targetAzimuth: 180 as Degrees,
  targetElevation: 3 as Degrees,
};
galwayFirstLight.receivers![0].modems![0] = {
  ...galwayFirstLight.receivers![0].modems![0],
  frequency: 1400 as MHz,
  bandwidth: 20 as MHz,
  modulation: 'BPSK',
  fec: '1/2',
};

export const natsEuScenario1Data: ScenarioData = {
  id: 'nats-eu-scenario1',
  url: 'nats-eu/scenarios/nats-eu-scenario1',
  imageUrl: 'nats/8/card.png',
  number: 1,
  isDisabled: false,
  difficulty: 'intermediate',
  // Campaign 2 assumes a qualified Campaign 1 operator: gate on the S8
  // night-shift graduation, not full Campaign 1 completion (design plan §2).
  prerequisiteScenarioIds: ['nats-level-8-night-shift'],
  title: 'First Light Over Galway',
  subtitle: 'LEO Pass Operations',
  duration: '35-40 min',
  missionType: 'LEO Downlink',
  description: `Welcome to Galway, Ireland - NATS Europe's newest LEO downlink site. Charlie Brooks has transferred from Vermont to stand up GW-01, a Ku-band station tasked with capturing SAR imagery from the MERIDIAN constellation.
  <br/><br/>Unlike the geostationary TIDEMARK fleet you trained on, MERIDIAN satellites scream overhead in minutes. The acceptance crew left the station stowed; you have a quarter of an hour to sweep it, tune the receiver, put the analyzer on the beacon and park the tracker on the rise azimuth. Then ride the pass with program-track, decode the imagery downlink before the bird drops below the horizon, and turn the station round for a second contact seven minutes later.`,
  equipment: [
    '4-meter Ku-band LEO Tracking Antenna',
    'Ku-band RF Front End (13.1 GHz LNB / 12.6 GHz BUC)',
    'Pass Schedule Planner',
    'Spectrum Analyzer',
    'RX/TX Modems with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayFirstLight],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '13:48:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-1?content-only=true&dark=true',

    // Contact timeline deck. The whole scenario is "make ready, wait for AOS,
    // work the pass" - seeing when the next window opens is the point.
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
      title: 'GW-01 Shift Log',
      description: 'Galway commissioning shift, 2027-03-15. One line per contact: time, bird, result, peak C/N and the elevation it happened at.',
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Shift Brief',
      description: 'Open the shift brief and acknowledge you are ready to make the station ready for the first MERIDIAN contact.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ready to Make Ready',
          params: {
            character: Character.SYSTEM,
            question: 'Have you reviewed the shift brief? MERIDIAN-SAR-1 rises at 14:03 and the station is not ready.',
            options: ['Yes, brief reviewed. Starting the pre-pass sweep.'],
            correctIndex: 0,
            explanation: 'Shift clock started at 13:48. Fifteen minutes to AOS.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: PRE-PASS - STATION SWEEP AND RECEIVER SET-UP
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Clear the board before anything else: confirm the active alarm state on GW-01.',
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
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear',
              'GPSDO in holdover - reference alarm, timing at risk',
              'LNB reference unlocked - hardware alarm, RX chain down',
            ],
            correctIndex: 0,
            explanation:
              'One line on the board and it is not a fault: the receive AGC sits at its 10 dB rail because the tracker is stowed and there is nothing in the beam. It clears when the beacon arrives. The acceptance crew left the hardware healthy; what they did not leave is a station configured for this pass.',
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
      description: 'GPSDO locked and out of holdover. Every LO in the rack keys off it, and at Ku a reference error is a frequency error you can see.',
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
      id: 'downconversion-plan',
      nice: ['K0773', 'S0421'],
      title: 'Confirm the Ku Downconversion Plan',
      description: 'LNB LO at 13100 MHz. Work out where the 11686 MHz SAR-1 imagery downlink comes out at IF before you tune anything to it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'lnb-lo-set',
          description: 'LNB LO 13100 MHz',
          params: { loFrequency: 13100 as MHz, loFrequencyTolerance: 0, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'IF Arithmetic',
          params: {
            character: Character.SYSTEM,
            question: 'LNB LO 13100 MHz, imagery downlink 11686 MHz. Where does the carrier sit at IF?',
            options: ['1414 MHz', '24786 MHz', '11686 MHz', '1370 MHz'],
            correctIndex: 0,
            explanation:
              'High-side LO: IF = LO - RF = 1414 MHz. Vermont was low-side, IF = RF - LO. Same arithmetic, opposite sign, and one consequence you will see in ten minutes: the spectrum is inverted, so Doppler walks the wrong way on the analyzer.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tune-receiver',
      nice: ['S0421', 'K1032'],
      title: 'Tune the Receiver for SAR-1',
      description: 'The acceptance crew left modem 1 on their 1400 MHz test carrier. Retune it for the imagery downlink: 1414 MHz, 36 MHz, QPSK, rate 3/4.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['downconversion-plan'],
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
          type: 'rx-modem-bandwidth-set',
          description: 'RX 36 MHz',
          params: { modemNumber: 1, bandwidth: 36e6, bandwidthTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'rx-modem-modulation-set',
          description: 'QPSK',
          params: { modemNumber: 1, modulation: 'QPSK' },
          mustMaintain: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC 3/4',
          params: { modemNumber: 1, fec: '3/4' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'analyzer-on-beacon',
      nice: ['S0421', 'K0773'],
      title: 'Analyzer on the SAR-1 Beacon',
      description:
        'Centre the spectrum analyzer on the SAR-1 telemetry beacon at 1389 MHz IF with a 2 MHz span. The beacon is a CW line, so it is the one signal that shows you Doppler.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-receiver'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why the Span',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-1 closes at over 7 km/s. Why not a 200 kHz span around the beacon?',
            options: [
              'Doppler walks the beacon about 550 kHz end to end and off a narrow span',
              'The analyzer cannot resolve a CW line at any span below 1 MHz',
              'The beacon is 36 MHz wide and needs the full span to fit on screen',
              'A narrow span raises the displayed noise floor and hides the line',
            ],
            correctIndex: 0,
            explanation: 'At 11.7 GHz the range rate gives about +/- 270 kHz. Two megahertz keeps the whole walk on screen: watch it slide through the centre at culmination.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'review-pass-schedule',
      nice: ['K1032', 'S0421'],
      title: 'Review the Contact Schedule',
      description: 'Open the Pass Schedule tab and read off the AOS time and rise azimuth for MERIDIAN-SAR-1. The tab works the 5 degree mask, not the geometric horizon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['analyzer-on-beacon'],
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
          description: 'AOS Read',
          params: {
            character: Character.SYSTEM,
            question: 'When does MERIDIAN-SAR-1 clear the 5 degree mask, and from where?',
            options: ['14:03, azimuth 000', '14:07, azimuth 294', '14:10, azimuth 224', '14:18, azimuth 130'],
            correctIndex: 0,
            explanation:
              'Rises due north at 14:03, culminates at 28 degrees in the west-north-west at 14:06:45, sets south-west at 14:10. Under nine minutes above the mask. 14:18 on azimuth 130 is SAR-2.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'The tracker is stowed south. Slew it to the rise azimuth, 000 at 5 degrees, so the pedestal is waiting when the bird clears the mask.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-pass-schedule'],
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
    // BEATS 2-3: MERIDIAN-SAR-1 PASS
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description:
        'Set the antenna to program-track on MERIDIAN-SAR-1 and confirm the beacon on RX analysis once the bird is up. The 4 m pedestal slews at 20 deg/s - plenty for a 28 degree pass.',
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
      id: 'lock-the-downlink',
      nice: ['T0153', 'K0740'],
      title: 'Lock the Imagery Downlink',
      description: 'Lock the QPSK 3/4 carrier at 1414 MHz and hold C/N above 8 dB through the high-elevation segment. That is the acceptance criterion for the site.',
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
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'read-the-culmination',
      nice: ['K0740', 'K0773'],
      title: 'Read the Pass at Culmination',
      description: 'Around 14:06:45 the bird is at 28 degrees and 761 km. Confirm C/N of 9 dB or better at the top of the pass, and read what the beacon did on the analyzer.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['lock-the-downlink'],
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 9 dB at Culmination',
          params: { modemNumber: 1, minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Doppler Read',
          params: {
            character: Character.SYSTEM,
            question: 'The beacon started a quarter of a megahertz BELOW 1389 MHz and crossed to above it at culmination. Why below first?',
            options: [
              'Approach raises the RF and the high-side LO inverts it, so IF drops',
              'The beacon transmitter drifts low while the spacecraft is still cold',
              'The LNB LO pulled low under load, so the whole IF band sat low',
              'The analyzer reference level was set too high, so the line read low',
            ],
            correctIndex: 0,
            explanation:
              'IF = LO - RF. Positive Doppler on approach makes the RF higher and the IF lower; after culmination the sign flips. On a low-side plan it would walk the other way. Peak C/N is where the range is shortest, not where the elevation is highest by accident: both happen at culmination.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEAT 5: BETWEEN CONTACTS
    // ============================================================
    {
      id: 'retune-for-sar2',
      nice: ['S0421', 'K0773'],
      title: 'Retune for SAR-2',
      description:
        'SAR-1 sets at 14:10. MERIDIAN-SAR-2 rises at 14:18 from azimuth 130: retune modem 1 to its 1370 MHz imagery carrier and put the analyzer on its 1397 MHz beacon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-culmination'],
      timeLimitSeconds: 4 * 60,
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
        {
          type: 'status-check',
          description: 'SAR-2 Plan',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-2 imagery is at 11730 MHz and its beacon at 11703 MHz. Where are they at IF, and when is the next window?',
            options: [
              'Imagery 1370 MHz, beacon 1397 MHz; AOS 14:18 azimuth 130',
              'Imagery 1414 MHz, beacon 1389 MHz; AOS 14:18 azimuth 130',
              'Imagery 1430 MHz, beacon 1403 MHz; AOS 14:18 azimuth 130',
              'Imagery 1370 MHz, beacon 1397 MHz; AOS 15:50 azimuth 199',
            ],
            correctIndex: 0,
            explanation:
              '13100 - 11730 = 1370 and 13100 - 11703 = 1397. Different bird, different carrier, same arithmetic. The 14:18 window opens seven minutes after SAR-1 sets; 15:50 is the pass after that.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: MERIDIAN-SAR-2 PASS
    // ============================================================
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032', 'T0153'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'Retarget the tracker to MERIDIAN-SAR-2 before 14:18 and confirm its imagery carrier on RX analysis once it clears the mask.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retune-for-sar2'],
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
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
      id: 'decode-sar2',
      nice: ['T0153', 'K0740'],
      title: 'Decode the Second Contact',
      description: 'Lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation segment of the SAR-2 pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
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
      points: 15,
    },

    // ============================================================
    // BEAT 4: SHIFT LOG
    // ============================================================
    {
      id: 'log-first-light',
      nice: ['T1580', 'K0645'],
      title: 'Log First Light',
      description: 'Two contacts down. Write the acceptance result into the shift log the way Rotterdam wants it: a number the next shift can compare against.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the log for the 14:03 SAR-1 contact?',
            options: [
              'Decoded; C/N held above 8 dB, peak ~11 dB at 28 degrees, no anomalies',
              'Decoded; C/N not measured, peak elevation 28 degrees, no anomalies',
              'Missed; stale ephemeris, no C/N recorded, anomaly logged',
              'Deferred; next pass 23:00, no C/N recorded, no anomalies',
            ],
            correctIndex: 0,
            explanation: 'Peak C/N and the elevation it happened at. Predicted was 11 dB; anything more than 3 dB under that goes to Rotterdam as a flag. Site is accepted.',
            pointPenalty: 5,
            documentSection: 'Contacts',
            documentLine:
              '14:03Z MERIDIAN-SAR-1 GW-01: decoded, C/N >= 8 dB through culmination, peak ~11 dB at 28 deg. 14:18Z MERIDIAN-SAR-2: decoded, C/N >= 8 dB. Site first light achieved. No anomalies.',
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
        <em>[Text message from Charlie Brooks at 13:47]</em>
      </p>
      <p>
        "Good to have you across the water. Acceptance crew signed the hardware off last night and left it stowed - tracker south, modem on their test carrier. First MERIDIAN window opens at 14:03 and that is the site's first light, so I would like the station ready before it, not during it. Sweep it, tune it, park it on the rise. I am in the front office if you need me. You will not."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'reference-check': {
        text: `
        <p>
          Reference first, same as Vermont. The only thing that changes up here is what hangs off it: at Ku a part-per-billion on the 10 MHz is a hundred-odd hertz on the LO, and you will be chasing a carrier that is already moving.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'downconversion-plan': {
        text: `
        <p>
          High-side LO on this LNB. IF is LO minus RF, so the whole spectrum is upside down compared with Vermont. Get the arithmetic straight now; it bites later.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'tune-receiver': {
        text: `
        <p>
          The acceptance people ran BPSK half-rate at 1400 for their loopback and left it there. Imagery is 36 megahertz of QPSK three-quarters at 1414. Modem does not know that until you tell it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'analyzer-on-beacon': {
        text: `
        <p>
          Put the analyzer on the beacon, not the video. Two megahertz wide. The video carrier is too fat to show you anything; the beacon is a single line and it is going to walk, and I want you to see which way.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'review-pass-schedule': {
        text: `
        <p>
          Scheduler works the five degree mask. Below that you are looking through fifty kilometres of wet air at a bird you cannot use. Read the AOS off the tab, not the horizon.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'preposition-for-aos': {
        text: `
        <p>
          Park it on the rise azimuth. Twenty degrees a second sounds like a lot until you are a hundred and eighty degrees off when the bird comes up. Manual is fine for this; program-track once it is there.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-sar1': {
        text: `
        <p>
          Program-track, target SAR-1, and let the pedestal fly it. If you try to follow this by hand you will lose it inside the first minute. Beacon on the analyzer is your proof you are on the right bird.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'lock-the-downlink': {
        text: `
        <p>
          Lock. That is first light for the site - write the time down somewhere. Eight dB is the acceptance line; hold it through the top of the pass.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'read-the-culmination': {
        text: `
        <p>
          Look at the beacon now. It came up below centre, it is crossing, it will leave above. That is the inverted spectrum doing exactly what the arithmetic said.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'retune-for-sar2': {
        text: `
        <p>
          Gone at 14:10. That is a pass: nine minutes above the mask and nobody asked your permission. Second bird in seven. Different carrier, same LO - you know what to do with that.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'acquire-sar2': {
        text: `
        <p>
          Retarget the tracker before it rises, not after. The pedestal will sit on the horizon at azimuth 130 waiting; that is what you want.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'decode-sar2': {
        text: `
        <p>
          Two for two on the site's first day. Rotterdam will pretend they expected nothing less.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'log-first-light': {
        text: `
        <p>
          Write it down properly. Peak C/N and the elevation it came at - a number the next shift can hold you to. Then go and find some coffee; the next one is in ninety minutes and it is a graze.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
    },
  },
};
