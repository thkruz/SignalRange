import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { Hertz, IfFrequency, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { sandstormGroundStation } from './ground-stations';
import { cobalt4Satellite, TALON2_TLE, talon2Satellite } from './satellites';

/**
 * Campaign 4 (9th EWS / Counter Communications) - Scenario 5 "Ranging Pass"
 *
 * Third TALON-2 backup contact. The spacecraft engineers (callsign LANTERN)
 * have an east-west station-keeping burn scheduled at 02:14Z and want a
 * ranging arc from SANDSTORM around it: three ranging tones before the burn,
 * the post-burn element set loaded when it is issued, three tones after.
 * Each tone goes up the command path like a command, and when it ACKs the
 * console records the true slant range to the bird. The step in range
 * between the last pre-burn tone and the first post-burn tone, with the bird
 * still in the beam, is the burn - and the reason the pass schedule reads
 * EPHEMERIS STALE until the new set is loaded.
 *
 * Phase 18 E: ranging and tracking to refine a position (9.11) as a
 * measurement the operator takes, a step they read, and a set they load.
 * Reuses the M4 ephemeris mechanic on a GEO bird: initialTle is the pre-burn
 * set (mean anomaly -0.10 deg, ~1.5 km of slant range from SANDSTORM), the
 * bird moves onto the authored set at T+840, the station predicts from the
 * old one until the update is loaded.
 *
 * Timeline (mission elapsed): window T+300 .. T+2400. Burn T+840. Ranging
 * needs six ACKed tones for a solution (settings.commanding.ranging).
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems (orbit determination inputs)
 *   - T1138: Update ephemeris / orbital data
 * Supporting Codes:
 *   - T0431: Monitor timing and telemetry reference systems
 *   - S0421: Skill in operating communications equipment
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - T0153: Monitor system performance
 *   - S0648: Skill in detecting anomalies
 */

/** SS-01 as last night left it: monitor on TALON-2, receiver 3 on 1625, modem 1 on the TT&C IF. Deep clone, never spread. */
const sandstormRanging: GroundStationConfig = structuredClone(sandstormGroundStation) as unknown as GroundStationConfig;
sandstormRanging.antennasState![1] = {
  ...sandstormRanging.antennasState![1],
  azimuth: 166.0 as Degrees,
  elevation: 49.6 as Degrees,
  targetAzimuth: 166.0 as Degrees,
  targetElevation: 49.6 as Degrees,
  beaconFrequencyHz: 7300e6 as Hertz,
};
sandstormRanging.receivers![2].modems![0] = { ...sandstormRanging.receivers![2].modems![0], frequency: 1625 as MHz };
sandstormRanging.transmitters![0].modems[0] = {
  ...sandstormRanging.transmitters![0].modems[0],
  ifSignal: { ...sandstormRanging.transmitters![0].modems[0].ifSignal, frequency: 1200e6 as IfFrequency },
};

/** The pre-burn set the station predicts from at 02:00 (mean anomaly -0.10 deg: ~1.5 km of slant range). */
const TALON2_PRE_BURN_TLE2 = '2 90071   0.0500 147.0000 0001000  90.0000  89.9000  1.00273791123450';

const TALON2_CHANNELS = [
  { id: 'bus-v', label: 'Main bus voltage', unit: 'V', subsystem: 'EPS', nominal: 28.0, noise: 0.2, yellowLow: 26.5, yellowHigh: 29.5, redLow: 25.5, redHigh: 30.5 },
  { id: 'batt-soc', label: 'Battery state of charge', unit: '%', subsystem: 'EPS', nominal: 90, noise: 0.4, yellowLow: 70, redLow: 55, decimals: 0 },
  { id: 'batt-t', label: 'Battery temperature', unit: 'degC', subsystem: 'TCS', nominal: 20, noise: 0.3, yellowLow: 5, yellowHigh: 32, redLow: 0, redHigh: 40 },
  { id: 'prop-p', label: 'Propellant tank pressure', unit: 'bar', subsystem: 'PROP', nominal: 14.2, noise: 0.05, yellowLow: 9, redLow: 6 },
  {
    id: 'wheel-rpm',
    label: 'Reaction wheel 1 speed',
    unit: 'rpm',
    subsystem: 'ADCS',
    nominal: 3300,
    noise: 30,
    yellowLow: 1500,
    yellowHigh: 5000,
    redLow: 800,
    redHigh: 6000,
    decimals: 0,
  },
  { id: 'tp-pwr', label: 'TP-T1 output power', unit: 'dBm', subsystem: 'COMM', nominal: 42, noise: 0.2, yellowLow: 38, yellowHigh: 44, redLow: 35, redHigh: 46 },
  { id: 'cpu-load', label: 'OBC processor load', unit: '%', subsystem: 'OBC', nominal: 36, noise: 2, yellowHigh: 70, redHigh: 90, decimals: 0 },
];

export const ccsScenario5Data: ScenarioData = {
  id: 'ccs-scenario5',
  url: 'ccs/scenarios/ccs-scenario5',
  imageUrl: 'nats/24/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ccs-scenario4'],
  title: 'Ranging Pass',
  subtitle: 'A Burn, a Step, and a New Set',
  duration: '25-35 min',
  missionType: 'Spacecraft Operations',
  description: `Third backup contact on TALON-2, and this one the engineers asked for. LANTERN has an east-west station-keeping burn at 0214Z and wants a ranging arc around it from SANDSTORM: tones before, the post-burn set loaded when it is issued, tones after.
  <br/><br/>A ranging tone goes up like a command and comes back with a number: the distance to the bird, to a tenth of a kilometre. Take three. Watch the burn happen as a step in that number with the bird still in the beam. Load the set that explains the step. Take three more. Hand LANTERN a solution.`,
  equipment: [
    '3-metre X-band Look-through Monitor (on TALON-2)',
    '5-metre X-band Jam Antenna (cold)',
    'X-band RF Front End (7000 MHz BUC LO / 8925 MHz LNB LO)',
    'TT&C Console with Ranging Tone and Telemetry Display',
    'Pass Schedule with Ephemeris Inbox',
  ],
  settings: {
    isSync: true,
    groundStations: [sandstormRanging],
    satellites: [talon2Satellite, cobalt4Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-11-10',
    scenarioStartWallTime: '02:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-4/scenario-5?content-only=true&dark=true',

    workingDocument: {
      title: 'TALON-2 Contact Log 2027-314-01',
      description: 'The 0205Z ranging contact: the arc, the burn, the set, the solution.',
    },

    telemetry: {
      groundStationId: 'SS-01',
      satelliteNoradId: 90071,
      antennaIndex: 1,
      frameRateHz: 1,
      staleAfterS: 10,
      channels: TALON2_CHANNELS,
    },

    commanding: {
      groundStationId: 'SS-01',
      targetNoradId: 90071,
      windowStartS: 300,
      windowEndS: 2400,
      requireDopplerComp: false,
      requireValidKey: true,
      ranging: { requiredMeasurements: 6, toneId: 'RANGE' },
      commands: [{ id: 'HK-DUMP', label: 'Housekeeping telemetry dump' }],
    },

    // M4 on a GEO bird: the burn moves TALON-2 onto the authored set at T+840;
    // the station keeps predicting from the pre-burn set until the update is loaded.
    spaceEvents: [
      {
        id: 'TALON2-SK',
        satelliteNoradId: 90071,
        maneuverAtS: 840,
        label: 'TALON-2 east-west station-keeping burn executed 02:14Z; post-burn element set issued by LANTERN',
        newTle: { tle1: TALON2_TLE.tle1 as string, tle2: TALON2_TLE.tle2 as string },
        initialTle: { tle1: TALON2_TLE.tle1 as string, tle2: TALON2_PRE_BURN_TLE2 },
      },
    ],
  },
  objectives: [
    {
      id: 'read-the-shift-package',
      nice: ['K0645', 'K1032'],
      title: 'Read the Shift Package',
      description: "Open the shift package: the burn, the arc LANTERN wants, and what a single station's ranging can and cannot tell an orbit-determination team.",
      groundStation: 'SS-01',
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Shift Package Read',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Ranging Understood',
          params: {
            question: 'Why does LANTERN want three tones before the burn and three after, rather than one good one?',
            options: [
              'A single range is one number on one line of sight. A series over time, either side of a known event, is what constrains an orbit - and the step between the two halves is the burn, measured',
              'Redundancy: tones fail often and three gives one good one',
              'The tone has to be repeated until the ACK confirms the bird heard it',
              'Averaging: six ranges average out the noise on the tone and give a more precise single distance',
            ],
            correctIndex: 0,
            explanation:
              'Orbit determination is a fit to measurements over time. One range from one station is nearly useless; a series from a known slot, with the pointing angles the tracker already knows, is an arc. Two arcs across a burn is the burn itself, measured from the ground.',
            character: Character.SYSTEM,
            pointPenalty: 2,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-telemetry',
      nice: ['T0431', 'S0648'],
      title: 'Acquire Telemetry',
      description: 'Monitor on the bird from last night. Telemetry tab: ten frames on a LIVE link and a nominal state of health before anything goes up.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-the-shift-package'],
      conditions: [
        {
          type: 'telemetry-frames-received',
          description: 'Ten Frames Received',
          params: { minFrames: 10 },
          mustMaintain: false,
        },
        {
          type: 'telemetry-soh-nominal',
          description: 'State of Health Read Nominal',
          params: { requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'arm-the-uplink',
      nice: ['T1567', 'K0645'],
      title: 'Arm the Uplink',
      description: 'Modem 1 on the 1200 MHz TT&C IF. HPA up, modem 1 keyed. The window opens at T+5:00.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['acquire-telemetry'],
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'Modem 1 on 1200 MHz (8200 MHz RF)',
          params: { modemNumber: 1, frequency: 1200e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Modem 1 Keyed',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'pre-burn-arc',
      nice: ['K1032', 'S0421'],
      title: 'Pre-Burn Arc',
      description: 'TT&C console: three ranging tones inside the window, before 02:14Z. Each ACK records the slant range; watch the number.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['arm-the-uplink'],
      conditions: [
        {
          type: 'ranging-measurements',
          description: 'Three Ranges Recorded',
          params: { minCount: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'watch-the-burn',
      nice: ['S0648', 'K1032'],
      title: 'Watch the Burn',
      description:
        'After 02:14Z take one more tone. The range steps by about a kilometre and a half with the bird still in the beam and the telemetry still LIVE. Say what that is.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['pre-burn-arc'],
      conditions: [
        {
          type: 'ranging-measurements',
          description: 'Post-Burn Range Recorded',
          params: { minCount: 4 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Step Read',
          params: {
            question: 'The fourth range is about 1.5 km longer than the third, the monitor is still on the bird, telemetry is LIVE and nominal. What happened?',
            options: [
              'The burn: the bird moved along its orbit, the slant range from here changed with it, and the set the station is predicting from is now stale - the pass schedule will say so',
              'A tracking error: the monitor drifted off the bird and the tone took a longer path',
              'A tone fault: the ranging tone returned late and the range is wrong; discard it',
              "Nothing: 1.5 km on 37,000 is inside the tone's own noise",
            ],
            correctIndex: 0,
            explanation:
              'Range that steps while pointing and telemetry hold steady is the spacecraft moving, not the station. At GEO distance a tenth of a degree of longitude is a kilometre and a half of slant range from here - and the element set you had is now a description of where the bird used to be.',
            character: Character.SYSTEM,
            pointPenalty: 2,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'load-the-ephemeris',
      nice: ['T1138', 'K1032'],
      title: 'Load the Post-Burn Set',
      description:
        "Pass Schedule tab: the TALON-2 entry reads EPHEMERIS STALE and LANTERN's post-burn set is in the inbox. Load it. The prediction and the measurement agree again.",
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['watch-the-burn'],
      conditions: [
        {
          type: 'ephemeris-updated',
          description: 'Post-Burn Ephemeris Loaded',
          params: { eventId: 'TALON2-SK' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'post-burn-arc',
      nice: ['K1032', 'S0421'],
      title: 'Post-Burn Arc',
      description: 'Two more tones on the new set. Six ranges either side of a known burn is the arc LANTERN asked for.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['load-the-ephemeris'],
      conditions: [
        {
          type: 'ranging-measurements',
          description: 'Six Ranges Recorded (solution ready)',
          params: { minCount: 6 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'od-handoff',
      nice: ['K1032', 'T0153'],
      title: 'Hand Off the Solution',
      description: 'What goes to LANTERN: the six ranges with their times, the burn between the third and fourth, and the set they were taken against.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['post-burn-arc'],
      conditions: [
        {
          type: 'status-check',
          description: 'Solution Handed Off',
          params: {
            question: 'What does the ranging hand-off to LANTERN contain?',
            options: [
              'Six timed ranges from SANDSTORM, three pre-burn on the old set and three post-burn on the new one, the ~1.5 km step at 02:14Z, and the pointing angles the tracker held throughout',
              'The average of the six ranges and the time of the contact',
              'The post-burn element set, which already contains the orbit',
              'A single best range from after the burn, since the pre-burn ones describe an orbit that no longer exists',
            ],
            correctIndex: 0,
            explanation:
              'The engineers fit an orbit to measurements; give them all of the measurements, when they were taken, what they were taken against, and the event between them. The pre-burn arc is not obsolete - it is the "before" that makes the burn measurable.',
            character: Character.SYSTEM,
            pointPenalty: 2,
            documentSection: 'Ranging',
            documentLine:
              'Ranging arc for LANTERN: 3 tones pre-burn (pre-burn set), station-keeping burn 02:14Z observed as a ~1.5 km step in slant range with pointing and telemetry steady, post-burn set loaded from the inbox, 3 tones post-burn. Six timed ranges and the held pointing angles handed off.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Uplink',
      description: 'Arc complete. Un-key modem 1 and disable the HPA before the log entry.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['od-handoff'],
      conditions: [
        {
          type: 'tx-modem-not-transmitting',
          description: 'Modem 1 Un-keyed',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: { equipmentIndex: 0 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'log-and-hand-back',
      nice: ['T0153', 'K0645'],
      title: 'Log the Contact and Hand Back',
      description:
        'The contact log line: telemetry state, the arc, the burn, the set, the hand-off, the chain state. The last backup contact before the primary terminal comes back.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      conditions: [
        {
          type: 'status-check',
          description: 'Contact Logged',
          params: {
            question: 'Which line goes in the TALON-2 contact log?',
            options: [
              '0205Z contact SANDSTORM (backup). Telemetry LIVE, SOH NOMINAL. Ranging arc: 3 tones pre-burn; burn 02:14Z seen as ~1.5 km range step; post-burn set loaded; 3 tones post-burn; arc handed to LANTERN. Chain safed. Primary terminal returns 0600Z',
              'Ranging pass complete; orbit updated',
              'TALON-2 manoeuvred during the contact; the station lost track briefly and recovered after loading a new element set',
              '0205Z: six ranges taken and sent to the engineers',
            ],
            correctIndex: 0,
            explanation:
              'The station never lost track; the set went stale, which is a different sentence. What was measured, when, against what, what was seen, what was loaded, what was handed off, how the chain was left. Three contacts, three logs, one bird handed back healthy.',
            character: Character.SYSTEM,
            pointPenalty: 2,
            documentSection: 'Contact',
            documentLine:
              '0205Z TALON-2 backup contact, SANDSTORM. Telemetry LIVE, SOH NOMINAL. Ranging arc: tones 1-3 pre-burn; station-keeping burn 02:14Z observed as ~1.5 km slant-range step with pointing steady; post-burn set loaded; tones 4-6 post-burn; six timed ranges handed to LANTERN. Chain safed. Primary MILSATCOM terminal returns to service 0600Z; SANDSTORM backup role ends.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
