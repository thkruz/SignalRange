import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 18 - "Dirty Spectrum" / Persistent Interference (Gray Zone arc 2/8)
 *
 * Two days after the night of S17 the carrier is back, and it has learned the
 * plan. On the SAR-2 pass it sits inside SAR-2's video band; on the SAR-1
 * pass forty minutes later it has moved to SAR-1's. It cycles - sixty seconds
 * on, thirty off - which is a timer, not weather. Fiona flies the same birds
 * from Shetland and never hears it. The operator characterises the cadence,
 * calls it, notches it out and keeps the pass, records what the second
 * appearance implies (whoever exported the configuration in S17 knows every
 * IF on the station), builds the regulator package, and closes with the line
 * that changes the pre-pass sweep.
 *
 * Phase 18: `call-the-cycle` is graded on the interference *envelope* fact -
 * an event in progress counts in its off phase too, so the call does not flip
 * every thirty seconds. The intrusion option writes an escalation into the
 * audit log; S22 reads it.
 *
 * Clock starts 2027-04-14 10:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 10:00:00Z):
 *
 *   MERIDIAN-SAR-2: AOS T+18.02 (10:18:00Z, az 023), max el 31.8 deg at T+22.82
 *                   (10:22:49Z, 681 km), LOS T+27.56 (10:27:34Z, az 176), 9.5 min,
 *                   southbound. C/N >= 8 dB roughly 10:20:30 .. 10:25:00.
 *   MERIDIAN-SAR-1: AOS T+40.02 (10:40:00Z, az 136), max el 24.0 deg at T+44.75
 *                   (10:44:45Z, 876 km), LOS T+49.48 (10:49:29Z, az 357), 9.5 min,
 *                   northbound. C/N >= 8 dB roughly 10:42:30 .. 10:47:00.
 *
 * The carrier (terrestrial, the S17 emitter, Galway only):
 *   'gw-carrier-sar2' 11726 MHz -> IF 1374 (4 MHz above the SAR-2 video at
 *     1370, inside its band), 1 MHz, from T+1410 s (10:23:30Z) for 480 s to
 *     10:31:30Z - past LOS - cycling 60 s on / 30 s off.
 *   'gw-carrier-sar1' 11690 MHz -> IF 1410 (the S17 frequency, inside the
 *     SAR-1 video band), 1 MHz, from T+2490 s (10:41:30Z) for 420 s to
 *     10:48:30Z, same cadence.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on the 1414 MHz
 * SAR-1 carrier from the morning; svc-legacy reads disabled since S17. Receive
 * only.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0684: Knowledge of cyber defense and information security policies, procedures, and regulations
 *   - K0926: Knowledge of signal jamming tools and techniques
 *   - S0648: Skill in detecting anomalies
 *
 * Supporting Codes:
 *   - K0682: Knowledge of cyber attack stages and their indicators
 *   - K0946: Knowledge of incident reporting requirements
 *   - S0593: Skill in handling incidents
 *   - K0737: Knowledge of signal filtering techniques
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0421: Skill in operating network equipment
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 */

/** MERIDIAN-SAR-2 (61702) at the S18 epoch: the 32 deg pass, southbound from az 023. */
const SAR2_S18_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27104.41666667  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61702  98.4000 166.0000 0010000  90.0000 308.0000 15.62520000123459' as TleLine2,
};

/** MERIDIAN-SAR-1 (61701) at the S18 epoch: the 24 deg pass, northbound from az 136. */
const SAR1_S18_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27104.41666667  .00001000  00000-0  10000-3 0  9991' as TleLine1,
  tle2: '2 61701  97.2000  16.0000 0010000  90.0000 152.2500 15.55840000123450' as TleLine2,
};

const meridianSar1S18 = createMeridianSar1(SAR1_S18_TLE);
const meridianSar2S18 = createMeridianSar2(SAR2_S18_TLE);

/** GW-01 as the morning left it: modem 1 on the SAR-1 carrier. Deep clone, never spread. */
const galwayDay: GroundStationConfig = structuredClone(galwayGroundStation);
galwayDay.receivers![0].modems![0] = {
  ...galwayDay.receivers![0].modems![0],
  frequency: 1414 as MHz,
};

export const natsEuScenario18Data: ScenarioData = {
  id: 'nats-eu-scenario18',
  url: 'nats-eu/scenarios/nats-eu-scenario18',
  imageUrl: 'nats/18/card.png',
  number: 18,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario17'],
  title: 'Dirty Spectrum',
  subtitle: 'Persistent Interference (Gray Zone 2/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `10:00, Galway, two days on. The incident record from Monday night is open, the interference report is with the regulator, and nothing has been attributed. SAR-2 at 10:18 and SAR-1 at 10:40, both receive-only. Fiona flies both from Shetland in parallel.<br><br>If the carrier comes back, it will not be a coincidence twice. Characterise it, keep the pass, and build the package the regulator can act on. And notice what it does when the plan changes.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO) with IF Notch Filter',
    'Security Console (audit log + access control)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayDay, shetlandGroundStation],
    satellites: [meridianSar1S18, meridianSar2S18],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-14',
    scenarioStartWallTime: '10:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-18?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'Interference Report IR-2027-0414-GW01',
      description: 'For ComReg and Rotterdam. Victim, interferer, captures, cross-station confirmation, impact, mitigation - every line timestamped. Evidence, not conclusion.',
    },

    // The S17 emitter, back on two passes. Terrestrial: received directly,
    // no Doppler, cycling 60 s on / 30 s off, never heard at Shetland. On
    // the SAR-2 pass it sits in SAR-2's band; on the SAR-1 pass it moves to
    // SAR-1's - the configuration export of S17, in use.
    interferenceEvents: [
      {
        id: 'gw-carrier-sar2',
        frequency: 11726e6,
        bandwidth: 1e6,
        power: 60,
        polarization: 'V',
        startTime: 1410,
        duration: 480,
        periodSeconds: 90,
        onSeconds: 60,
        path: 'terrestrial',
        emitter: { latitude: 53.12, longitude: -9.32 },
      },
      {
        id: 'gw-carrier-sar1',
        frequency: 11690e6,
        bandwidth: 1e6,
        power: 60,
        polarization: 'V',
        startTime: 2490,
        duration: 420,
        periodSeconds: 90,
        onSeconds: 60,
        path: 'terrestrial',
        emitter: { latitude: 53.12, longitude: -9.32 },
      },
    ],

    // M6 - the log as it stands two days on. svc-legacy is disabled (S17);
    // the escalation option in call-the-cycle writes into this log.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'svc-legacy', name: 'Telemetry bridge (legacy, decommissioned 14 Jan)', role: 'Service Account', status: 'disabled' },
      ],
      events: [
        {
          id: 'evt-legacy-disabled',
          timeS: 0,
          timestampLabel: '12 Apr 02:36 UTC',
          actor: 'op-duty',
          action: 'Account svc-legacy set to disabled (INC-2027-0412-GW01)',
          category: 'access',
          severity: 'info',
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '09:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-1000', timeS: 0, timestampLabel: '10:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0682'],
      title: 'Read the Day Brief',
      description: 'Open the shift brief: the state of the incident, the two passes, and what to do if the carrier comes back.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Day Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Posture Understood',
          params: {
            character: Character.SYSTEM,
            question: 'Monday night the carrier was reported as interference with no cause claimed. If it appears again today, what changes about how you treat it?',
            options: [
              'The record: a second appearance is evidence of persistence, so every capture is timestamped for the regulator - the call itself is still made on what the station shows',
              'The call: a second appearance proves intent, so it is treated as an attack from the first second and commanding is held',
              'Nothing: each event is its own incident, characterised from scratch, and Monday night is not admissible in today’s report',
              'The mitigation: a repeat interferer is retuned around rather than notched, so the modem moves off the frequency it knows',
            ],
            correctIndex: 0,
            explanation:
              'Persistence is a fact for the report, not a verdict for the console. The call is still made on the evidence in front of you; what a second night changes is how carefully that evidence is kept. Eighteen minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Board read. Confirm the active alarm state on GW-01 before the first pass.',
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
            question: 'What is the active alarm state on GW-01 at 10:00?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the day',
              'Notch filter alarm - the IF notch is unpowered and the RX chain is flagged',
              'Interference alarm - the analyzer has flagged Monday night’s carrier as present',
            ],
            correctIndex: 0,
            explanation:
              'Empty sky, not a fault. The analyzer does not raise alarms and the notch filter is powered and idle; the only thing on the board is the AGC rail, and it clears at AOS.',
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
      description: 'GPSDO locked and out of holdover. Every capture in today’s report carries a frequency, and the frequency is only worth what the reference is worth.',
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
      id: 'rx-chain-ready-sar2',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-2',
      description:
        'Modem 1 is on the 1414 MHz SAR-1 carrier from the morning. Retune it to SAR-2’s 1370 MHz and frame the analyzer on 1370 with a 40 MHz span: video, the 1397 beacon, the Doppler, and room to see anything that is not yours.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
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
          description: 'Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 40 MHz',
          params: { span: 40e6, frequencyTolerance: 5e6 },
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
      description: 'AOS 10:18:00 from azimuth 023, southbound. Park the tracker on the rise azimuth at 5 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 023 / El 5',
          params: { azimuth: 23, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'Program-track SAR-2 before 10:18 and confirm the 1397 MHz beacon on RX analysis.',
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
          description: 'Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
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
      title: 'Decode SAR-2 Clean',
      description:
        'Lock the 1370 MHz carrier and hold C/N above 8 dB into the high-elevation segment, roughly 10:20:30 to 10:23. Log the clean number before anything else arrives; it is the "before" in the report.',
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
    {
      id: 'read-the-cycle',
      nice: ['S0648', 'K0926'],
      title: 'Read the Cycle',
      description:
        'From about 10:23:30 the carrier is back: 1374 MHz IF, 4 MHz above the video and inside its band. Frame it on a 2 MHz span and watch it for two minutes. It is not steady this time.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1374 MHz',
          params: { centerFrequency: 1374e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'Carrier Seen at 1374 MHz',
          params: {
            signalId: 'INTERFERER-gw-carrier-sar2',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Cadence Read',
          params: {
            character: Character.SYSTEM,
            question: 'Sixty seconds on, thirty off, repeating to the second, and still no Doppler. What does the cadence add to Monday night’s reading?',
            options: [
              'Intent: accidents are continuous or erratic, and a clean minute-scale on/off is a timer or a hand on a switch - an indicator, not proof',
              'Nothing new: duty cycle depends on the receiver AGC recovering, not on the source; the timing is yours, not theirs',
              'A radar: rotating antennas sweep past on a fixed period, and a minute-scale cadence is a slow scan rate',
              'A failing supply: a dying regulator on a neighbouring uplink cycles as it heats, which reads as a regular on/off',
            ],
            correctIndex: 0,
            explanation:
              'Radar periods are seconds; a thermal cycle drifts; an accident is continuous or random. A minute-scale cadence that repeats to the second is a switch. It argues intent and it goes in the report as a measured number - first seen, period, on-time - not as a conclusion.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'call-the-cycle',
      nice: ['S0648', 'K0926', 'K0682'],
      title: 'Call It',
      description:
        'Fiona has SAR-2 clean from Shetland. Your C/N drops 6 dB every time the carrier is on. Read the key status and the carrier, then decide what the station does about it - the pass is not over.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-cycle'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'carrier-seen',
          type: 'signal-detected',
          description: 'Carrier read on RX Analysis',
          params: {
            signalId: 'INTERFERER-gw-carrier-sar2',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          id: 'key-seen',
          type: 'rx-key-status',
          description: 'RX key status read on RX Analysis',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'What the station does about it',
          params: {
            character: Character.PRIYA_SHARMA,
            prompt: 'Same emitter, new frequency, and now it cycles. Fiona is clean. What do you do with the rest of this pass?',
            evidence: ['carrier-seen', 'key-seen'],
            decisionOptions: [
              {
                label: 'Deliberate interference - notch it, keep the pass, report it with the cadence measured',
                correctWhen: {
                  all: [
                    { fact: 'interference-active', is: true },
                    { fact: 'equipment-fault-active', is: false },
                    { fact: 'crypto-intact', is: true },
                  ],
                },
                consequence: { log: 'Interference event 2: 1374 MHz IF, 60 s on / 30 s off, notch applied, regulator package in progress' },
              },
              {
                label: 'Intrusion on the link - hold the receiver and escalate to CSIRT now',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: {
                  auditEvent: {
                    id: 'evt-op-escalation-sar2',
                    actor: 'op-duty',
                    action: 'Escalated to CSIRT: suspected intrusion on SAR-2 link (no crypto indication)',
                    category: 'access',
                    severity: 'warning',
                  },
                  log: 'CSIRT escalation raised on the SAR-2 downlink',
                },
                feedback: 'The key reads Valid and every frame decodes in the off phase. This is denial at the RF layer, and holding the receiver hands them the pass for free.',
              },
              {
                label: 'Receive-chain fault - an LNB spur that cycles with temperature; raise a ticket',
                correctWhen: { fact: 'equipment-fault-active', is: true },
                consequence: { log: 'Maintenance ticket raised against GW-01 LNB (no fault found)' },
                feedback: 'A spur does not choose a new frequency to sit inside a different bird’s band, and it does not keep a thirty-second beat.',
              },
              {
                label: 'Propagation - a ducting layer bringing in a distant terrestrial link; wait it out',
                correctWhen: { fact: 'weather-attenuation-dominant', is: true },
                feedback: 'Ducting does not switch on and off to the second, and it does not follow your frequency plan from one pass to the next.',
              },
            ],
            explanation:
              'Same emitter, in band on a second bird, on a timer: deliberate interference, not intrusion and not a fault. The station’s job is to keep the pass with the notch, measure everything, and hand the finding to the regulator. Who and where is theirs to find.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'notch-the-carrier',
      nice: ['S0593', 'K0737'],
      title: 'Notch the Carrier',
      description: 'Receive-side mitigation: a notch on the carrier at 1374 MHz IF, 2 MHz wide, 30 dB deep, notch 0. The video loses a sliver of its band and keeps its lock.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-cycle'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'notch-filter-configured',
          description: 'Notch at 1374 MHz IF on the Carrier',
          params: {
            notchCenterFrequency: 1374,
            notchCenterFrequencyTolerance: 1,
            notchBandwidth: 2,
            notchBandwidthTolerance: 1,
            notchDepth: 30,
            notchDepthTolerance: 10,
            notchIndex: 0,
          },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Why the Notch',
          params: {
            character: Character.SYSTEM,
            question: 'Why notch the carrier rather than move the modem off it?',
            options: [
              'The video is where it is: 1370 is the bird’s frequency, not yours to move; the notch removes their energy and keeps your carrier',
              'A notch is faster to set than a retune: the modem takes a minute to relock and the pass has less than that left',
              'Moving the modem would be an admission the link is denied; a notch keeps the incident at the RF layer on paper',
              'The notch is the only control the console offers during a pass; the modem frequency locks while program-track is engaged',
            ],
            correctIndex: 0,
            explanation:
              'You receive on the frequency the satellite transmits on. There is nowhere to retune to. The notch is the surgical tool: it takes a megahertz of their signal out of your 36, costs you a fraction of a dB, and is reversible the moment they stop.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'log-the-first-event',
      nice: ['K0946', 'T1580'],
      title: 'Log Event 1',
      description:
        'LOS 10:27:34; the carrier is still cycling on an empty sky. Put the first event in the report as evidence: frequency, cadence, first seen, effect, mitigation, and Shetland’s confirmation.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['notch-the-carrier'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Event 1 Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'The event outlived the pass again. Which line goes in the report?',
            options: [
              '10:23:30 carrier 11726 MHz RF / 1374 IF, ~1 MHz, 60 s on 30 s off, no Doppler, present after LOS; C/N -6 dB when on; notched 10:26; SH-02 clean',
              'Interference confirmed on SAR-2, same as Monday; the emitter is the one reported on 12 April and is still operating',
              'Carrier at 1374 MHz seen during the SAR-2 pass; the notch handled it and the decode completed; no further action at this station',
              'Deliberate jamming of SAR-2 from a ground site south-west of Galway, 10:23 to 10:31; recommend the regulator locate the source',
            ],
            correctIndex: 0,
            explanation:
              'The line the regulator can act on has numbers, times and a second station in it. "Same as Monday" and "deliberate" are conclusions; the report carries the measurements those conclusions will be drawn from.',
            pointPenalty: 5,
            documentSection: 'Events',
            documentLine:
              'Event 1: 10:23:30Z carrier 11726 MHz RF (1374 MHz IF), ~1 MHz, cycle 60 s on / 30 s off, no Doppler, persists after SAR-2 LOS 10:27:34Z to ~10:31:30Z. Victim MERIDIAN-SAR-2 video 11730 MHz, C/N 11 dB -> 5 dB while on. Notch 1374/2 MHz/30 dB applied 10:26Z, lock held. SH-02 (F. MacLeod) clean on the same pass.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'rx-chain-ready-sar1',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-1',
      description: 'SAR-1 rises at 10:40:00 from azimuth 136. Retune modem 1 to 1414 MHz and the analyzer to 1414 with the 40 MHz span. Leave notch 0 where it is.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-first-event'],
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
          description: 'Analyzer Centre 1414 MHz',
          params: { centerFrequency: 1414e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Retarget program-track to SAR-1 and confirm the 1389 MHz beacon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready-sar1'],
      conditions: [
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
      points: 10,
    },
    {
      id: 'decode-sar1-under-it',
      nice: ['S0593', 'K0737', 'T0153'],
      title: 'Decode SAR-1 Under It',
      description:
        'From 10:41:30 the carrier is back at 1410 MHz - inside SAR-1’s band this time, the S17 frequency, same cadence. Notch 1 on 1410, 2 MHz, 30 dB, and hold C/N above 7 dB through the high-elevation segment.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'notch-filter-configured',
          description: 'Notch at 1410 MHz IF on the Carrier',
          params: {
            notchCenterFrequency: 1410,
            notchCenterFrequencyTolerance: 1,
            notchBandwidth: 2,
            notchBandwidthTolerance: 1,
            notchDepth: 30,
            notchDepthTolerance: 10,
            notchIndex: 1,
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above 7 dB',
          params: { modemNumber: 1, minCNRatio: 7, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'it-followed-the-plan',
      nice: ['K0682', 'K0683', 'S0648'],
      title: 'It Followed the Plan',
      description: 'Two passes, two birds, two frequencies - each one inside the band of the satellite you were receiving at the time. Record what that implies.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar1-under-it'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Implication Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'The carrier sat in SAR-2’s band during SAR-2 and in SAR-1’s band during SAR-1. What does that tell you, and what does it not?',
            options: [
              'Whoever runs it knows the frequency plan and the schedule - the 12 April export in use; it does not tell you who, or from where',
              'Whoever runs it is tracking the satellites with their own receiver and following the video; the export is unrelated',
              'The station is being probed from inside: only someone on the console could time the change to the retune',
              'Coincidence: two Ku carriers near two downlinks is within the noise of a busy band, and the report should say so',
            ],
            correctIndex: 0,
            explanation:
              'You changed frequency between passes because the plan said to; the carrier changed with you, to a frequency inside the new band, at the right time. That is the configuration export from Monday night, in use. It is an indicator of capability and of intent. It is not attribution, and the report does not say who.',
            pointPenalty: 5,
            documentSection: 'Events',
            documentLine:
              'Event 2: 10:41:30Z carrier 11690 MHz RF (1410 MHz IF), ~1 MHz, same cadence, inside the MERIDIAN-SAR-1 video band during the SAR-1 pass; notch 1 applied, C/N held > 7 dB. Assessment: the interferer is following the station frequency plan across passes (cf. INC-2027-0412-GW01, configuration export 12 Apr 02:33). No attribution.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'file-the-regulator-report',
      nice: ['K0684', 'K0946', 'T1580'],
      title: 'File the Regulator Package',
      description: 'LOS 10:49:29. Assemble the package for ComReg, copied to Rotterdam: the fields the regulator needs to act, and nothing the regulator has to take on trust.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['it-followed-the-plan'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Package Assembled',
          params: {
            character: Character.SYSTEM,
            question: 'Which set of fields makes the regulator package actionable?',
            options: [
              'Victim and interferer parameters (frequency, bandwidth, cadence, first and last seen), captures at stated settings, the second-station confirmation, impact and mitigation - all timestamped',
              'The interferer’s identity and site, worked out here from the bearing and the frequency, with a request that the regulator confirm it',
              'A summary: SAR-1 and SAR-2 interfered with on 14 April, notched, decodes completed; details available from the station on request',
              'The incident record from 12 April in full, with today’s events appended, so the regulator sees the whole picture from the spray onward',
            ],
            correctIndex: 0,
            explanation:
              'The package is evidence, not conclusion: what was received, at what settings, when, at which sites, with what effect. Attribution belongs to the regulator and to whoever has direction-finding equipment. The security incident is a separate record with a separate reader.',
            pointPenalty: 5,
            documentSection: 'Regulator',
            documentLine:
              'IR-2027-0414-GW01 to ComReg, cc Rotterdam: victim MERIDIAN-SAR-2 (11730 MHz V) and MERIDIAN-SAR-1 (11686 MHz V), GW-01 Galway 53.27N 9.05W. Interferer: 11726 MHz then 11690 MHz, ~1 MHz, 60 s on / 30 s off, no Doppler, terrestrial. First seen 12 Apr 02:25:30Z; today 10:23:30-10:31:30Z and 10:41:30-10:48:30Z. Captures at 2 MHz span attached. SH-02 Shetland clean on both passes. Impact: C/N -6 dB when on; mitigated by IF notch, decodes completed. Geolocation referred.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'close-and-debrief',
      nice: ['T1580', 'K0645', 'S0593'],
      title: 'Close the Report and Debrief',
      description: 'Two events, two notches, two decodes. Close the report and write the line that changes tomorrow’s sweep.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['file-the-regulator-report'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Debrief Line',
          params: {
            character: Character.SYSTEM,
            question: 'What is the debrief line?',
            options: [
              'The export is live: they know every IF on the station. Pre-stage a notch for every planned downlink before AOS, and treat the plan as known to them until Rotterdam changes it',
              'Both decodes completed and the notches worked; the procedure held and no change is needed beyond keeping the report current',
              'The analyzer should be left on a 2 MHz span at all times; the 40 MHz framing delayed the read of the carrier by a minute',
              'The second pass should have been flown from Shetland; the interferer cannot reach SH-02, so Galway should stand down on SAR passes',
            ],
            correctIndex: 0,
            explanation:
              'Notch 0 was set for 1374 and the carrier arrived at 1410. You knew the plan; so did they. Tomorrow the notches are staged before the pass, and the plan is assumed compromised until it is reissued. That is the line that changes something; Shetland is not a fix for Galway.',
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed 10:56Z. Debrief: interferer follows the station frequency plan; pre-stage IF notches for every planned downlink in the pre-pass sweep; request Rotterdam reissue the IF plan (INC-2027-0412-GW01 export assumed live). Open: regulator package filed, attribution referred.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Anneke Visser at 09:41]</em>
      </p>
      <p>
        "Your Monday report is with ComReg and with me. They can act on measurements, not on a story: if that carrier comes back today I want frequency, bandwidth, cadence, first seen, and a second station saying it did not hear it. Fiona is flying both passes from Shetland in parallel. Keep your decodes; the report is what you do between them."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'read-the-cycle': {
        text: `
        <p>
          Clean up here, eleven dB, nothing in the band. Sixty on, thirty off, is it? That is a timer. Write the seconds down; someone will ask.
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'call-the-cycle': {
        text: `
        <p>
          Good call, and the right order. Keep the pass; a receiver you switch off is a pass they took from you for free. Measure everything. I will read the record after your second bird.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'it-followed-the-plan': {
        text: `
        <p>
          They read your plan. Assume they have all of it - every IF, every window - until Rotterdam gives you a new one. That is not a conclusion for the regulator; it is a fact for us.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'file-the-regulator-report': {
        text: `
        <p>
          Package received. Two sites, two frequencies, a cadence to the second - that is a report they can take to a van with an antenna on it. I will reissue the IF plan tonight.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'close-and-debrief': {
        text: `
        <p>
          Two passes kept, two events measured, nothing attributed that should not be. Stage your notches tomorrow. They will try something else.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
