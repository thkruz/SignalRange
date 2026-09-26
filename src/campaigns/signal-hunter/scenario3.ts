import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { petersonGroundStation } from './ground-stations';
import { sentry7Satellite, sentry9Satellite } from './satellites';

/**
 * Campaign 5 (Signal Hunter) - Scenario 3: "Cold Trail"
 *
 * Characterising and recording an event that will not sit still. The TP-1
 * interferer is back on a new frequency, PA-22 fixes it and hands the
 * ellipse to a field team - and twenty minutes into the team's drive the
 * carrier stops. It comes back on another frequency from eighty kilometres
 * away. The operator has to notice the trail going cold, keep the first fix
 * as history rather than as a destination, clear the correlator (the solver
 * uses every capture on the pair, and two emitters solve to nowhere), and
 * fix the second carrier on its own captures.
 *
 * Two emitter-bearing events, both on SENTRY-7 TP-1, 36 s on / 84 s off:
 * - 'clayton-a': 6018 MHz uplink -> 3793 MHz downlink -> 1357 MHz IF, from
 *   T+20 to T+1520, a ranch road south of Clayton, Union County NM
 *   (36.45N 103.18W).
 * - 'clayton-b': 6001 MHz -> 3776 -> 1374 MHz IF, from T+1800 on, a caprock
 *   overlook in Harding County NM (36.02N 103.90W) - about 80 km south-west
 *   of the first site.
 *
 * Achievability of both fixes is held by
 * test/campaigns/signal-hunter-scenario3-validation.test.ts.
 *
 * Scenario clock 2027-09-07 04:45:00 UTC (2245 MDT on the 6th).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0593: Skill in handling incidents
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0648: Skill in detecting anomalies
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0842: Skill in recording operational events
 *   - S0421: Skill in operating communications equipment
 *   - K0645: Knowledge of standard operating procedures
 */
export const signalHunterScenario3Data: ScenarioData = {
  id: 'signal-hunter-scenario3',
  url: 'signal-hunter/scenarios/signal-hunter-scenario3',
  imageUrl: 'nats/23/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['signal-hunter-scenario2'],
  title: 'Cold Trail',
  subtitle: 'Incident EW-27-0263 - SENTRY-7 TP-1',
  duration: '35-45 min',
  missionType: 'Interference Geolocation',
  description: `The TP-1 interferer is back, on a new frequency, and this time there is a field team at the ready. Find it, fix it, and hand them an ellipse they can search.<br><br>Then keep watching. An emitter that has been fixed once has a habit of not being where the fix says by the time anyone gets there. If the carrier stops while the team is driving, the first fix becomes history, not a destination - and if it comes back somewhere else on the passband, the correlator has to be cleared and the hunt starts over on the new carrier alone. The report at the end has to say which fix is current, which is not, and what the emitter did in between.`,
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
    scenarioStartDate: '2027-09-07',
    scenarioStartWallTime: '04:45:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-5/scenario-3?content-only=true&dark=true',

    workingDocument: {
      title: 'Incident Report EW-27-0263',
      description: 'SENTRY-7 TP-1 interference, PA-22, 2027-09-07. Sections: Fix 1, Fix 2, Mobility.',
    },

    interferenceEvents: [
      {
        id: 'clayton-a',
        satelliteNoradId: 71001,
        frequency: 6018e6, // Uplink, inside SENTRY-7 TP-1 -> 3793 MHz downlink, 1357 MHz IF
        bandwidth: 2.5e6,
        power: 4,
        polarization: 'H',
        startTime: 20,
        duration: 1500, // Stops at T+25:20 - while the team is on the road
        periodSeconds: 120, // 36 s on / 84 s off
        onSeconds: 36,
        // Hidden ground truth: a ranch road south of Clayton, Union County, New Mexico
        emitter: {
          latitude: 36.45,
          longitude: -103.18,
          altitudeKm: 1.5,
        },
      },
      {
        id: 'clayton-b',
        satelliteNoradId: 71001,
        frequency: 6001e6, // Retuned: -> 3776 MHz downlink, 1374 MHz IF, above the service carrier
        bandwidth: 2.5e6,
        power: 4,
        polarization: 'H',
        startTime: 1800, // Back on the air 280 s after the first carrier stopped - two silent cycles and change
        duration: 7200,
        periodSeconds: 120,
        onSeconds: 36,
        // Hidden ground truth: a caprock overlook in Harding County, New Mexico - ~80 km south-west of the first site
        emitter: {
          latitude: 36.02,
          longitude: -103.9,
          altitudeKm: 1.75,
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
      nice: ['K0645'],
      title: 'Review the Incident Package',
      description: 'Open the package for EW-27-0263: the field team’s position and drive times, the transponder plan, and what the cell wants logged if the emitter moves.',
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
      id: 'find-carrier-a',
      nice: ['K0926', 'S0648'],
      title: 'Find the Carrier Below the Service',
      description: 'Max-hold on the TP-1 downlink. The interferer is back a few MHz below the service carrier; get it on the trace during an on-window.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Carrier Observed at 1357 MHz IF',
          params: {
            signalId: 'INTERFERER-clayton-a',
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
      id: 'capture-carrier-a',
      nice: ['K0926', 'K1032', 'S0421'],
      title: 'Capture the First Carrier',
      description: 'Uplink = (5150 - 1357) + 2225 = 6018 MHz, 2.5 MHz correlation bandwidth. Six captures inside the on-windows, across at least two cycles.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['find-carrier-a'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 6 captures on the 1357 MHz IF carrier',
          params: { minCount: 6, interferenceEventId: 'clayton-a' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'fix-carrier-a',
      nice: ['K1032', 'K0926'],
      title: 'Fix the First Carrier',
      description: 'COMPUTE FIX. Inside 25 km - that is the ellipse the team drives to.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['capture-carrier-a'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'First fix within 25 km of the emitter',
          params: { maxErrorKm: 25 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'brief-the-team',
      nice: ['S0593', 'S0842'],
      title: 'Brief the Team',
      description: 'The team lead wants to know what he is driving into. Tell him what a fix is, and what it is not.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['fix-carrier-a'],
      conditions: [
        {
          type: 'status-check',
          description: 'Team Briefed on the Fix',
          params: {
            character: Character.SYSTEM,
            question: 'Team lead: "Give me the site." What do you hand him?',
            options: [
              'A 95% ellipse and its centre, the carrier’s cadence so his DF kit knows when to listen, and a standing instruction: call in if the carrier stops before he arrives',
              'The centre coordinates - the ellipse is a statistical nicety and the team needs a point to drive to',
              'The centre coordinates plus 25 km in every direction, since that is the accuracy the cell asked for',
              'A hold: six captures is not enough to send a team anywhere',
            ],
            correctIndex: 0,
            explanation:
              'Logged. The fix is the ellipse: the emitter is somewhere inside it with 95% probability, and nowhere in particular inside it. The cadence is what lets a DF team pick the carrier out on arrival. And a carrier that stops while a team closes in is the single most useful thing you can tell them.',
            pointPenalty: 5,
            documentLine: 'Fix 1 (6018 MHz / 1357 IF): 95% ellipse handed to field team with cadence (36 s on / 84 s off); team instructed to report if the carrier stops.',
            documentSection: 'Fix 1',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-trail-goes-cold',
      nice: ['S0648', 'S0593'],
      title: 'The Trail Goes Cold',
      description:
        'Keep the analyzer on the passband while the team drives. If the carrier at 1357 stops and stays stopped for two full cycles, the first fix is history: say so, and say what happens next.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['brief-the-team'],
      conditions: [
        {
          type: 'interference-event-ended',
          description: 'Carrier at 1357 MHz IF Has Stopped',
          params: { interferenceEventId: 'clayton-a' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Cold Trail Called',
          params: {
            character: Character.SYSTEM,
            question: 'The carrier at 1357 MHz IF has not keyed for two full cycles. The team is twenty minutes out. What is your call?',
            options: [
              'Tell the team to hold short and stand by. Keep max-hold across the whole passband: an emitter that stops as a team closes in has moved or retuned, and the first fix is now a last-known position with a time on it',
              'Tell the team to press on to the ellipse - the fix is good and the emitter is just in a long off-window',
              'Clear the correlator and stand the team down; without a carrier there is nothing to fix',
              'Recompute the fix with more captures from the console’s history to tighten the ellipse for the team',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Two silent cycles from a carrier that has kept a 120 s cadence all night is not a long off-window. Fix 1 keeps its value as history - when the emitter was where - and loses its value as a destination. The team holds; the analyzer watches the whole passband, because a retune is the cheapest move an emitter can make.',
            pointPenalty: 5,
            documentLine: 'Fix 1 downgraded to last-known: carrier at 1357 MHz IF silent for two full cycles; field team held short; max-hold across full TP-1 passband.',
            documentSection: 'Mobility',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'find-carrier-b',
      nice: ['K0926', 'S0648'],
      title: 'New Carrier Above the Service',
      description: 'Max-hold picks up a new carrier above the service carrier, on the same cadence. Get it on the trace during an on-window.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['the-trail-goes-cold'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Carrier Observed at 1374 MHz IF',
          params: {
            signalId: 'INTERFERER-clayton-b',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'capture-carrier-b',
      nice: ['K0926', 'K1032', 'S0421'],
      title: 'Clear and Recapture',
      description:
        'CLEAR the console first. The solver uses every capture on the pair, and six captures from the first site mixed with captures from the second solve to a place that is neither. Retune: uplink = (5150 - 1374) + 2225 = 6001 MHz, 2.5 MHz bandwidth. Six captures on the new carrier alone.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['find-carrier-b'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 6 captures on the 1374 MHz IF carrier',
          params: { minCount: 6, interferenceEventId: 'clayton-b' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'fix-carrier-b',
      nice: ['K1032', 'K0926'],
      title: 'Fix the Second Carrier',
      description: 'COMPUTE FIX on the new captures alone. Inside 25 km. If the fix lands between the two sites, you did not clear.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['capture-carrier-b'],
      conditions: [
        {
          type: 'geolocation-fix-accuracy',
          description: 'Second fix within 25 km of the emitter',
          params: { maxErrorKm: 25 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'file-the-trail',
      nice: ['S0842', 'S0593', 'K0926'],
      title: 'File the Trail',
      description: 'EW-27-0263 has two fixes in it now. The report has to say which one is current, what the emitter did between them, and what that means for the team.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['fix-carrier-b'],
      conditions: [
        {
          type: 'status-check',
          description: 'Mobility Reported',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0263, field 9 - EMITTER MOBILITY. What does the report say the emitter did?',
            options: [
              'Mobile: retuned from 6018 MHz to 6001 MHz and displaced roughly 80 km south-west between fix 1 and fix 2; cadence unchanged at 36 s on / 84 s off; stopped transmitting while the field team was inbound',
              'Fixed site with a frequency-agile transmitter: same location, new frequency',
              'Two separate emitters operating in turn; no evidence either one moved',
              'Unknown - the correlator cannot tell a moved emitter from a retuned one',
            ],
            correctIndex: 0,
            explanation:
              'Logged. Two fixes on the same pair, eighty kilometres apart, with the same cadence on two frequencies and a silence between them that began as the team closed in: that is one emitter that moved and knew why it was moving. The cadence carried over is what ties the two carriers to one operator.',
            pointPenalty: 5,
            documentLine: 'Mobility: MOBILE - retuned 6018 -> 6001 MHz, displaced ~80 km SW between fixes, cadence unchanged (36/84), went silent with field team inbound.',
            documentSection: 'Mobility',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Current Fix Identified',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0263, field 7 - FIX. Which fix does the team get, and how is the other one recorded?',
            options: [
              'Fix 2 (6001 MHz) as current, with its ellipse and time; fix 1 (6018 MHz) retained as last-known with the time the carrier stopped',
              'Both fixes as current targets - the team splits and searches both ellipses',
              'Fix 1 only - it has the longer capture history and the tighter ellipse',
              'Neither - a mobile emitter cannot be fixed; the report recommends the ticket be closed',
            ],
            correctIndex: 0,
            explanation:
              'Logged. One current fix with its time; one historical fix with its time. A report that keeps both, labelled, is the one that lets the next shift see the emitter’s track instead of a single stale point.',
            pointPenalty: 5,
            documentLine: 'Fix 2 (6001 MHz / 1374 IF) current - ellipse to field team; Fix 1 retained as last-known with time of loss.',
            documentSection: 'Fix 2',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
