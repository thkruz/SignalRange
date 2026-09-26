import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { petersonGroundStation } from './ground-stations';
import { sentry7Satellite, sentry9Satellite } from './satellites';

/**
 * Campaign 5 (Signal Hunter) - Scenario 4: "Prove It"
 *
 * The limits of a result, and the report that states them. Last night's fix
 * on a TP-1 interferer put an ellipse thirty-odd kilometres from Cannon AFB,
 * whose own C-band terminal is authorised on TP-1, and the customer's J6
 * has said in writing that PA-22 is pointing at an allied site. Before a
 * field team drives anywhere the fix has to be proven:
 * - the correlator is checked against a known emitter first: the Cannon
 *   terminal's carrier ('cannon-reference', 6003 MHz uplink -> 1372 MHz IF,
 *   continuous) is captured and fixed, and the fix has to land on Cannon.
 *   A fix that lands on a known terminal is the pair's own calibration;
 * - the console is cleared and the hostile ('curry-hostile', 6021 MHz ->
 *   1354 MHz IF, 36 s on / 84 s off) is captured on its own and fixed;
 * - the ellipse is closed to 20 km until it cannot reach Cannon (the
 *   hostile sits ~56 km east of the base), which is the new
 *   geolocation-ellipse-within condition: graded on the ellipse the console
 *   reports, not on hidden truth;
 * - the call is made on the evidence and the report states its basis and
 *   its confidence in words the team lead can act on.
 *
 * The decision is graded on transponder-interference-active: the hostile is
 * still keying while the call is made, so the answer is to task the team
 * now, not to file a last-known position.
 *
 * Emitter ground truth: a centre-pivot field access outside Friona, Parmer
 * County, Texas (34.75N 102.90W, 1.20 km MSL). Achievability of the fix and
 * ellipse targets is held by
 * test/campaigns/signal-hunter-scenario4-validation.test.ts.
 *
 * Scenario clock 2027-09-10 05:15:00 UTC (2315 MDT on the 9th).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0593: Skill in handling incidents
 * Supporting Codes:
 *   - K0946: Knowledge of incident reporting requirements
 *   - S0842: Skill in recording operational events
 *   - S0421: Skill in operating communications equipment
 *   - K0645: Knowledge of standard operating procedures
 */
export const signalHunterScenario4Data: ScenarioData = {
  id: 'signal-hunter-scenario4',
  url: 'signal-hunter/scenarios/signal-hunter-scenario4',
  imageUrl: 'nats/24/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['signal-hunter-scenario3'],
  title: 'Prove It',
  subtitle: 'Incident EW-27-0270 - SENTRY-7 TP-1',
  duration: '35-45 min',
  missionType: 'Interference Geolocation',
  description: `Last night's fix on the TP-1 interferer landed in eastern New Mexico, thirty-some kilometres from Cannon AFB - and Cannon has an authorised C-band terminal on the same transponder. JTF-S J6 has put it in writing: PA-22 is geolocating an allied site, and the field team is not moving until somebody proves otherwise.<br><br>So prove it. Fix the Cannon terminal first, because a correlator that puts a known emitter where it belongs is a correlator you can trust tonight. Clear the console, fix the hostile on its own, and close the ellipse until it excludes the base. Then make the call and write the report so that a team lead, a J6, and a major at 0100Z can all read where the emitter is, where it is not, and how sure you are.`,
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
    scenarioStartDate: '2027-09-10',
    scenarioStartWallTime: '05:15:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-5/scenario-4?content-only=true&dark=true',

    workingDocument: {
      title: 'Incident Report EW-27-0270',
      description: 'SENTRY-7 TP-1 interference, PA-22, 2027-09-10. Sections: Calibration, Fix, Basis, Confidence.',
    },

    interferenceEvents: [
      {
        // The allied terminal at Cannon AFB: an authorised carrier on TP-1,
        // modelled as an emitter-bearing event so the correlator can fix it.
        id: 'cannon-reference',
        satelliteNoradId: 71001,
        frequency: 6003e6, // Uplink, inside TP-1 -> 3778 MHz downlink, 1372 MHz IF
        bandwidth: 2e6,
        power: 2, // dBm at transponder input
        polarization: 'H',
        startTime: 0,
        duration: 7200,
        periodSeconds: 7200, // Continuous: it is a working terminal
        onSeconds: 7200,
        // Cannon AFB, Clovis, New Mexico (known site; printed in the package)
        emitter: {
          latitude: 34.383,
          longitude: -103.322,
          altitudeKm: 1.31,
        },
      },
      {
        id: 'curry-hostile',
        satelliteNoradId: 71001,
        frequency: 6021e6, // Uplink, inside TP-1 -> 3796 MHz downlink, 1354 MHz IF
        bandwidth: 3e6,
        power: 4,
        polarization: 'H',
        startTime: 20,
        duration: 7200,
        periodSeconds: 120, // 36 s on / 84 s off
        onSeconds: 36,
        // Hidden ground truth: a centre-pivot field access outside Friona, Parmer County, Texas - ~56 km east of Cannon
        emitter: {
          latitude: 34.75,
          longitude: -102.9,
          altitudeKm: 1.2,
        },
      },
    ],
    geolocation: {
      primaryNoradId: 71001,
      adjacentNoradIds: [71002],
      tdoaSigmaS: 1.5e-6,
      fdoaSigmaHz: 3,
      areaOfInterest: { latMin: 26, latMax: 42, lonMin: -112, lonMax: -96 },
      captureWindowS: 12,
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0946'],
      title: 'Review the Incident Package',
      description:
        'Open the package for EW-27-0270: last night’s fix, the J6 message, the Cannon terminal’s authorised carrier, and what a report that survives a challenge has to contain.',
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
      id: 'find-both-carriers',
      nice: ['K0926', 'S0648'],
      title: 'Find the Reference and the Hostile',
      description:
        'Two carriers off the plan tonight, and one of them is supposed to be there. The Cannon terminal is continuous at 1372 MHz IF; the hostile cycles at 1354. Observe both on RX Analysis before you touch the correlator.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Hostile Carrier Observed at 1354 MHz IF',
          params: {
            signalId: 'INTERFERER-curry-hostile',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'Cannon Reference Carrier Observed at 1372 MHz IF',
          params: {
            signalId: 'INTERFERER-cannon-reference',
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
      id: 'capture-the-reference',
      nice: ['K1032', 'S0421'],
      title: 'Capture the Reference',
      description:
        'Tune the correlator to the Cannon terminal first: uplink 6003 MHz, 2 MHz correlation bandwidth. It is continuous, so every capture correlates. Six captures - and let a couple of minutes pass between them so the FDOA lines rotate.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['find-both-carriers'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 6 captures on the Cannon reference carrier',
          params: { minCount: 6, interferenceEventId: 'cannon-reference' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'fix-the-reference',
      nice: ['K1032'],
      title: 'Fix the Reference',
      description:
        'COMPUTE FIX on the reference captures. The Cannon terminal is at a known position; the fix has to land within 20 km of it or the pair is not to be trusted tonight.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['capture-the-reference'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'Reference fix within 20 km of Cannon AFB',
          params: { maxErrorKm: 20 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-calibration',
      nice: ['K1032', 'S0593'],
      title: 'Read the Calibration',
      description: 'A fix on a known emitter is the correlator’s own check. Say what it proves, and what it does not.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['fix-the-reference'],
      conditions: [
        {
          type: 'status-check',
          description: 'Calibration Read',
          params: {
            character: Character.SYSTEM,
            question: 'The reference fix landed on Cannon AFB inside 20 km. What does that prove?',
            options: [
              'That the pair’s geometry, timing, and frequency references are sound tonight - a known emitter went where it belongs. It says nothing yet about the hostile',
              'That the hostile is not at Cannon - the correlator has now accounted for the base',
              'That the hostile fix from last night was correct, since the same correlator produced both',
              'That Cannon’s terminal is the interferer - it is the carrier the correlator could fix',
            ],
            correctIndex: 0,
            explanation:
              'Logged. A calibration fix is a statement about the instrument, not about the target: it tells the J6 that when this pair says a carrier is somewhere, it is. The hostile still has to be fixed on its own captures.',
            pointPenalty: 5,
            documentLine: 'Calibration: Cannon AFB terminal (6003 MHz) fixed within 20 km of its surveyed position on the SENTRY-7/9 pair before the hostile was worked.',
            documentSection: 'Calibration',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'clear-and-hunt',
      nice: ['K0926', 'K1032', 'S0421'],
      title: 'Clear and Hunt',
      description:
        'CLEAR the console - the solver uses every capture on the pair, and reference captures mixed into the hostile set would drag the fix toward Cannon and hand the J6 his argument. Retune to 6021 MHz, 3 MHz bandwidth, and capture inside the on-windows. Eight captures across at least three cycles.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['read-the-calibration'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 8 captures on the hostile carrier',
          params: { minCount: 8, interferenceEventId: 'curry-hostile' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'fix-the-hostile',
      nice: ['K1032', 'K0926'],
      title: 'Fix the Hostile',
      description: 'COMPUTE FIX on the hostile captures alone. Inside 20 km.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['clear-and-hunt'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'Hostile fix within 20 km of the emitter',
          params: { maxErrorKm: 20 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'prove-it',
      nice: ['K1032', 'S0593'],
      title: 'Close the Ellipse Past Cannon',
      description:
        'A fix is an ellipse, and the ellipse is the claim. Keep capturing through further cycles - twelve or more - and recompute until the 95% ellipse’s semi-major axis is 20 km or less. Cannon is more than fifty kilometres from where the hostile captures are solving; an ellipse that small cannot reach it.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['fix-the-hostile'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 12 captures on the hostile carrier',
          params: { minCount: 12, interferenceEventId: 'curry-hostile' },
          mustMaintain: false,
        },
        {
          type: 'geolocation-ellipse-within',
          description: '95% error ellipse semi-major axis 20 km or less',
          params: { maxSemiMajorKm: 20 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'make-the-call',
      nice: ['S0593', 'K0926', 'K1032'],
      title: 'Make the Call',
      description: 'The team lead is on the line with the J6 message in one hand and your two fixes in the other. With the hostile on the trace in front of you, make the call.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['prove-it'],
      conditions: [
        {
          id: 'hostile-seen',
          type: 'signal-detected',
          description: 'Hostile carrier on the trace',
          params: {
            signalId: 'INTERFERER-curry-hostile',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Where the Team Goes',
          params: {
            character: Character.SYSTEM,
            prompt:
              'Team lead: "J6 says I’m about to drive onto an Air Force base with a direction-finding kit. You have two fixes. Where am I going, and how sure are you?" Make the call.',
            evidence: ['hostile-seen'],
            decisionOptions: [
              {
                label:
                  'Hostile, not Cannon. The reference fix put the Cannon terminal on Cannon, so the pair is good tonight; the hostile fix on its own captures sits over fifty kilometres east of the base with an ellipse of 20 km or less; and it is still keying on its 36/120 cycle right now. Task the team to the ellipse; the correlator stays on it while they drive',
                correctWhen: { fact: 'transponder-interference-active', is: true },
                consequence: { log: 'EW-27-0270: hostile fix affirmed against the Cannon calibration; field team tasked to the ellipse with the emitter still active' },
              },
              {
                label: 'The emitter has gone quiet - file the fix as last-known, stand the team down, and re-task if it comes back',
                correctWhen: { fact: 'transponder-interference-active', is: false },
                feedback:
                  'It keyed up inside the last two minutes and it is on the trace in front of you. Last-known is what you write when the carrier has stopped; while it is still cycling, the fix is current and the team can drive to it.',
              },
              {
                label: 'Cannon’s terminal is the source - ask the J6 to have it shut down and watch the net recover',
                feedback:
                  'You fixed the Cannon terminal and it went to Cannon. You fixed the hostile and it went somewhere else, fifty kilometres away, on the same pair, the same night. Two carriers, two places. Shutting down an authorised terminal to test a theory the correlator has already disproved costs the customer a working link.',
              },
              {
                label: 'Inconclusive - two carriers eighteen MHz apart on one transponder need a third satellite to separate. Hold the team',
                feedback:
                  'The correlator separates carriers by tuning, not by geometry: each capture correlates on one carrier at a time, and you solved each set on its own. A third satellite tightens an ellipse; it is not what tells two carriers apart.',
              },
            ],
            explanation:
              'The proof is three things in order: the instrument checked against a known emitter, the target fixed on its own captures, and an ellipse small enough to exclude the alternative. With the carrier still keying, that fix is current and the team drives to it.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'file-the-proof',
      nice: ['K0946', 'S0842', 'S0593'],
      title: 'File the Proof',
      description:
        'EW-27-0270 goes to the J6 as well as to Holt. Two fields carry the argument: the basis for excluding Cannon, and a confidence statement someone can hold you to.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['make-the-call'],
      conditions: [
        {
          type: 'status-check',
          description: 'Basis for Exclusion Reported',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0270, field 10 - BASIS FOR EXCLUDING THE ALLIED TERMINAL. What goes in the report?',
            options: [
              'Reference fix on the Cannon terminal (6003 MHz) landed within 15 km of its surveyed position on the same pair tonight; hostile (6021 MHz) fixed on its own captures after a console clear; hostile 95% ellipse semi-major 20 km or less, centred over 50 km from Cannon',
              'The hostile is on a different frequency from the Cannon terminal, so it cannot be the same emitter',
              'The J6 was asked and confirmed the Cannon terminal was not transmitting on 6021 MHz',
              'The hostile cycles and an authorised terminal would not, so it is not Cannon',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Frequency and cadence are suggestive; the basis that survives a challenge is the measurement chain: instrument checked, target solved alone, ellipse too small to reach the alternative.',
            pointPenalty: 5,
            documentLine:
              'Basis: Cannon reference fix within 15 km on the same pair; hostile solved on its own captures after clear; hostile 95% ellipse <= 20 km semi-major, centred > 50 km from Cannon AFB.',
            documentSection: 'Basis',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Confidence Statement Filed',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0270, field 11 - CONFIDENCE. Which statement belongs in the report?',
            options: [
              'Emitter assessed inside the reported 95% ellipse with high confidence; Cannon AFB excluded; emitter active at time of report and being tracked',
              'Emitter located at the fix coordinates',
              'Emitter probably somewhere in eastern New Mexico or the Texas panhandle',
              'Emitter confirmed by the field team',
            ],
            correctIndex: 0,
            explanation:
              'Logged. A confidence statement names the region, the probability, what was excluded, and the state of the emitter when you wrote it. A point is a claim you cannot support; a panhandle is a claim nobody can use; the team has not confirmed anything yet.',
            pointPenalty: 5,
            documentLine: 'Confidence: emitter assessed inside the reported 95% ellipse (high); Cannon AFB excluded; emitter active at time of report, correlator tracking.',
            documentSection: 'Confidence',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ],
};
