import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { petersonGroundStation } from './ground-stations';
import { sentry7Satellite, sentry9Satellite } from './satellites';

/**
 * Campaign 5 (Signal Hunter) - Scenario 1: "First Fix"
 *
 * First scored mission of the arc. The sandbox walked the loop with the
 * numbers handed over; here the operator earns them:
 * - detect an intermittent carrier inside SENTRY-7 TP-1 and work its uplink
 *   frequency back from the IF on the analyzer (LNB LO 5150, TP-1 +2225),
 * - time a sparse duty cycle (40 s on / 90 s off, ~30%) that leaves a 12 s
 *   correlator window little slack - captures must be started inside the
 *   on-window or the console reports NO CORRELATION,
 * - collect at least six captures across the cycle, fix within 25 km, and
 *   file the incident characterization (duty cycle, bandwidth, polarization),
 * - stretch: keep collecting until the fix closes to 15 km.
 *
 * Emitter ground truth: a ranch airstrip in Quay County, eastern New Mexico
 * (35.17N 103.72W, 1.25 km MSL). Achievability of the 25 km / 15 km targets
 * against the 1.5 us / 3 Hz measurement noise is held by
 * test/campaigns/signal-hunter-scenario1-validation.test.ts, which solves the
 * same geometry headlessly at the scenario epoch.
 *
 * Scenario clock 2027-09-01 06:00:00 UTC (0000 MDT) - the epoch the SENTRY
 * TLEs were authored against (both birds ~47 deg elevation from PA-22).
 *
 * Frequency plan for this incident:
 * - Hostile uplink 6021 MHz H-pol, 3 MHz wide, inside TP-1 (5990-6030)
 * - Relayed downlink 3796 MHz -> 1354 MHz IF (service carrier sits at 1365)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0648: Skill in detecting anomalies
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures
 *   - S0421: Skill in operating communications equipment
 *   - S0593: Skill in handling incidents
 *   - S0842: Skill in recording operational events
 */
export const signalHunterScenario1Data: ScenarioData = {
  id: 'signal-hunter-scenario1',
  url: 'signal-hunter/scenarios/signal-hunter-scenario1',
  imageUrl: 'nats/21/card.png',
  number: 1,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['signal-hunter-sandbox'],
  title: 'First Fix',
  subtitle: 'Incident EW-27-0244 - SENTRY-7 TP-1',
  duration: '30-40 min',
  missionType: 'Interference Geolocation',
  description: `Midnight at Peterson Annex. The allied logistics net riding SENTRY-7 TP-1 has been dropping packets in bursts since 2140Z - about forty seconds of loss every couple of minutes - and the NOC cannot see anything wrong on a clear-write trace. The incident cell has opened EW-27-0244 and handed it to you.<br><br>Find the carrier on the analyzer, work its uplink back from the IF, and time it. The correlator integrates for twelve seconds and will not correlate on an interferer that goes quiet halfway through, so your captures have to be started inside the on-window. Six good captures across the cycle should put a 25 km fix on the map. The cell wants it, with the characterization, before the 0100Z sync.`,
  equipment: [
    '9-meter C-band Antenna (program-track on SENTRY-7)',
    'C-band RF Front End (5150 MHz LNB LO)',
    'Spectrum Analyzer (RX IF tap)',
    'Two-Satellite Geolocation Console (SENTRY-9 collector)',
  ],
  settings: {
    isSync: true,
    groundStations: [petersonGroundStation],
    satellites: [sentry7Satellite, sentry9Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-09-01',
    scenarioStartWallTime: '06:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-5/scenario-1?content-only=true&dark=true',

    workingDocument: {
      title: 'Incident Report EW-27-0244',
      description: 'SENTRY-7 TP-1 interference, PA-22, 2027-09-01. Sections: Characterization, Fix.',
    },

    interferenceEvents: [
      {
        id: 'quay-hostile',
        satelliteNoradId: 71001,
        frequency: 6021e6, // Uplink, inside SENTRY-7 TP-1 (5990-6030) -> 3796 MHz downlink, 1354 MHz IF
        bandwidth: 3e6,
        power: 4, // dBm at transponder input; ~C/I 16 dB against the 20 dBm service carrier
        polarization: 'H',
        startTime: 20,
        duration: 7200, // Persists across the session
        periodSeconds: 130, // 40 s on / 90 s off - a ~30% duty cycle
        onSeconds: 40,
        // Hidden ground truth: a ranch airstrip in Quay County, eastern New Mexico
        emitter: {
          latitude: 35.17,
          longitude: -103.72,
          altitudeKm: 1.25,
        },
      },
    ],
    geolocation: {
      primaryNoradId: 71001,
      adjacentNoradIds: [71002],
      tdoaSigmaS: 1.5e-6, // 1.5 us timing noise
      fdoaSigmaHz: 3,
      // Wider search box than the sandbox: the cell has no prior on the region
      areaOfInterest: { latMin: 26, latMax: 42, lonMin: -112, lonMax: -96 },
      captureWindowS: 12, // Needs the interferer up for >= 8.4 s of every capture
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Incident Package',
      description: 'Open the shift package for EW-27-0244: the SENTRY-7/9 transponder plan, the LNB and translation figures, and what the incident cell needs in the report.',
      groundStation: 'PA-22',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Incident Package Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'detect-interference',
      nice: ['K0926', 'S0648'],
      title: 'Find the Carrier',
      description:
        'The service carrier sits at 1365 MHz IF. Something else is inside the TP-1 passband and it is not there all the time - the max-hold trace on the RX Analysis view will keep it once it has shown up.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Unidentified Carrier Observed in TP-1',
          params: {
            signalId: 'INTERFERER-quay-hostile',
            minPower: -110 as dBm,
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
      id: 'characterize-duty-cycle',
      nice: ['K0926', 'S0648'],
      title: 'Time the Cadence',
      description:
        'Watch the clear-write trace against the mission clock through at least two full cycles. The correlator window is 12 s; you need to know how much on-time you have to work with.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['detect-interference'],
      conditions: [
        {
          type: 'status-check',
          description: 'Cadence Timed',
          params: {
            character: Character.SYSTEM,
            question: 'You have timed the unidentified carrier through two full cycles. Which cadence did you observe?',
            options: [
              'About 40 s on, then about 90 s off - a 130 s cycle',
              'About 60 s on, then about 45 s off - a 105 s cycle',
              'Continuous, with 5-10 s dropouts every few minutes',
              'About 5 s on, then about 5 s off - a 10 s cycle',
            ],
            correctIndex: 0,
            explanation:
              'Forty seconds up in every 130 - roughly a 30% duty cycle. With a 12 s integration window that is three, at most four, captures per on-window, and none at all if you start late.',
            pointPenalty: 5,
            documentLine: 'Cadence: ~40 s on / ~90 s off, 130 s period (~30% duty cycle), stable across cycles.',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'open-geolocation-console',
      nice: ['S0421'],
      title: 'Bring Up the Correlator',
      description: 'Open the Geolocation console. SENTRY-9 is the adjacent collector for this pair; the correlator has its own tuning and does not touch the receive chain.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['characterize-duty-cycle'],
      conditions: [
        {
          type: 'tab-active',
          description: 'Geolocation Console Open',
          params: { tab: 'geolocation' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'collect-measurements',
      nice: ['K0926', 'K1032', 'S0421'],
      title: 'Capture Inside the Window',
      description:
        'Work the interferer uplink back from the IF you measured (RF = LO - IF; uplink = RF + TP-1 translation) and set the correlation bandwidth to match the carrier. Start captures only while the carrier is up - the correlator needs it present for 70% of the 12 s window or it reports NO CORRELATION. Six good captures across at least two cycles.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['open-geolocation-console'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 6 TDOA/FDOA captures on the interferer',
          params: { minCount: 6, interferenceEventId: 'quay-hostile' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'compute-fix',
      nice: ['K1032', 'K0926'],
      title: 'First Fix',
      description:
        'COMPUTE FIX. The cell needs the emitter inside 25 km. If the ellipse is still wide, keep capturing through further cycles - the inclined SENTRY pair moves between windows and every new epoch rotates the FDOA line - then compute again.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['collect-measurements'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'Fix within 25 km of the emitter',
          params: { maxErrorKm: 25 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'file-incident-report',
      nice: ['S0842', 'S0593', 'K0926'],
      title: 'File the Characterization',
      description: 'Complete the characterization block of EW-27-0244: duty cycle, occupied bandwidth, and polarization. The cell hands this to the site that goes out to look.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['compute-fix'],
      conditions: [
        {
          type: 'status-check',
          description: 'Duty Cycle Reported',
          params: {
            character: Character.SYSTEM,
            question: "EW-27-0244, field 4 - DUTY CYCLE. Report the interferer's duty cycle.",
            options: [
              'Approximately 30% (40 s on in each 130 s period)',
              'Approximately 57% (60 s on in each 105 s period)',
              'Approximately 100% (on throughout each 130 s period)',
              'Approximately 10% (5 s on in each 50 s period)',
            ],
            correctIndex: 0,
            explanation: 'Logged. Forty of every 130 seconds is a 31% duty cycle - low enough to hide from a clear-write trace, high enough to hurt the customer.',
            pointPenalty: 5,
            documentLine: 'Duty cycle: ~30% (40 s on / 130 s period).',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Occupied Bandwidth Reported',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0244, field 5 - OCCUPIED BANDWIDTH. From the analyzer, how wide is the interfering carrier?',
            options: [
              'About 3 MHz - narrower than the service carrier',
              'About 8 MHz - the same as the service carrier',
              'About 40 MHz - the full transponder passband',
              'Under 100 kHz - a narrowband CW spur on the edge',
            ],
            correctIndex: 0,
            explanation:
              'Logged. A 3 MHz haystack, well inside the 40 MHz passband and clear of the 8 MHz service carrier - which is why the correlation bandwidth had to be set to match it, not to the transponder.',
            pointPenalty: 5,
            documentLine: 'Occupied bandwidth: ~3 MHz, centered 1354 MHz IF (3796 MHz downlink / 6021 MHz uplink).',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Polarization Reported',
          params: {
            character: Character.SYSTEM,
            question: "EW-27-0244, field 6 - POLARIZATION. The carrier is being relayed by SENTRY-7 TP-1. What is the interferer's uplink polarization, and how do you know?",
            options: [
              'Horizontal - TP-1 is an H-pol transponder; a cross-polarized uplink would be rejected and never show at this level',
              'Vertical - uplinks are the opposite polarization to the downlink; TP-1 comes down H-pol, so the uplink had to go up V-pol',
              'Right-hand circular - C-band military transponders are circular; a linear uplink would lose 3 dB and never reach this level',
              'Cannot be determined - polarization is lost through a transponder; only the field team at the emitter can measure the uplink',
            ],
            correctIndex: 0,
            explanation:
              "Logged. The transponder is the polarization filter: a cross-polarized uplink is rejected by ~28 dB, so only an H-pol uplink gets through TP-1 at the level you are seeing. That is a fact about the emitter's antenna the field team can use.",
            pointPenalty: 5,
            documentLine: 'Polarization: H (co-polar with TP-1; inferred from transponder routing).',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'refine-fix',
      nice: ['K1032'],
      title: 'Close the Ellipse',
      description:
        'Stretch: keep capturing through further cycles - twelve or more captures - and recompute until the fix closes to within 15 km. A tighter ellipse is fewer square kilometres for the field team to search.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['compute-fix'],
      isOptional: true,
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 12 captures on the interferer',
          params: { minCount: 12, interferenceEventId: 'quay-hostile' },
          mustMaintain: false,
        },
        {
          type: 'geolocation-fix-accuracy',
          description: 'Fix within 15 km of the emitter',
          params: { maxErrorKm: 15 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
