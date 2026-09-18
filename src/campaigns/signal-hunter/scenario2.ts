import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz } from '@app/types';
import { petersonGroundStation } from './ground-stations';
import { sentry7Satellite, sentry9Satellite } from './satellites';

/**
 * Campaign 5 (Signal Hunter) - Scenario 2: "Two Carriers"
 *
 * The uplink-versus-downlink call. Two unidentified carriers sit in the TP-1
 * downlink at PA-22 and the operator has to sort them before the correlator
 * is any use:
 * - 'dalhart-uplink' rides SENTRY-7 TP-1 (6001 MHz uplink -> 3776 MHz
 *   downlink -> 1374 MHz IF), 36 s on / 84 s off. Every station under the
 *   bird hears it; SENTRY-9 hears it through its sidelobes; the correlator
 *   can fix it.
 * - 'fountain-terrestrial' never touches a satellite: a fixed-wireless site
 *   south-east of the annex whose 3752 MHz sector arrives at the 9 m dish
 *   through its own sidelobes (1398 MHz IF). Continuous, no Doppler, and the
 *   correlator reports NO CORRELATION however it is tuned - there is nothing
 *   on the bird to correlate. That is a receive-site problem for spectrum
 *   management, not a target for the field team.
 *
 * The decision is graded on the transponder-/terrestrial-interference-active
 * facts, so the same option set would grade differently in a scenario with
 * only one of the two paths in play.
 *
 * Emitter ground truth for the uplink: a grain elevator lot outside Dalhart,
 * Dallam County, Texas (36.06N 102.52W, 1.22 km MSL). Achievability of the
 * 25 km / 15 km targets is held by
 * test/campaigns/signal-hunter-scenario2-validation.test.ts.
 *
 * Scenario clock 2027-09-04 05:30:00 UTC (2330 MDT on the 3rd) - three
 * nights after First Fix, same SENTRY geometry.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0648: Skill in detecting anomalies
 *   - K1032: Knowledge of satellite-based communication systems
 * Supporting Codes:
 *   - K0645: Knowledge of standard operating procedures
 *   - S0421: Skill in operating communications equipment
 *   - S0593: Skill in handling incidents
 *   - S0842: Skill in recording operational events
 */
export const signalHunterScenario2Data: ScenarioData = {
  id: 'signal-hunter-scenario2',
  url: 'signal-hunter/scenarios/signal-hunter-scenario2',
  imageUrl: 'nats/22/card.png',
  number: 2,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['signal-hunter-scenario1'],
  title: 'Two Carriers',
  subtitle: 'Incident EW-27-0251 - SENTRY-7 TP-1',
  duration: '30-40 min',
  missionType: 'Interference Discrimination',
  description: `Three nights after First Fix the logistics net is dropping packets again, and this time the NOC's max-hold shows two carriers in the TP-1 downlink that were not there last week. One cycles. One does not. The incident cell has opened EW-27-0251 and wants to know which of them the field team drives to.<br><br>Only one of those carriers is coming through the satellite. The other is arriving at the dish directly, from the ground, and no satellite pair will ever correlate on it. Sort them - by cadence, by what the correlator can and cannot see - then fix the one that is a target and refer the one that is not.`,
  equipment: [
    '9-meter C-band Antenna (program-track on SENTRY-7)',
    'C-band RF Front End (5150 MHz LNB LO)',
    'Spectrum Analyzer (RX IF tap, 60 MHz span)',
    'Two-Satellite Geolocation Console (SENTRY-9 collector)',
  ],
  settings: {
    isSync: true,
    groundStations: [
      {
        ...petersonGroundStation,
        // Wider opening span than First Fix: both carriers have to fit on one trace
        spectrumAnalyzers: petersonGroundStation.spectrumAnalyzers.map((analyzer, index) =>
          index === 0 ? { ...analyzer, centerFrequency: 1380e6 as Hertz, span: 60e6 as Hertz } : analyzer
        ),
      },
    ],
    satellites: [sentry7Satellite, sentry9Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-09-04',
    scenarioStartWallTime: '05:30:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-5/scenario-2?content-only=true&dark=true',

    workingDocument: {
      title: 'Incident Report EW-27-0251',
      description: 'SENTRY-7 TP-1 interference, PA-22, 2027-09-04. Sections: Characterization, Disposition, Fix.',
    },

    interferenceEvents: [
      {
        id: 'dalhart-uplink',
        satelliteNoradId: 71001,
        frequency: 6001e6, // Uplink, inside SENTRY-7 TP-1 (5990-6030) -> 3776 MHz downlink, 1374 MHz IF
        bandwidth: 2.5e6,
        power: 4, // dBm at transponder input
        polarization: 'H',
        startTime: 20,
        duration: 7200,
        periodSeconds: 120, // 36 s on / 84 s off - three 12 s captures per window
        onSeconds: 36,
        // Hidden ground truth: a grain elevator lot outside Dalhart, Dallam County, Texas
        emitter: {
          latitude: 36.06,
          longitude: -102.52,
          altitudeKm: 1.22,
        },
      },
      {
        id: 'fountain-terrestrial',
        frequency: 3752e6, // Received directly at 3752 MHz -> 1398 MHz IF; would read as a 5977 MHz uplink if it were relayed, which is below TP-1
        bandwidth: 5e6,
        // EIRP in PA-22's direction, dBm: an off-axis slice of a fixed-wireless
        // sector 27 km away. Through the dish's own far sidelobes it lands a
        // few dB above the relayed service carrier at the feed.
        power: 28,
        polarization: 'H',
        startTime: 0,
        duration: 7200,
        periodSeconds: 7200, // Continuous: a site that is simply on
        onSeconds: 7200,
        path: 'terrestrial',
        // A fixed-wireless site south-east of Fountain, Colorado
        emitter: {
          latitude: 38.62,
          longitude: -104.52,
          altitudeKm: 1.72,
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
      description: 'Open the package for EW-27-0251: the NOC max-hold with two carriers on it, the transponder plan, and what the cell needs before anyone drives anywhere.',
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
      title: 'Find Both Carriers',
      description:
        'The analyzer opens on a 60 MHz span centered at 1380. The service carrier is at 1365. Find the two carriers that are not on the transponder plan - one a few MHz above the service carrier, one well above it - and watch what each of them does against the clock.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Cycling Carrier Observed at 1374 MHz IF',
          params: {
            signalId: 'INTERFERER-dalhart-uplink',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'Continuous Carrier Observed at 1398 MHz IF',
          params: {
            signalId: 'INTERFERER-fountain-terrestrial',
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
      id: 'time-the-carriers',
      nice: ['K0926', 'S0648'],
      title: 'Time What Cycles',
      description: 'Two full cycles on the clear-write trace. One of the two carriers has a cadence; the other has none. Log both.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['find-both-carriers'],
      conditions: [
        {
          type: 'status-check',
          description: 'Cadence Logged for Both',
          params: {
            character: Character.SYSTEM,
            question: 'You have watched both carriers through two full cycles of the mission clock. What did you see?',
            options: [
              'The 1374 carrier is up about 36 s in every 120 s; the 1398 carrier never drops',
              'Both carriers cycle together: about 36 s on, 84 s off',
              'The 1398 carrier cycles at about 36 s on / 84 s off; the 1374 carrier never drops',
              'Neither carrier cycles - both are continuous at a steady level',
            ],
            correctIndex: 0,
            explanation:
              'A 30% duty cycle on one carrier and none on the other. Something keyed on a schedule is a decision somebody made; something that is simply on all night is usually a site that is simply on all night.',
            pointPenalty: 5,
            documentLine: 'Cadence: 1374 MHz IF ~36 s on / 84 s off (120 s period, ~30%); 1398 MHz IF continuous.',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-path',
      nice: ['K0926', 'K1032', 'S0648'],
      title: 'Call the Path',
      description:
        'Which carrier came through the satellite and which arrived at the dish directly? Try the correlator on each: it sees what the two satellites see, and nothing else. Then make the call - one of these is a target for the field team and one is a referral.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['time-the-carriers'],
      conditions: [
        {
          id: 'uplink-seen',
          type: 'signal-detected',
          description: 'Cycling carrier on the trace',
          params: {
            signalId: 'INTERFERER-dalhart-uplink',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          id: 'terrestrial-seen',
          type: 'signal-detected',
          description: 'Continuous carrier on the trace',
          params: {
            signalId: 'INTERFERER-fountain-terrestrial',
            minPower: -110 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'Which Carrier Is the Target',
          params: {
            character: Character.SYSTEM,
            prompt: 'Quintero: "Two carriers, one field team. Which one do I send them after, and what do I do with the other one?" Make the call.',
            evidence: ['uplink-seen', 'terrestrial-seen'],
            decisionOptions: [
              {
                label:
                  'The 1374 carrier is on the transponder - it cycles, it maps to a 6001 MHz uplink inside TP-1, and the correlator locks it. The 1398 carrier is local: continuous, no uplink that fits the plan, NO CORRELATION however it is tuned. Fix 1374; refer 1398 to spectrum management as receive-site RFI',
                correctWhen: {
                  all: [
                    { fact: 'transponder-interference-active', is: true },
                    { fact: 'terrestrial-interference-active', is: true },
                  ],
                },
                consequence: { log: 'EW-27-0251: 1374 MHz IF called as uplink interference through TP-1; 1398 MHz IF called as terrestrial RFI at PA-22 and referred' },
              },
              {
                label: 'Both carriers are uplink interference through TP-1 - capture both, fix both, and give the team two ellipses',
                correctWhen: {
                  all: [
                    { fact: 'transponder-interference-active', is: true },
                    { fact: 'terrestrial-interference-active', is: false },
                  ],
                },
                feedback:
                  'Tune the correlator to the 1398 carrier and it says NO CORRELATION every time, because SENTRY-9 has never heard it. A carrier that only one dish on Earth can see did not come through a satellite. There is one ellipse in this incident.',
              },
              {
                label: 'Both carriers are local RFI at the annex - nothing here for the correlator. Refer both to spectrum management and close the ticket',
                correctWhen: {
                  all: [
                    { fact: 'transponder-interference-active', is: false },
                    { fact: 'terrestrial-interference-active', is: true },
                  ],
                },
                feedback:
                  'The 1374 carrier correlates against SENTRY-9 and keys on a schedule. The customer is losing packets to something that is coming down through their own transponder; the annex is not the problem and closing the ticket leaves the team with nothing.',
              },
              {
                label: 'The 1398 carrier is the interferer - it is the stronger of the two and it sits inside the TP-1 downlink. Work it back to 5977 MHz and correlate on that',
                feedback:
                  '5977 MHz is below the TP-1 passband; nothing at that frequency is relayed, so there is nothing at 1398 for the correlator to find. Strong is not the same as through the bird. Strong and continuous at a single dish is what a nearby ground emitter looks like.',
              },
            ],
            explanation:
              'The correlator answers the question for you if you let it: it cross-correlates what SENTRY-7 and SENTRY-9 both received, so anything only PA-22 can hear comes back NO CORRELATION. The cycling carrier fits a TP-1 uplink, correlates, and is the target. The continuous carrier fits no uplink, never correlates, and is somebody else’s ticket.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'collect-measurements',
      nice: ['K0926', 'K1032', 'S0421'],
      title: 'Capture the Uplink Carrier',
      description:
        'Correlator on the 1374 carrier only: uplink = (5150 - 1374) + 2225 = 6001 MHz, correlation bandwidth matched to the 2.5 MHz haystack. Thirty-six seconds up in every 120 is three captures per window if you start at the top of it. Six good captures across at least two cycles.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['call-the-path'],
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 6 TDOA/FDOA captures on the uplink carrier',
          params: { minCount: 6, interferenceEventId: 'dalhart-uplink' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'compute-fix',
      nice: ['K1032', 'K0926'],
      title: 'Fix the Uplink Carrier',
      description: 'COMPUTE FIX. The cell needs the emitter inside 25 km. If the ellipse is still wide, capture through further cycles and compute again.',
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
      points: 15,
    },
    {
      id: 'file-the-disposition',
      nice: ['S0842', 'S0593', 'K0926'],
      title: 'File the Disposition',
      description: 'Two carriers, two dispositions. EW-27-0251 needs the uplink frequency for the one the team is driving to and a referral for the one they are not.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['compute-fix'],
      conditions: [
        {
          type: 'status-check',
          description: 'Uplink Frequency Reported',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0251, field 3 - FREQUENCY. Report the uplink center of the carrier the field team is driving to.',
            options: [
              '6001 MHz (3776 MHz downlink, 1374 MHz IF, via TP-1)',
              '5977 MHz (3752 MHz downlink, 1398 MHz IF, via TP-1)',
              '6021 MHz (3796 MHz downlink, 1354 MHz IF, via TP-1)',
              '3776 MHz (the correlator is tuned to the downlink)',
            ],
            correctIndex: 0,
            explanation:
              'Logged. IF 1374 -> downlink 3776 -> uplink 6001, inside TP-1 and on the transponder polarization. The correlator was tuned to the uplink because that is what both satellites received.',
            pointPenalty: 5,
            documentLine: 'Frequency: 6001 MHz uplink (3776 MHz downlink / 1374 MHz IF), 2.5 MHz occupied, H-pol via TP-1.',
            documentSection: 'Characterization',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Terrestrial Carrier Referred',
          params: {
            character: Character.SYSTEM,
            question: 'EW-27-0251, field 8 - DISPOSITION OF THE 1398 MHz IF CARRIER. Where does it go?',
            options: [
              'Referred to spectrum management as terrestrial RFI at PA-22: continuous, no correlation on the SENTRY pair, consistent with a fixed-wireless site in the 3.7 GHz band south-east of the annex',
              'Held on the incident as a second uplink interferer pending a fix from a different satellite pair',
              'Closed as a customer-side fault: the carrier is on the customer’s transponder, so it is the customer’s problem',
              'Escalated to the field team as a second target on the same drive',
            ],
            correctIndex: 0,
            explanation:
              'Logged. A carrier only this dish can hear, in a band terrestrial systems share with C-band downlinks, is a coordination problem at the receive site. It hurts the customer, so it does not get ignored - it gets the right office.',
            pointPenalty: 5,
            documentLine: 'Disposition: 1398 MHz IF (3752 MHz) referred to spectrum management as terrestrial RFI at PA-22 - continuous, NO CORRELATION on the SENTRY-7/9 pair.',
            documentSection: 'Disposition',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'refine-fix',
      nice: ['K1032'],
      title: 'Close the Ellipse',
      description:
        'Stretch: twelve or more captures on the uplink carrier and a fix inside 15 km. Every capture on the wrong carrier is twelve seconds the team does not get back.',
      groundStation: 'PA-22',
      prerequisiteObjectiveIds: ['compute-fix'],
      isOptional: true,
      conditions: [
        {
          type: 'geolocation-measurements-collected',
          description: 'At least 12 captures on the uplink carrier',
          params: { minCount: 12, interferenceEventId: 'dalhart-uplink' },
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
