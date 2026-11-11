import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
  imageUrl: 'nats-eu/1/card.png',
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
  description: `Welcome to Galway, Ireland, NATS Europe's newest LEO downlink site. Charlie Brooks has transferred from Vermont to stand up GW-01, a Ku-band station that will capture radar (SAR) imagery from the MERIDIAN constellation.
  <br/><br/>Unlike the geostationary TIDEMARK fleet you trained on, MERIDIAN satellites cross the sky in minutes. The acceptance crew left the station stowed, so you have a quarter of an hour to check the board, tune the receiver, put the analyzer on the beacon and point the antenna where the first satellite will rise. Then you'll track the pass with program-track, decode the imagery before the satellite sets, and retune for a second satellite that rises about eight minutes later.`,
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
    // is blocked while a timed objective runs. The campaign wait policy in
    // campaign-data.ts (leadTimeS 0, minSkipS 1) overrides the values below, so
    // a skip can run right up to AOS.
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
      description: "Open the shift brief and confirm you're ready to prepare the station for the first MERIDIAN contact.",
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
            question: "Have you reviewed the shift brief? MERIDIAN-SAR-1 rises at 14:03 and the station isn't ready yet.",
            options: ["Yes, I've read the brief. Starting the pre-pass sweep."],
            correctIndex: 0,
            explanation: 'The shift clock started at 13:48, which leaves fifteen minutes before the first pass starts. Use that time to make the station ready.',
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
      description: 'Before you change anything, look over the GW-01 dashboard and confirm the active alarm state.',
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
            question: "What's the alarm state on GW-01 now that the acceptance crew has handed it over?",
            options: [
              'RX AGC on noise only, no carrier in the beam and no hardware fault',
              'No active faults, every system nominal and the whole board is clear',
              'GPSDO in holdover, a reference fault that puts the timing at risk',
              'LNB reference unlocked, a hardware fault with the receive chain down',
            ],
            correctIndex: 0,
            explanation:
              "The one line on the board isn't a fault. The receive AGC (automatic gain control) is levelling noise because the tracker is stowed, so there's no carrier in the beam, and the line clears when the beacon arrives. The acceptance crew left the hardware healthy, but they didn't leave a station configured for this pass.",
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
      description:
        "Confirm the GPSDO is locked and not in holdover, which would mean it has lost GPS and is free-running. Every LO in the rack keys off it, and at Ku-band a reference error is multiplied up into the frequencies you're trying to receive.",
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
      description: 'The LNB LO is at 13100 MHz. Work out where the 11686 MHz SAR-1 imagery downlink comes out at IF before you tune anything to it.',
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
            question: 'The LNB LO is at 13100 MHz and the imagery downlink is at 11686 MHz. Where does the carrier sit at IF?',
            options: ['1414 MHz', '24786 MHz', '11686 MHz', '1370 MHz'],
            correctIndex: 0,
            explanation:
              "This is a high-side LO, so IF = LO - RF, which gives 13100 - 11686 = 1414 MHz. Vermont was low-side, where IF = RF - LO, so it's the same arithmetic with the opposite sign. The 24786 MHz option adds the two frequencies instead of subtracting them. You'll see the main consequence in about ten minutes: the spectrum is inverted, so Doppler walks the wrong way on the analyzer.",
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
      description: 'The acceptance crew left modem 1 on their 1400 MHz test carrier. Retune it for the imagery downlink: 1414 MHz, 36 MHz bandwidth, QPSK, rate 3/4.',
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
        "Center the spectrum analyzer on the SAR-1 telemetry beacon at 1389 MHz IF with a 2 MHz span. The beacon is a CW line, a single unmodulated tone, so it's the one signal that shows you Doppler.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-receiver'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center 1389 MHz',
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
            question: 'SAR-1 closes at over 7 km/s. Why not use a 200 kHz span around the beacon?',
            options: [
              'Doppler walks the beacon about 550 kHz, so it would leave the span',
              "The analyzer can't resolve a CW beacon on any span under 1 MHz",
              'The beacon is 36 MHz wide, so it needs the full span to fit on screen',
              'A narrow span raises the displayed noise floor and hides the beacon',
            ],
            correctIndex: 0,
            explanation:
              "At 11.7 GHz the satellite's speed toward and away from you shifts the beacon by about plus or minus 270 kHz, which is roughly 550 kHz end to end. A 200 kHz span would lose the line within a minute, while 2 MHz keeps the whole walk on screen. Watch it slide through the center at culmination.",
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
      description:
        'Open the Pass Schedule tab and read the AOS (acquisition of signal) time and the rise azimuth for MERIDIAN-SAR-1. The tab uses the 5 degree mask, not the geometric horizon.',
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
            question: 'When does MERIDIAN-SAR-1 clear the 5 degree mask, and at what azimuth?',
            options: ['14:03, azimuth 000', '14:07, azimuth 294', '14:10, azimuth 224', '14:18, azimuth 130'],
            correctIndex: 0,
            explanation:
              "SAR-1 rises due north at 14:03, culminates at 28 degrees in the west-north-west at 14:06:45, and sets south-west at 14:10. That's about seven minutes above the mask. The 14:18 entry on azimuth 130 is SAR-2, which is the next pass rather than this one.",
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
      description:
        'The tracker is stowed facing south. Slew it to the rise azimuth, 000 degrees at 5 degrees elevation, so the antenna is already waiting when the satellite clears the mask.',
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
        'Set the antenna to program-track on MERIDIAN-SAR-1, then confirm the beacon on the RX Analysis tab once the satellite is up. The 4 m antenna slews at 10 degrees a second, which is plenty for a 28 degree pass.',
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
      description: "Lock the QPSK 3/4 carrier at 1414 MHz and hold C/N above 8 dB through the high-elevation part of the pass. That's the acceptance criterion for the site.",
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
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'read-the-culmination',
      nice: ['K0740', 'K0773'],
      title: 'Read the Pass at Culmination',
      description:
        'At about 14:06:45 the satellite reaches culmination, its highest point, at 28 degrees and 761 km. Confirm C/N of 9 dB or better at the top of the pass, and watch which way the beacon moves on the analyzer.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['lock-the-downlink'],
      conditions: [
        {
          type: 'receiver-snr-threshold',
          description: 'C/N >= 9 dB at Culmination',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', minCNRatio: 9, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Doppler Read',
          params: {
            character: Character.SYSTEM,
            question:
              'The beacon is about a quarter of a megahertz BELOW 1389 MHz on the way in, and it will cross to above 1389 MHz after culmination. Why is it below on approach?',
            options: [
              'Approach raises the RF, and the high-side LO inverts it, so IF drops',
              'The beacon transmitter drifts low while the spacecraft is still cold',
              'The LNB LO is pulled low under load, so the whole IF band sits low',
              'The analyzer reference level is set too high, so the line reads low',
            ],
            correctIndex: 0,
            explanation:
              "On this high-side LO, IF = LO - RF, so the positive Doppler on approach makes the RF higher and the IF lower. After culmination the satellite is moving away, the sign flips, and the beacon crosses to the other side of 1389 MHz. On a low-side plan it walks the other way. C/N peaks at culmination because that's when the satellite is closest; the high elevation comes with it, but it's the shorter range that buys the extra decibels.",
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
        "SAR-1 sets at 14:10, and retuning while it's still in view would drop its lock, so wait for LOS (loss of signal). MERIDIAN-SAR-2 rises at 14:18 from azimuth 130. Then retune modem 1 to its 1370 MHz imagery carrier and put the analyzer on its 1397 MHz beacon.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-culmination'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Pass Over (LOS)',
          params: { noradId: 61701, phase: 'setting-below', elevation: 5 }, // LOS at the 5 deg mask (14:10:18), not the 14:11:28 horizon crossing
          mustMaintain: false,
        },
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Center 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'SAR-2 Plan',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-2 imagery is at 11730 MHz and its beacon is at 11703 MHz. Where are they at IF, and when is its next window?',
            options: [
              'Imagery 1370 MHz, beacon 1397 MHz; AOS 14:18 azimuth 130',
              'Imagery 1414 MHz, beacon 1389 MHz; AOS 14:18 azimuth 130',
              'Imagery 1430 MHz, beacon 1403 MHz; AOS 14:18 azimuth 130',
              'Imagery 1370 MHz, beacon 1397 MHz; AOS 15:50 azimuth 199',
            ],
            correctIndex: 0,
            explanation:
              "With the LO at 13100 MHz, the imagery is 13100 - 11730 = 1370 MHz and the beacon is 13100 - 11703 = 1397 MHz. It's a different satellite with a different carrier, but the arithmetic is the same. The 14:18 window opens about eight minutes after SAR-1 sets, while 15:50 is the pass after that.",
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
      description: 'Retarget the tracker to MERIDIAN-SAR-2 before 14:18, then confirm its 1397 MHz beacon on the RX Analysis tab once it clears the mask.',
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
      points: 15,
    },
    {
      id: 'decode-sar2',
      nice: ['T0153', 'K0740'],
      title: 'Decode the Second Contact',
      description: 'Lock the 1370 MHz carrier and hold C/N above 8 dB through the high-elevation part of the SAR-2 pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
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
      points: 15,
    },

    // ============================================================
    // BEAT 4: SHIFT LOG
    // ============================================================
    {
      id: 'log-first-light',
      nice: ['T1580', 'K0645'],
      title: 'Log First Light',
      description:
        'Once SAR-2 sets, both contacts are done. Write the acceptance result into the shift log the way Rotterdam wants it: a number the next shift can compare against.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-2 Pass Over (LOS)',
          params: { noradId: 61702, phase: 'setting-below', elevation: 5 }, // LOS at the 5 deg mask (14:25:40)
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'What goes in the log for the 14:03 SAR-1 contact?',
            options: [
              'Decoded; C/N held above 8 dB, peak ~11 dB at 28 degrees, no anomalies',
              'Decoded; C/N not measured, peak elevation 28 degrees, no anomalies',
              'Missed; stale ephemeris, no C/N recorded, anomaly logged for follow-up',
              'Deferred; next pass 23:00, no C/N recorded, no anomalies logged today',
            ],
            correctIndex: 0,
            explanation:
              "The log needs the peak C/N and the elevation where it happened, because that's a number the next shift can compare against. The predicted peak was 11 dB, and anything more than 3 dB under that goes to Rotterdam as a flag. This contact matched the prediction, so the site is accepted.",
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
        "Good to have you across the water. The acceptance crew signed the hardware off last night and left it stowed, with the tracker pointing south and the modem still on their test carrier. The first MERIDIAN window opens at 14:03, and that's the site's first light, the first real signal it receives. I'd like the station ready before then, not during it. Check the board, tune the receiver, and point the antenna where the satellite's going to rise. I'm in the front office arguing with the coffee machine if you need me. You won't."
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/intro.mp3'),
    },
    objectives: {
      'reference-check': {
        text: `
        <p>
          Good, the reference is locked and not in holdover. That matters more at Ku-band, because every oscillator in the rack is multiplied up from it. A reference that's one part per billion off becomes only about 13 hertz on the 13.1 GHz LO, so locked is fine. The danger is an LNB that loses its reference and free-runs at tens of parts per million, which is hundreds of kilohertz, as much as the Doppler you're about to chase. Next, work out where the SAR-1 downlink comes out.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-reference-check.mp3'),
      },
      'downconversion-plan': {
        text: `
        <p>
          That's the arithmetic. This LNB uses a high-side LO, which means its oscillator sits above the signal frequency, so IF is LO minus RF and the whole spectrum comes out upside down compared with Vermont. Keep that in mind, because in about ten minutes the beacon is going to drift the opposite way from what you'd expect. Now tune the receiver to the imagery carrier.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-downconversion-plan.mp3'),
      },
      'tune-receiver': {
        text: `
        <p>
          The modem is on the imagery now: 36 megahertz of QPSK at rate three-quarters, at 1414 MHz. The acceptance crew had it on BPSK half-rate at 1400 MHz for their loopback test, where the station feeds its own signal back in, and the modem wouldn't have known the difference until you told it. Next, put the analyzer on the beacon.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-tune-receiver.mp3'),
      },
      'analyzer-on-beacon': {
        text: `
        <p>
          There's the beacon, a single steady line. The imagery carrier is too wide to show you anything useful at this span, but this line is going to walk across the screen as the satellite moves, and I want you to see which way. Next, open the pass schedule and find when SAR-1 rises.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-analyzer-on-beacon.mp3'),
      },
      'review-pass-schedule': {
        text: `
        <p>
          Good, you read the AOS time off the tab. The scheduler works to a five degree mask, which means it ignores anything lower than five degrees above the horizon, because below that you'd be looking through fifty kilometres of wet air at a satellite you can't use. Now slew the antenna to the rise azimuth, the compass direction where the satellite comes up over the horizon.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-review-pass-schedule.mp3'),
      },
      'preposition-for-aos': {
        text: `
        <p>
          The antenna's on the rise azimuth. Ten degrees a second sounds fast until you're a hundred and eighty degrees off when the satellite appears, and that's exactly where the tracker started. Now select program-track and target SAR-1, so the antenna follows the predicted path by itself. If you try to follow the satellite by hand, you'll lose it inside the first minute.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-preposition-for-aos.mp3'),
      },
      'acquire-sar1': {
        text: `
        <p>
          The beacon's on the analyzer, so the antenna is on the right satellite. Now lock the imagery carrier. When the modem locks, that's first light for the site, and you'll want the time written down. Eight dB is the acceptance line, so hold C/N above it through the top of the pass.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-acquire-sar1.mp3'),
      },
      'lock-the-downlink': {
        text: `
        <p>
          There's the lock, and C/N is above eight dB, so the site meets the acceptance line. That's first light for GW-01, so write the time down somewhere. Now watch the beacon on the analyzer as the satellite climbs toward culmination, the point where it's highest and closest.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-lock-the-downlink.mp3'),
      },
      'read-the-culmination': {
        text: `
        <p>
          That's the inverted spectrum doing exactly what the arithmetic said. The beacon came up below center, crossed the middle at culmination, and now it's leaving above center. SAR-1 sets in a few minutes, so don't retune until it's gone, or you'll drop the lock early.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-read-the-culmination.mp3'),
      },
      'retune-for-sar2': {
        text: `
        <p>
          SAR-1 is gone at 14:10, and that was the whole pass. The modem and analyzer are set for SAR-2, which has a different carrier on the same LO, so you already know what the arithmetic looks like. Now point the tracker at SAR-2 before it rises, not after.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-retune-for-sar2.mp3'),
      },
      'acquire-sar2': {
        text: `
        <p>
          SAR-2's beacon is on the analyzer, so the tracker is on the right satellite. Now lock the imagery and hold C/N above 8 dB through the top of the pass.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-acquire-sar2.mp3'),
      },
      'decode-sar2': {
        text: `
        <p>
          That's two decodes on the site's first day, and the MERIDIAN operations center in Rotterdam will act like they expected nothing less. Once SAR-2 has set, write up the shift log.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-decode-sar2.mp3'),
      },
      'log-first-light': {
        text: `
        <p>
          That's the peak C/N and its elevation on record, so the next shift has a number it can hold you to. The next pass is in about ninety minutes and it's a graze, one that barely clears the horizon, so enjoy the quiet while you've got it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/1/obj-log-first-light.mp3'),
      },
    },
  },
};
