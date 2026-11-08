import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 20 - "False Time" / GNSS Spoof on the Station Reference (Gray Zone arc 4/8)
 *
 * Downlink (S17-S18), uplink (S19), and now the one input every other clock
 * on the station trusts without asking. Pre-dawn Monday, two receive passes,
 * nothing of ours on the air. At 05:08 a GNSS spoofer comes up in Galway's
 * footprint: the GPSDO keeps LOCKED with a full satellite count, and the GNSS vs
 * REF delta-T on the GPS Timing tab starts walking at two microseconds a
 * second. Rotterdam sees it first as telemetry timestamps drifting ahead of
 * theirs. Shetland reads +0.0: same sky, no walk - the lie is local. The
 * operator calls it (a spoof, not an outage and not a fault), takes the GNSS
 * switch down so the reference free-runs on the OCXO, flies SAR-1 on the
 * oscillator, reports it, probes the sky once after LOS (still walking - back
 * to holdover), and comes back to GNSS only when the offset stays still with
 * GNSS re-selected. SAR-2 decodes on true time.
 *
 * Phase 18: `call-the-lie` is graded on the timing-drifting +
 * gnss-constellation-healthy fact pair - the spoof signature is that both are
 * true at once. `probe-the-sky` is a second decision whose correct answer
 * depends on the mission clock (the spoofer is up until 150 s after `all-clear` opens, about 05:36). Two new
 * conditions debut: gpsdo-time-offset-exceeds (the read of the walk) and
 * gpsdo-time-offset-stable (the all-clear proof, gated on reference mode gnss
 * so holdover cannot fake it). M8 GnssThreatManager gains station scoping so
 * SH-02 is the cross-check.
 *
 * Clock starts 2027-04-19 05:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 05:00:00Z):
 *
 *   MERIDIAN-SAR-1: AOS T+21.98 (05:21:59Z, az 006), max el 29.2 deg at T+26.75
 *                   (05:26:45Z, 735 km), LOS T+31.47 (05:31:28Z, az 219), 9.5 min,
 *                   southbound. Flown on holdover. C/N >= 8 dB roughly 05:24:30 .. 05:29.
 *   MERIDIAN-SAR-2: AOS T+44.01 (05:44:00Z, az 006), max el 27.0 deg at T+48.74
 *                   (05:48:44Z, 788 km), LOS T+53.48 (05:53:29Z, az 222), 9.5 min,
 *                   southbound. Flown back on GNSS.
 *
 * The spoofer: settings.gnssThreat, GW-01 only, from T+480 s (05:08:00Z) to
 * T+2160 s (05:36:00Z; really 150 s after `all-clear` opens), 2 us/s. Not an RF event on the Ku analyzer - L1 is
 * not in the LNB's band, and the 2 ppm it pulls every disciplined LO while
 * GNSS is trusted (Phase 19.6: ~26 kHz on the LNB LO) is lost in the +/-250 kHz
 * Doppler - so the tell is on the GPS Timing tab and in
 * Rotterdam's timestamps, and the cross-check is the other station.
 *
 * Staged state (scenario-local clone of GW-01): RX modem 1 on 1370 MHz
 * (SAR-2 video IF, from Friday); to be retuned to 1414 for SAR-1. BUC muted,
 * no uplink this shift.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0752: Knowledge of system vulnerabilities (GNSS as a single point of trust)
 *   - S0648: Skill in detecting anomalies
 *   - K0740: Knowledge of timing and synchronization
 *
 * Supporting Codes:
 *   - K0926: Knowledge of signal jamming tools and techniques (spoofing)
 *   - S0593: Skill in handling incidents
 *   - K0751: Knowledge of system threats
 *   - T0431: Monitor timing reference systems
 *   - S0421: Skill in operating communications equipment
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T0153: Monitor network capacity and performance
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 *   - K0741: Knowledge of alarm states and their meaning
 */

/** MERIDIAN-SAR-1 (61701) at the S20 epoch: the 29 deg pass, southbound from az 006. */
const SAR1_S20_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27109.20833333  .00001000  00000-0  10000-3 0  9999' as TleLine1,
  tle2: '2 61701  97.6000  80.0000 0010000  90.0000 290.0000 15.60630000123454' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S20 epoch: the 27 deg pass, southbound from az 006. */
const SAR2_S20_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27109.20833333  .00001000  00000-0  10000-3 0  9990' as TleLine1,
  tle2: '2 61702  98.0000  84.0000 0010000  90.0000 204.0000 15.59010000123459' as TleLine2,
};

const meridianSar1S20 = createMeridianSar1(SAR1_S20_TLE);
const meridianSar2S20 = createMeridianSar2(SAR2_S20_TLE);

/** GW-01 as Friday left it: RX on SAR-2's video IF, BUC muted. Deep clone, never spread. */
const galwayFalseTime: GroundStationConfig = structuredClone(galwayGroundStation);
galwayFalseTime.receivers![0].modems![0] = {
  ...galwayFalseTime.receivers![0].modems![0],
  frequency: 1370 as MHz,
};
// The analyzer is still framed on that SAR-2 job (1370 MHz, 60 MHz span):
// the SAR-1 framing is the player's to do (phase 27 B1)
galwayFalseTime.spectrumAnalyzers![0] = { ...galwayFalseTime.spectrumAnalyzers![0], centerFrequency: 1370e6 as Hertz };
galwayFalseTime.rfFrontEnds[0].buc = { ...galwayFalseTime.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario20Data: ScenarioData = {
  id: 'nats-eu-scenario20',
  url: 'nats-eu/scenarios/nats-eu-scenario20',
  imageUrl: 'nats-eu/20/card.png',
  number: 20,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario19'],
  title: 'False Time',
  subtitle: 'GNSS Spoof on the Reference (Gray Zone 4/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `It's 05:00 on Monday at Galway, with two receive passes before the day shift: SAR-1 at 05:22 and SAR-2 at 05:44. Nothing of yours goes on the air. Whoever has been working through this station has already tried the downlink and then the uplink, and now there's one input left, the one every clock on the site trusts without asking.<br><br>The GPSDO, the GPS-disciplined reference, will say LOCKED, with satellites tracked and zero error. Know what that panel can't tell you before it stops being true.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO) with GPS-disciplined 10 MHz reference',
    'GPS Timing panel (GNSS vs REF delta-T)',
    'SH-02 Shetland: second GPSDO, same sky (cross-check)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
    'Security Console (audit log)',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayFalseTime, shetlandGroundStation],
    satellites: [meridianSar1S20, meridianSar2S20],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-19',
    scenarioStartWallTime: '05:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-20?content-only=true&dark=true',

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
      title: 'Timing Incident Record TI-2027-0419-GW01',
      description:
        'The reference on 19 April: what the GPS Timing panel read, what Shetland read, when GNSS was taken down, what the offset froze at, and when it was trusted again.',
    },

    // M8 - the spoofer. GW-01 only: SH-02 sees the same constellation and no
    // walk, which is the operator's cross-check. Up from 05:08 to 150 s after `all-clear` opens (spoofEndS 2160 is the fallback).
    // Phase 19.0a: it goes off 150 s after 'all-clear' opens, not at a fixed
    // 2160 s. The all-clear needs the offset steady for 30 s after the spoof
    // ends, so a player who reached it before about 1690 s timed out.
    gnssThreat: {
      groundStationIds: ['GW-01'],
      spoofStartS: 480,
      spoofEndS: 2160,
      endAfterObjectiveId: 'all-clear',
      endOffsetS: 150,
      offsetDriftUsPerS: 2,
    },

    // M6 - the log. Rotterdam's monitoring service notices the timestamp skew
    // two minutes into the spoof; the operator flags it in report-the-attack.
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
          id: 'evt-hopset-retired',
          timeS: 0,
          timestampLabel: '16 Apr 22:05 UTC',
          actor: 'op-charlie',
          action: 'TRANSEC hop set HOP-SAR2-04 retired (observed on air 16 Apr); HOP-SAR2-05 staged',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '04:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-0500', timeS: 0, timestampLabel: '05:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        {
          id: 'evt-ts-skew',
          // Pre-audit 9: appears when spot-the-walk completes, so the clip and the call never name a poll that does not exist yet
          startAfterObjectiveId: 'spot-the-walk',
          timeS: 5,
          timestampLabel: '{{at:obj:spot-the-walk+5s|05:10}} UTC',
          actor: 'svc-monitor',
          action: 'Telemetry poll: GW-01 frame timestamps ahead of Rotterdam reference and increasing',
          category: 'config',
          severity: 'warning',
        },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0752'],
      title: 'Read the Brief',
      description:
        'Open the shift brief. It covers the two receive passes, the reference that every clock on the station runs from, and what a GNSS spoof (a false satellite time signal) looks like on the panel that is meant to tell you the time is good.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Signature Understood',
          params: {
            character: Character.SYSTEM,
            question: 'According to the brief, what does a GNSS spoof look like on the GPS Timing tab?',
            options: [
              'A healthy constellation - LOCKED, a full satellite count - with the delta-T walking steadily one way',
              'Satellites dropping toward zero and the lock badge going UNLOCKED as the spoofer captures the receiver',
              'The holdover badge going ACTIVE on its own as the GPSDO detects the bad time and protects itself',
              'The oscillator oven temperature climbing out of its window as the disciplining loop fights the false signal',
            ],
            correctIndex: 0,
            explanation:
              "A spoofer doesn't take satellites away. It gives you satellites that agree with each other and lie together, so the receiver has no way to know. The only thing on the panel that moves is the offset between what GNSS says the time is and what the reference has been keeping, and the GPSDO steers toward the lie because that's its job. It's twenty-two minutes to AOS.",
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
      description: 'Read the dashboard on GW-01 and confirm the active alarm state at 05:00 before you do anything else.',
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
            question: 'What is the active alarm state on GW-01 at 05:00?',
            options: [
              'RX AGC on noise only - no carrier on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the pass',
              'GPSDO holdover alarm - the reference dropped GNSS overnight and is free-running',
              'LNB reference unlock - the downconverter lost its 10 MHz during the night',
            ],
            correctIndex: 0,
            explanation:
              "That's an empty sky, not a fault. The reference is locked and disciplined, the LNB is running from it, and the AGC no-carrier warning clears at AOS. The board will look exactly like this once the reference is being lied to, and that's the problem.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'timing-baseline',
      nice: ['T0431', 'K0740'],
      title: 'Timing Baseline',
      description:
        'On the GPS Timing tab, confirm the GPSDO is locked, GNSS is tracking and holdover is off. Then read the GNSS vs REF delta-T, the offset between GNSS time and the station reference, while it still reads true.',
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
          type: 'gpsdo-gnss-locked',
          description: 'GNSS Tracking (4+ satellites)',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-not-in-holdover',
          description: 'GPSDO Not in Holdover',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does GNSS vs REF delta-T read on GW-01 right now?',
            options: [
              '+0.0 us - the GNSS timing solution and the disciplined reference agree',
              '+40 us - the reference sits at the holdover spec limit until the next discipline cycle',
              '-- us - the readout is blank until the GPSDO enters holdover',
              '0 ns - it mirrors the UTC accuracy figure above it',
            ],
            correctIndex: 0,
            explanation:
              "It reads zero, and it should stay zero. UTC accuracy is how well the receiver thinks it knows the time, while delta-T shows whether the receiver and the oscillator agree about it. When the two disagree and the receiver still says it's sure, one of them is being lied to.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-1',
      description:
        "Retune RX modem 1 to 1414 MHz and set the analyzer to center 1414 MHz with a 60 MHz span. SAR-1's video downlink is 11686 MHz and the LNB's local oscillator is 13100 MHz, which puts the signal at 1414 MHz on the receiver.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['timing-baseline'],
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
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 60 MHz',
          params: { span: 60e6, frequencyTolerance: 5e6 },
          // 60 MHz is the station's default span: the centre row is the action (phase 27 B1)
          requiresChange: false,
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
      description:
        'SAR-1 rises at 05:21:59 from azimuth 006 and travels southbound. Point the antenna at azimuth 006, elevation 5 degrees, so it is waiting where the satellite appears.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 006 / El 5',
          params: { azimuth: 6, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'spot-the-walk',
      nice: ['S0648', 'T0431'],
      title: 'Spot the Walk',
      description:
        'From 05:08 the GNSS vs REF delta-T on GW-01 starts to move. Watch it on the GPS Timing tab until it passes 20 microseconds, and read the GNSS Constellation panel while you wait.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-aos'],
      conditions: [
        {
          type: 'gpsdo-time-offset-exceeds',
          description: 'Offset Past 20 us on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Constellation Read',
          params: {
            character: Character.SYSTEM,
            question: 'The offset is walking. What does the GNSS Constellation panel read while it does?',
            options: [
              'A full satellite count and LOCKED, healthy the whole time',
              'Satellites falling one by one as the spoofer captures them',
              'ACQUIRING - the receiver is cycling lock as the two signals fight',
              'Holdover ACTIVE - the GPSDO has already stopped trusting GNSS on its own',
            ],
            correctIndex: 0,
            explanation:
              "Nothing on the constellation panel changes. That's the signature: the receiver is tracking a full, consistent set of satellites, and every one of them is telling it the same wrong time. A GPSDO can't detect a lie when it has no second opinion.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'cross-check-sh02',
      nice: ['S0648', 'K0740'],
      title: 'Cross-Check Shetland',
      description: 'Select SH-02 and open its GPS Timing tab. Shetland sees the same constellation from about 900 km away. Read its GNSS vs REF delta-T.',
      groundStation: 'SH-02',
      prerequisiteObjectiveIds: ['spot-the-walk'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-gnss-locked',
          description: 'SH-02 GNSS Tracking Read',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Shetland Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does GNSS vs REF delta-T read on SH-02?',
            options: [
              '+0.0 us - same sky, no walk: whatever is wrong is local to Galway',
              'The same walk as GW-01 - the constellation itself has been compromised',
              'A larger offset - Shetland is further north and closer to the source',
              '-- us - SH-02 has no GPSDO of its own and takes its reference from Galway',
            ],
            correctIndex: 0,
            explanation:
              "Two receivers sit under the same satellites, and only one of them is being walked, so the satellites are fine. Something within radio range of Galway is louder than the satellites are and is broadcasting a different time. That's the whole diagnosis, and it took one tab.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-lie',
      nice: ['S0648', 'K0752', 'K0751'],
      title: 'Call the Lie',
      description:
        'Back on GW-01. Rotterdam is on the line because the timestamps on your frames are drifting. Read the offset and the constellation on the GPS Timing tab, then call what it is.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['cross-check-sh02'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'offset-seen',
          type: 'gpsdo-time-offset-exceeds',
          description: 'Offset read on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          id: 'constellation-seen',
          type: 'gpsdo-gnss-locked',
          description: 'Constellation read on GPS Timing',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'What the Reference Is Doing',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt:
              'Your frames from the latest poll are timestamped ahead of ours, and the gap is growing. Your GPSDO reports locked with nine satellites, and Fiona at Shetland reads zero. SAR-1 is about to rise, so what is this, and what do you want to do?',
            evidence: ['offset-seen', 'constellation-seen'],
            decisionOptions: [
              {
                label: 'GNSS spoof - the constellation is healthy and the time is walking. Take the GNSS switch down and fly SAR-1 on the oscillator',
                correctWhen: {
                  all: [
                    { fact: 'timing-drifting', is: true },
                    { fact: 'gnss-constellation-healthy', is: true },
                  ],
                },
                consequence: { log: 'GNSS spoof called on the GW-01 reference; GNSS to be taken down, SAR-1 to be flown in holdover' },
              },
              {
                label: 'GNSS outage - satellites are being lost. Leave GNSS selected and let the GPSDO drop into holdover by itself',
                correctWhen: { fact: 'gnss-constellation-healthy', is: false },
                consequence: { log: 'GNSS outage called with nine satellites tracked; reference left on GNSS' },
                feedback:
                  "The panel shows a full satellite count and LOCKED, so nothing is being lost. The GPSDO won't drop into holdover on its own, because as far as it can tell GNSS is fine. Every second GNSS stays selected, the reference gets steered further toward the lie.",
              },
              {
                label: 'GPSDO fault - the oscillator is drifting. Power-cycle the GPSDO and re-acquire before AOS',
                correctWhen: { fact: 'equipment-fault-active', is: true },
                consequence: { log: 'GPSDO power-cycle ordered for a reference that is following GNSS correctly' },
                feedback:
                  "The oscillator is doing exactly what it's told, which is following GNSS. A power cycle costs a warm-up and re-acquires the same lie, and Shetland already showed you the box isn't the problem.",
              },
              {
                label: 'Within spec - 40 us is the holdover limit and we are under it. Keep tracking and log it',
                correctWhen: { fact: 'timing-drifting', is: false },
                consequence: { log: 'Walking timing offset logged as within spec' },
                feedback:
                  "The 40 us figure is how far the oscillator may drift from a trusted GNSS, and it says nothing about GNSS itself being wrong. This offset is growing by two microseconds every second, and it won't stop until you stop listening to GNSS.",
              },
            ],
            explanation:
              "The constellation is healthy, the offset is walking and the other station is clean, so this is a spoof local to Galway. It isn't an outage, because nothing was lost, and it isn't a fault, because nothing on the station is broken. The defense is to stop trusting the input rather than fix the equipment: take GNSS down, let the oscillator free-run, and fly the pass on a reference that's a few hundred microseconds off true but no longer moving.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'go-to-holdover',
      nice: ['S0593', 'K0740'],
      title: 'Stop Trusting GNSS',
      description:
        'On the GPS Timing tab, take the GNSS switch down. The GPSDO drops into holdover, which opens the disciplining loop and leaves the reference free-running on its oven-controlled crystal oscillator, the OCXO. Keep it there for 20 seconds.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-lie'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-reference-mode-set',
          description: 'Reference in Holdover',
          params: { referenceMode: 'holdover' },
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'status-check',
          description: 'Cost and Benefit Understood',
          params: {
            character: Character.SYSTEM,
            question: 'What did going to holdover cost, and what did it buy?',
            options: [
              'It froze the reference where the lie had walked it, and stopped the walk',
              'Nothing - holdover re-derives true time from the stored almanac and the offset returns to zero',
              'The pass - the RX modem cannot lock without a disciplined 10 MHz and SAR-1 will have to be waived',
              'One 10 MHz output - the distribution amplifier drops to four of five ports until GNSS is re-selected',
            ],
            correctIndex: 0,
            explanation:
              "Holdover doesn't know the truth either, it just stops listening to the lie. The offset on the panel now is what the reference will carry until a GNSS you trust re-disciplines it, and every frame timestamp from here carries that offset. Write the figure down, because Rotterdam corrects by it later.",
            pointPenalty: 5,
            documentSection: 'Reference',
            documentLine:
              '05:08 GNSS vs REF delta-T on GW-01 began walking +2 us/s; constellation LOCKED with a full satellite count throughout. SH-02 delta-T +0.0 (same sky). Rotterdam timestamps skew confirmed {{at:obj:spot-the-walk|05:10}}. Called GNSS spoof. GNSS switch down, GPSDO holdover, offset frozen at the value shown on the panel at that moment.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description:
        "Set the antenna to program-track SAR-1 before it rises at 05:22, then confirm its beacon on the RX Analysis tab. The reference is free-running, but the tracker doesn't depend on it.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['go-to-holdover'],
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
      id: 'decode-on-holdover',
      nice: ['T0153', 'K0740'],
      title: 'Decode on the Oscillator',
      description: 'Lock the SAR-1 carrier and hold C/N above 8 dB through the high part of the pass, with the reference still in holdover. Then answer why that works.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on SAR-1',
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
          type: 'status-check',
          description: 'Holdover Decode Explained',
          params: {
            character: Character.SYSTEM,
            question: 'The reference is in holdover and the decode is clean. Why does that work?',
            options: [
              'The modem needs a stable 10 MHz, not a true one, and a free-running OCXO stays stable for hours',
              'Holdover switches the modem to its own internal crystal, so the GPSDO is out of the chain entirely',
              "It doesn't, really - the C/N you see is the AGC compensating for a reference that is drifting the LNB LO",
              'The video downlink carries its own time code and re-disciplines the GPSDO through the modem',
            ],
            correctIndex: 0,
            explanation:
              "Frequency stability and time truth are different things. The LNB LO, the modem symbol clock and the tracker all want a reference that doesn't move, and none of them care what o'clock it is. What does care is the timestamp on every frame going to Rotterdam, which is why the frozen offset goes in the record.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'report-the-attack',
      nice: ['S0593', 'T1580'],
      title: 'Report It',
      description:
        'On the Security Console, flag the new monitoring entry, because the timestamp skew is the first outside evidence of the attack. Then decide what goes to Priya and Rotterdam now, while the spoof is still happening.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-on-holdover'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Timestamp Skew Entry Flagged',
          params: { eventId: 'evt-ts-skew' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Report Contents',
          params: {
            character: Character.SYSTEM,
            question: 'What goes to Priya and Rotterdam now?',
            options: [
              'Time of onset, the delta-T reading and its rate, the constellation state, the SH-02 cross-check, and the frozen offset',
              'That GPS is down over Ireland, and that every NATS station should go to holdover until further notice',
              'Nothing until the spoofer stops - a report on an event still in progress is incomplete and will have to be reissued later',
              'The GPSDO serial number and a request for a replacement unit at the next scheduled maintenance visit',
            ],
            correctIndex: 0,
            explanation:
              "The report covers what was seen, where, when and at what rate, what the other station saw, what was done and what it cost. GPS isn't down, because one station is being lied to, and a report that says so keeps Shetland from going to holdover for nothing. An event in progress is reported while it's in progress.",
            pointPenalty: 5,
            documentSection: 'Report',
            documentLine:
              'Reported to Group CSIRT and Rotterdam {{at:cond:report-the-attack.1|05:30}}: GNSS spoof local to GW-01 from 05:08, +2 us/s, constellation healthy throughout, SH-02 clean. GW-01 reference in holdover; frozen offset logged for timestamp correction. SAR-1 is being flown on the oscillator, decode clean. Spoofer status: ongoing.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'probe-the-sky',
      nice: ['S0648', 'K0926'],
      title: 'Probe the Sky',
      description:
        'Wait for SAR-1 to set (LOS 05:31:28). The only way to know whether the spoofer is still up is to listen, so put the GNSS switch back up, watch the delta-T on the GPS Timing tab for a few seconds, and call what it does.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['report-the-attack'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Pass Over (LOS)',
          params: { noradId: 61701, phase: 'set' },
          mustMaintain: false,
        },
        {
          id: 'probe-gnss',
          type: 'gpsdo-reference-mode-set',
          description: 'GNSS re-selected',
          params: { referenceMode: 'gnss' },
          mustMaintain: false,
        },
        {
          id: 'probe-offset',
          type: 'gpsdo-time-offset-exceeds',
          description: 'Offset read on GPS Timing',
          params: { minOffsetUs: 20, requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'What the Offset Did',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt: "You've put GNSS back up. What is the delta-T doing, and where do you want the reference now?",
            evidence: ['probe-gnss', 'probe-offset'],
            decisionOptions: [
              {
                label: 'Still walking - the spoofer is up. GNSS switch back down; probe again later',
                correctWhen: { fact: 'timing-drifting', is: true },
                consequence: { log: 'Probe: offset resumed walking with GNSS re-selected; reference returned to holdover' },
              },
              {
                label: 'Holding still - the spoofer is off the air. Leave GNSS selected and let it re-discipline',
                correctWhen: {
                  all: [
                    { fact: 'timing-drifting', is: false },
                    { fact: 'gnss-constellation-healthy', is: true },
                  ],
                },
                consequence: { log: 'Probe: offset held still with GNSS re-selected; reference left on GNSS' },
              },
              {
                label: 'It reset to zero - GNSS re-acquired true time on the switch',
                feedback:
                  "The offset is what GNSS walked the reference to. Re-selecting GNSS doesn't undo the walk. If the spoofer is still up it resumes the walk, and either way nothing resets to zero on the switch.",
              },
              {
                label: 'Cannot tell yet - wait for the holdover error figure to clear before trusting the delta-T',
                feedback:
                  "The holdover error is the OCXO's drift against the last discipline point. It isn't the spoof and it doesn't clear, and the delta-T is the read that answers in seconds.",
              },
            ],
            explanation:
              'The probe is the only instrument you have: give the receiver the sky for a few seconds and watch whether the offset moves. Moving means the spoofer is up and the switch goes back down, at a cost of a few more microseconds. Holding still means the sky is honest again. Either way the answer is on the panel, not on the clock.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'all-clear',
      nice: ['S0593', 'T0431'],
      title: 'Ride It Out, Then Come Back',
      description:
        'Stay on holdover while the offset keeps moving on each probe. When GNSS is selected and the delta-T holds still for thirty seconds with the constellation tracking, the sky is honest again, so leave GNSS selected.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['probe-the-sky'],
      timeLimitSeconds: 8 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-reference-mode-set',
          description: 'Reference Back on GNSS',
          params: { referenceMode: 'gnss' },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-time-offset-stable',
          description: 'Offset Still for 30 s on GNSS',
          params: { holdSeconds: 30 },
          mustMaintain: true,
        },
        {
          type: 'gpsdo-gnss-locked',
          description: 'GNSS Re-Acquired (4+ satellites)',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'All-Clear Called Correctly',
          params: {
            character: Character.SYSTEM,
            question: 'What did you verify before trusting GNSS again?',
            options: [
              'The delta-T stopped moving with GNSS re-selected, so the spoofer is off the air',
              'Thirty minutes had passed since onset - a spoofer cannot hold a receiver captured longer than that',
              'The satellite count came back to nine - the constellation re-acquired after the attack',
              'The holdover error figure dropped back to zero - the OCXO had re-converged on GNSS',
            ],
            correctIndex: 0,
            explanation:
              "The only thing that ever moved was the offset, so the only proof of an all-clear is the offset holding still while the receiver is listening. The satellite count was full throughout, so it proves nothing, and the clock tells you nothing about who's on the air.",
            pointPenalty: 5,
            documentSection: 'Reference',
            documentLine:
              'Probe after SAR-1 LOS: delta-T resumed walking with GNSS re-selected; returned to holdover. Second probe: delta-T still for 30 s with GNSS re-selected and 9 satellites tracked; spoofer off the air. Reference left on GNSS to re-discipline. Frozen offset carried on all SAR-1 frame timestamps.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'SAR-2 rises at 05:44:00 from azimuth 006. Retune RX modem 1 to 1370 MHz, point program-track at SAR-2, and wait for the antenna to lock on it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['all-clear'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
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
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'decode-sar2',
      nice: ['T0153', 'K0740'],
      title: 'Decode SAR-2 on True Time',
      description: 'Lock the SAR-2 carrier and hold C/N above 8 dB with the reference back on GNSS. Then answer what is different about these frames.',
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
        {
          type: 'status-check',
          description: 'Frames Compared',
          params: {
            character: Character.SYSTEM,
            question: 'SAR-2 is decoding as cleanly as SAR-1 did. What is different about these frames?',
            options: [
              "Their timestamps are true again, while SAR-1's carry the frozen offset",
              'Nothing - both passes were decoded at the same C/N on the same modem',
              "SAR-2's are Doppler-corrected by the re-disciplined reference; SAR-1's were not",
              "SAR-1's frames are unusable - data taken in holdover cannot be timestamped at all",
            ],
            correctIndex: 0,
            explanation:
              "It's the same modem, the same C/N and the same decode. The only thing the spoof touched was the time written on each frame, and that's recoverable only because you wrote down the offset when you took the switch down.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'close-and-debrief',
      nice: ['T1580', 'K0645', 'K0752'],
      title: 'Close the Record and Debrief',
      description: "SAR-2 is decoding and the reference is back on an honest sky. Close the record by choosing the debrief line that changes tomorrow's sweep.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-sar2'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Debrief Line',
          params: {
            character: Character.SYSTEM,
            question: "Which debrief line should change tomorrow's sweep?",
            options: [
              'GNSS is an input, not the truth: put delta-T on every sweep, and cross-check a walking offset with the other station',
              'The station runs on holdover permanently - GNSS cannot be trusted at this site and the OCXO is good enough',
              'A second GNSS antenna goes on the far side of the building, so the two receivers can vote against each other on the time',
              'Passes are flown with the GPSDO powered down during any suspected event, to deny the spoofer a target',
            ],
            correctIndex: 0,
            explanation:
              "Downlink, uplink and now time were three different inputs to the same station. Each one looked healthy on the panel that was supposed to catch it. What caught them was a reading that shouldn't have been moving, plus a second opinion. Put the reading on the sweep and keep the second opinion close.",
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed {{stationTime}}Z. Open: GNSS spoofer local to GW-01 from 05:08 until the all-clear at {{at:obj:all-clear|05:35}} (source unlocated, referred to Group CSIRT); frozen offset issued to Rotterdam for SAR-1 timestamp correction. Debrief: GNSS vs REF delta-T added to the dashboard sweep; healthy constellation with walking delta-T is called a spoof, not an outage; SH-02 delta-T is the cross-check before any reference action.',
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
        <em>[Text message from Anneke Visser at 04:40]</em>
      </p>
      <p>
        "It's an early one, I know. SAR-1 rises at 05:22 and SAR-2 at 05:44, and both are receive only, so there's nothing to send. The new hop set, HOP-SAR2-05, is staged, but you won't need it today. Our monitoring polls your station every ten minutes and compares your frame timestamps against our reference. If I ring you before AOS, it's because those numbers moved, not because I'm awake."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/intro.mp3'),
    },
    objectives: {
      'spot-the-walk': {
        text: `
        <p>
          It's Anneke. Our latest poll has your frames ahead of ours, and the 05:00 poll didn't. Your GPSDO says it's locked, so the panel alone won't settle this. Before I wake anyone else, please look at Shetland and tell me what it reads.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-spot-the-walk.mp3'),
      },
      'call-the-lie': {
        text: `
        <p>
          A spoof, then. That means the box is fine and the sky is the problem. Take GNSS down and fly SAR-1 on the oscillator, the reference's own crystal clock, and write down the offset at the moment you do, because that number will be on every frame you send me until this is over.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-call-the-lie.mp3'),
      },
      'decode-on-holdover': {
        text: `
        <p>
          The SAR-1 frames are coming in clean, and the timestamps carry your offset exactly as you logged it, so I'm correcting them at this end. Next, flag the monitoring entry and send the report while the spoof is still happening, because Priya will want the onset time more than she'll want the ending.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-decode-on-holdover.mp3'),
      },
      'probe-the-sky': {
        text: `
        <p>
          Still walking, so the spoofer's on the air. A probe is cheap, because it costs a few seconds of listening and a few microseconds of offset. Put the switch back down to holdover and probe again later. Leave GNSS selected only when the delta-T holds still with the receiver listening.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-probe-the-sky.mp3'),
      },
      'all-clear': {
        text: `
        <p>
          Your delta-T has held still for thirty seconds with GNSS selected, so I'll treat the spoofer as gone. SAR-2 rises at 05:44, and you can fly it on the honest sky.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-all-clear.mp3'),
      },
      'close-and-debrief': {
        text: `
        <p>
          That's three inputs in a week, downlink, uplink and now time, and each one looked normal on the panel that should have caught it. You caught each one because you knew what normal looks like and noticed the one reading that wasn't. The source is mine to chase now. Get some sleep.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/20/obj-close-and-debrief.mp3'),
      },
    },
  },
};
