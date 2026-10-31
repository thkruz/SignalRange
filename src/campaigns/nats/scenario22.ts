import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { aurora7Satellite, tidemark1Satellite } from './satellites';

/**
 * NATS Level 22: "End-of-Life Planning"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 6 of 8)
 * Time Pressure: None - this is analysis and communication
 * Calculation Required: Light (trend extrapolation, no RF math)
 * Mechanic Reused: the Working Document panel (from S19), now producing an
 *   executive impact assessment rather than a how-to card.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0721: Knowledge of risk management principles and practices
 *   - T1429: Prepare trend analysis reports
 *   - T1606: Prepare impact reports
 *
 * Supporting Codes:
 *   - K0751: Knowledge of system threats
 *   - S0807: Skill in solving problems
 *   - T1020: Determine operational and safety impacts
 *
 * Premise: AURORA-7's beacon power has declined for months (power subsystem
 * aging) and the decline is steepening. Francis Martin (board) wants an
 * operations recommendation on retirement timing. The player runs a final
 * data-collection pass, then builds a trend assessment and sunset
 * recommendation in the Working Document - the campaign's first
 * report-producing scenario. Light on RF, heavy on analysis and the
 * discipline of labeling confidence.
 *
 * Tone: Reflective-analytical. Marcus (Halifax vehicle view), Dana (intro),
 * Francis (board-level, rare). All quizzes SYSTEM. 5 clips.
 *
 * Sim notes:
 *   - VT-01 starts on its default target (TIDEMARK-1); the player selects
 *     AURORA-7 and moves to it on program-track, then engages step-track for
 *     the final ops run (the beacon is weak - end-of-life). The data-collection
 *     phase is real (beacon present at 1085 MHz IF, modem 1 locked on the
 *     1422 MHz carrier); the rest is analysis quizzes that build the report.
 *   - Phase 27 (stand-ins gone): VT-01 starts off the air (TIDEMARK-1
 *     traffic on ME-02 for the run) with its TX chain staged for AURORA-7
 *     (BUC LO 7500, modem 1447 MHz / 24 MHz). The beacon is measured with
 *     nothing of ours on the bird; then the player keys the AURORA-7 test
 *     carrier and the RX modem locks to it coming back down.
 */

export const scenario22Data: ScenarioData = {
  id: 'nats-scenario22',
  prerequisiteScenarioIds: ['nats-scenario21'],
  url: 'nats/scenarios/nats-scenario22',
  imageUrl: 'nats/22/card.png',
  number: 22,
  title: 'End-of-Life Planning',
  subtitle: 'AURORA-7 Sunset Recommendation',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Analysis & Reporting',
  description: `AURORA-7's beacon power has been declining for months - the power subsystem on a nineteen-year-old bird running out of watts - and the slope is steepening. The board wants a recommendation on retirement timing, from operations rather than from a spreadsheet.<br><br>Run one more data-collection pass this morning, then build the assessment. The Working Document panel is set up as the report template; it fills in as you make your calls. Francis Martin wants a recommendation he can forward without editing: how long the spacecraft can responsibly carry service, what degrades first, and what the migration window looks like.<br><br>Light on RF today. Heavy on reading a trend straight and saying what you know without false precision.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End', 'Spectrum Analyzer', 'RX/TX Modems', 'Working Document panel (the report)'],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: {
              isPowered: true,
              isMuted: true,
              isLoopback: false,
              loFrequency: 7500 as MHz,
              isExtRefLocked: true,
              gain: 23 as dB,
            },
            hpa: {
              isPowered: true,
              isHpaEnabled: false,
              isHpaSwitchEnabled: false,
              backOff: 10,
            },
          }),
        ],
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            // VT-01 is off-air at shift start, so the AGC sees only noise and
            // beacons and lifts the TIDEMARK-1 beacon to about -44 dBm
            minAmplitude: -120 as dBm,
            maxAmplitude: -30 as dBm,
          },
        ],
        transmitters: [
          {
            ...vermontGroundStation.transmitters[0],
            activeModem: 1,
            modems: [
              {
                ...vermontGroundStation.transmitters[0].modems[0],
                isTransmitting: false,
                isTransmittingSwitchUp: false,
                ifSignal: {
                  ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
                  signalId: 'AURORA-7-Uplink',
                  noradId: 28899,
                  frequency: 1447e6 as IfFrequency, // 7500 - 6053
                  bandwidth: 24e6 as Hertz,
                  modulation: 'QPSK' as ModulationType,
                  fec: '3/4' as FECType,
                  power: -7 as dBm,
                },
              },
            ],
          },
        ],
        receivers: [
          {
            activeModem: 1,
            modems: [
              {
                modemNumber: 1,
                isPowered: true,
                frequency: 1422 as MHz, // AURORA-7 downlink IF (5250 - 3828)
                bandwidth: 24 as MHz,
                modulation: 'QPSK',
                fec: '3/4',
                antenna_id: 1,
              },
            ],
          },
        ],
      },
    ],
    satellites: [aurora7Satellite, tidemark1Satellite],
    workingDocument: {
      title: 'AURORA-7 End-of-Life Assessment',
      description: "Operations recommendation for the SeaLink board - built from today's data run and trend analysis.",
    },
    scenarioStartDate: '2026-03-16', // Monday, per the brief
    scenarioStartWallTime: '09:30:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-22?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Tasking',
      description: "Open the brief and Francis's request.",
      groundStation: 'VT-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Opened',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Frame the Deliverable',
          params: {
            character: Character.SYSTEM,
            question: 'Francis wants a retirement recommendation "from operations." What does that mean you must produce?',
            options: [
              'A defensible recommendation grounded in measured data and an honest trend, with assumptions labeled - not a single date',
              'A precise retirement date to the day, with the math shown - not a vague window the board cannot budget against',
              'A decision to retire now, with the risk stated - not a recommendation that leaves a failing bird in service for a quarter',
              "A restatement of the vendor's end-of-life bulletin, with our data appended - not an operator's opinion on spacecraft health",
            ],
            correctIndex: 0,
            explanation:
              'The board can handle uncertainty; it cannot handle a confident number that unravels in a quarter - a single date carries false precision. "From operations" means built from what the dish actually measures.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Select the Vermont Ground Station.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'ground-station-selected',
          description: 'VT-01 Selected',
          params: { groundStationId: 'VT-01' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // PHASE 1: FINAL DATA COLLECTION RUN
    // ============================================================
    {
      id: 'acquire-aurora',
      nice: ['S0421', 'K1032'],
      title: 'Acquire AURORA-7',
      description: 'In ACU Control, select AURORA-7 (NORAD 28899) as the target and Move to Target on program-track for the final data run.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        // No separate Program-Track row: VT-01 is already in program-track on
        // TIDEMARK-1, so it ticked before the player acted. Lock on AURORA-7
        // needs the retarget and the slew.
        {
          type: 'antenna-locked',
          description: 'Locked on AURORA-7',
          params: { noradId: 28899 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'engage-step-track',
      nice: ['S0421', 'K1032'],
      title: 'Step-Track for the Weak Beacon',
      description:
        'Engage step-track on ACU Control - the beacon is about 6 dB down from its prime and needs every bit of pointing accuracy. Watch the ACU beacon C/N climb from about 7 dB on program-track to about 9 dB as step-track finds the peak; the step-track floor is the 6.5 dB beacon lock.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-aurora'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          // B3: the 15 s hold counts while the player watches the ACU
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Step-Track Engaged',
          params: { trackingMode: 'step-track' },
          mustMaintain: true,
        },
        {
          // Phase 19.4: a real climb (~40 s of stepping), then a hold above
          // the floor (nats-s22-F6; nats-step-track-validation.test.ts).
          // Headless 2026-10-07: 7.3 dB program-track -> 9.1 dB step-track.
          // AURORA-7's beacon, not the TIDEMARK-1 lock VT-01 starts with
          type: 'antenna-beacon-locked',
          description: 'Beacon Peaked and Held (≥ 8.3 dB)',
          params: { minBeaconCn: 8.3, noradId: 28899 },
          mustMaintain: true,
          maintainDuration: 15,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'measure-beacon',
      nice: ['T1429', 'K0773'],
      title: "Measure Today's Beacon",
      description:
        'On RX Analysis, center the spectrum analyzer on the AURORA-7 beacon at 1085 MHz IF with Span 0.002 MHz and RBW Auto (3 Hz), the setting the reference was logged at (there is no preset button: if the span has been changed, type 0.002 into Span and set RBW back to Auto), then read its level off the Peak readout (Peak Search) and compare it with the reference in the brief. Measure it now, with nothing of ours on the bird: that is how the log is kept.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['engage-step-track'],
      timeLimitSeconds: 3 * 60,
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
          type: 'speca-center-frequency',
          description: 'Spectrum at 1085 MHz IF',
          params: {
            centerFrequency: 1085e6,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          // Phase 29 D12 (nats-r4-s22-F1): the CW Peak depends on span/RBW
          // (-69.3 at 2 kHz, -67.7 at 10 kHz, -66.2 at 1 MHz), so the step
          // names the span the reference was logged at. The analyzer starts
          // at 2 kHz, so this row is a read on RX Analysis (requiresObservation:
          // no fresh change asked), not a setting to make.
          type: 'speca-span-set',
          description: 'Span 0.002 MHz, RBW Auto (3 Hz)',
          params: { span: 2e3, spanTolerance: 0.5e3, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'AURORA-7 Beacon Captured',
          params: {
            signalId: 'AURORA-7-Beacon',
            minPower: -110 as dBm,
          },
          mustMaintain: true,
        },
        {
          // s22-F5: the player's Peak readout makes the measurement real.
          // nats-r3 2026-10-13 (decision D6, physics unchanged): step-tracked
          // (ACU beacon C/N 9.0 dB), carrier off (AGC on noise alone), the
          // beacon Peak reads -69.2 to -69.4 dBm at 1085 MHz / 2 kHz span.
          // Against the brief's -63 dBm reference that is 6.3 dB down; the
          // brief's monthly median is -6.3 and the step-track floor (6.5 dB
          // beacon C/N, 2.3-2.5 dB under today's lock) sits near -8.6. With
          // our own carrier keyed the AGC backs off ~12 dB (about -81).
          type: 'status-check',
          description: 'Beacon Level Read',
          params: {
            character: Character.SYSTEM,
            question: "Read the beacon off the analyzer's Peak readout. Against the brief's reference (about -63 dBm, logged the same way), what does today's reading say?",
            options: [
              'About -69 dBm: about 6 dB under the reference, in line with the -6.3 dB monthly median in the log',
              'About -63 dBm: level with the reference - no decline this month, the log median is wrong',
              'About -57 dBm: about 6 dB above the reference - the decline has reversed',
              'About -75 dBm: about 12 dB under the reference - already past the step-track floor',
            ],
            correctIndex: 0,
            explanation:
              "About -69 dBm against about -63 dBm is about 6 dB down: today's spot reading agrees with this month's -6.3 dB median. A single reading wanders a few tenths with pointing and noise, which is why the trend is built from medians, and it only compares at the reference's own 2 kHz span: a wider span brings a wider RBW, which adds noise power to the Peak reading (about -67.7 at 10 kHz, -66 at 1 MHz). At that span it is your own measurement and it matches. It is still about 2.3 dB above the step-track floor (about -8.6), the same margin the ACU shows between its beacon C/N and the 6.5 dB lock.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'key-aurora-uplink',
      nice: ['T1567', 'S0421'],
      title: 'Bring the Test Carrier Up',
      description:
        'TX Chain: the chain is staged for AURORA-7 (BUC LO 7500, TX modem 1447 MHz / 24 MHz) and off the air. Bring it up drive first: TX modem transmitting, then unmute the BUC, then enable the HPA.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['measure-beacon'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'TX Modem Transmitting',
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-carrier',
      nice: ['T1429', 'K0740'],
      title: 'Prove the Carrier',
      description:
        'Back on RX Analysis: confirm receiver modem 1 is locked on the carrier at 1422 MHz IF (your test carrier coming back down through AURORA-7) and read its C/N for the report.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['key-aurora-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        // Backs the report's "carrier C/N above demod threshold" line, which
        // had no step behind it (nats-s22-F5)
        {
          type: 'receiver-signal-locked',
          description: 'Carrier Locked (modem 1, 1422 MHz)',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'Carrier C/N ≥ 8 dB',
          params: { minCNRatio: 8 },
          mustMaintain: true,
        },
        {
          // Headless 2026-10-07: 14.1 dB C/N, 9.9 dB lock margin, at 10 dB
          // HPA back-off with step-track on
          type: 'status-check',
          description: 'Carrier C/N Read',
          params: {
            character: Character.SYSTEM,
            question: 'What C/N does RX modem 1 show on the AURORA-7 carrier?',
            options: ['About 14 dB', 'About 6 dB', 'About 2 dB, flickering in and out of lock', 'About 27 dB'],
            correctIndex: 0,
            explanation:
              'About 14 dB, more than 9 dB above where QPSK 3/4 acquires lock (the modem shows Required Es/N0 5.0 dB; with Es/N0 about 0.8 dB above Raw C/N it acquires lock from about 4.7 dB C/N: Required 5.0 plus a 0.5 dB acquisition margin, less the 0.8 dB Es/N0 offset). The transponder is fine: what is fading is the beacon, and with it the ability to track an inclined bird. That is the point the report has to make.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'record-data-point-quiz',
      nice: ['T1429', 'K0740'],
      title: "Report: Today's Measurement",
      description: "Record today's data point in the assessment.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-carrier'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Data Point',
          params: {
            character: Character.SYSTEM,
            question: "What goes into the report as today's measured data?",
            options: [
              'Beacon at -6.3 dB relative to the 36-month reference; step-track held lock at this level; carrier C/N above demod threshold',
              'Beacon at -6.3 dB relative to the 36-month reference; step-track lost lock at this level; carrier C/N below demod threshold',
              'Beacon declining, no number needed at this stage; step-track engaged as usual; carrier C/N nominal per the link budget on file',
              'Beacon at -3.0 dB relative to the 12-month point; step-track held lock at this level; satellite will fail within the quarter',
            ],
            correctIndex: 0,
            explanation:
              'Measured values, stated as measured, not estimated. The number with its reference and the fact that step-track still holds at this level - that is data, and the report is built on data first.',
            pointPenalty: 5,
            documentSection: 'Data (measured today)',
            documentLine:
              'Beacon -6.3 dB vs 36-mo reference (about -69 dBm against -63). Step-track holds lock at this level, about 2.3 dB above the floor. Carrier C/N above demod threshold.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: TREND ANALYSIS
    // ============================================================
    {
      id: 'trend-slope-quiz',
      nice: ['T1429', 'S0807'],
      title: 'Report: the Trend',
      description: 'Characterize the decline from the beacon-power history.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['record-data-point-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Trend Shape',
          params: {
            character: Character.SYSTEM,
            question: 'The history: -3.3 dB at 12 months, -4.7 at 6 months, -6.3 today. How do you characterize the trend?',
            options: [
              'Accelerating - the last 6 months lost ~1.6 dB against ~1.4 dB in the 6 before; a steepening curve, not a straight line',
              'Linear - roughly 0.25 dB per month from the 12-month point to today; a straight line, so extrapolation is safe a year out',
              'Flattening - the first year of the record lost 1.3 dB and the last 6 months only 1.6 dB more; the decline is slowing as the array settles',
              'Random - three points six months apart are noise, not a trend; the -6.3 dB today could be rain fade on a single measurement',
            ],
            correctIndex: 0,
            explanation:
              'Reading acceleration vs linearity is the whole analysis. Per six months the losses run 0.6, 0.7, 0.9, 1.1, 1.4, then 1.6 dB - the rate keeps rising, so naive linear extrapolation understates the near-term decline. A power subsystem shedding load tends to worsen non-linearly; calling it linear would sell the board a longer runway than the spacecraft has.',
            pointPenalty: 5,
            documentSection: 'Trend',
            documentLine: 'Beacon decline ACCELERATING: -3.3 (12mo) -> -4.7 (6mo) -> -6.3 (now). Non-linear - linear extrapolation understates near-term.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'binding-constraint-quiz',
      nice: ['K0751', 'T1020'],
      title: 'Report: What Fails First',
      description: 'Identify the operational cliff that actually ends usable service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['trend-slope-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Binding Constraint',
          params: {
            character: Character.SYSTEM,
            question: 'What is the binding constraint - the thing that ends usable service first?',
            options: [
              'The beacon getting too weak to step-track - AURORA-7 is inclined, so without it every pass becomes manual figure-8 chasing',
              'The transponder ceasing to relay - the payload is the oldest hardware aboard, so the carrier drops before the beacon does',
              'The satellite de-orbiting - AURORA-7 is inclined because station-keeping ended, so the orbit decays before the power does',
              'Fuel exhaustion for station-keeping - the inclination is already growing, so the figure-8 outgrows the dish before the beacon fades',
            ],
            correctIndex: 0,
            explanation:
              'The inclined-orbit lesson pays off: an inclined bird is only usable while step-track can hold its beacon, and service quality collapses once it cannot. The cliff is tracking, not transponder death. The recommendation hinges on when the declining beacon crosses the trackability floor, not on the transponder.',
            pointPenalty: 5,
            documentSection: 'Risk',
            documentLine:
              'Binding constraint = beacon trackability (inclined bird). When beacon too weak to step-track, every pass goes manual and quality collapses. NOT transponder death.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'marcus-corroboration-quiz',
      nice: ['T1020', 'K1032'],
      title: 'Report: Vehicle Corroboration',
      description: "Fold in Halifax's spacecraft-side view of the power trend.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['binding-constraint-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Corroboration',
          params: {
            character: Character.SYSTEM,
            question: 'Marcus confirms the vehicle bus is shedding RF load as the array ages. How does that affect confidence in the trend?',
            options: [
              'It raises confidence: ground-measured beacon decline and spacecraft-reported power loss agree from independent vantage points',
              'It lowers confidence: the spacecraft reports a bus problem, not a beacon problem, so the ground data and the telemetry disagree',
              "It leaves confidence unchanged: only the ground measurement matters to the board, and Halifax's telemetry is not our data",
              'It shifts the blame: the satellite is fine and shedding load by design, so the beacon decline is our dish or LNB degrading',
            ],
            correctIndex: 0,
            explanation:
              'Two independent measurements agreeing on cause AND trend is the strongest evidence a report can carry - it explains the mechanism, and the trend is real, not an artifact of our station. It also rules out "our antenna is degrading" - the spacecraft sees its own power dropping.',
            pointPenalty: 5,
            documentSection: 'Trend',
            documentLine: 'Corroborated by Halifax: vehicle bus shedding RF load as array ages. Ground + spacecraft agree on cause and trend (independent vantage points).',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RECOMMENDATION
    // ============================================================
    {
      id: 'sunset-window-quiz',
      nice: ['K0721', 'T1606'],
      title: 'Report: the Recommendation',
      description: 'Make the call - a window with decision points, not a single date.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['marcus-corroboration-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Sunset Recommendation',
          params: {
            character: Character.SYSTEM,
            question: 'What is the responsible recommendation?',
            options: [
              'Begin migration now and have customers moved inside two quarters; floor in two to three, reviewed monthly, firm trigger at the step-track floor',
              'Retire immediately; the risk is unacceptable at -6.3 dB, migration forced this month, with no window for the customers to plan',
              'Take no action for a year; the link still works today, reviewed at the next budget cycle, with a decision then if the beacon fades',
              'Set a retirement date 12 months out; the board can budget against a date, migration scheduled backward from it, with no review points',
            ],
            correctIndex: 0,
            explanation:
              'A window plus tripwires, not a date. At the last six months\' rate (1.6 dB) the 2.3 dB to the floor lasts about three quarters; the curve is steepening, so plan for less and move customers inside two. "Begin migration now, decide at the trackability floor" is defensible because it is tied to a measurable event, not a guess. Twelve months is past where the trend says the floor is.',
            pointPenalty: 10,
            preserveOptionOrder: true,
            documentSection: 'Recommendation',
            documentLine:
              'Begin customer migration NOW, customers moved inside two quarters. Floor expected in two to three quarters (sooner if the slope steepens), monthly data review, firm trigger = beacon crosses step-track floor. Window with tripwires, not a fixed date.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'assumptions-quiz',
      nice: ['K0721', 'T1606'],
      title: 'Report: Label the Assumptions',
      description: 'State what the recommendation depends on - the honesty that makes it defensible.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sunset-window-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Stated Assumptions',
          params: {
            character: Character.SYSTEM,
            question: 'Which assumptions must the report state explicitly?',
            options: [
              'The decline continues or steepens (no recovery), no single-event failure intervenes, and tracking is the binding constraint',
              'The customer cooperates with migration (no holdouts), procurement funds the replacement, and Francis accepts the window',
              'AURORA-7 was built to a 15-year design life (now exceeded), the vendor bulletin is accurate, and the array cannot recover',
              'None need stating (the data speaks for itself), the recommendation is certain, and a caveat would only weaken it at the board',
            ],
            correctIndex: 0,
            explanation:
              'A recommendation that names its assumptions can be defended and updated; one that hides them collapses the first time reality diverges. If any of the three breaks, the window changes. Stating them is what separates analysis from a guess in a suit.',
            pointPenalty: 5,
            documentSection: 'Assumptions',
            documentLine: 'Assumes: decline continues/steepens (no recovery), no single-event failure, tracking is the binding constraint. Window revises if any breaks.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'false-precision-quiz',
      nice: ['T1606', 'S0807'],
      title: 'Confidence Discipline',
      description: 'Confirm the line between what you measured and what you projected.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['assumptions-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Measured vs Projected',
          params: {
            character: Character.SYSTEM,
            question: 'How should the report distinguish measured facts from projections?',
            options: [
              "Explicitly: today's -6.3 dB and the historical points are measured; the sunset window is a projection under stated assumptions",
              "Uniformly: today's -6.3 dB and the sunset window carry equal weight; a recommendation reads stronger with one confidence level",
              "Conservatively: only today's -6.3 dB and the historical points go in; the projection is omitted until more data exists",
              'Decisively: the historical points are the basis; the projection is rounded to a single date so the board has something to act on',
            ],
            correctIndex: 0,
            explanation:
              'Measured and projected carry different weight; conflating them is how a report loses credibility in a quarter. Label each so the board knows which is which: it can act on a clearly-labeled projection - it cannot trust a number it later learns was a guess dressed as a fact.',
            pointPenalty: 5,
            documentSection: 'Confidence',
            documentLine: 'Measured: today -6.3 dB and the history table. Projected: sunset window, under stated assumptions.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 4: REVIEW AND DELIVER
    // ============================================================
    {
      id: 'review-report',
      nice: ['T1606', 'T1429'],
      title: 'Review the Assessment',
      description: 'Review the Working Document: what makes it board-ready?',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['false-precision-quiz'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Board-Ready Check',
          params: {
            character: Character.SYSTEM,
            question: 'What makes this assessment something Francis can forward without editing?',
            options: [
              'It has data, a trend, the binding-constraint risk, a windowed recommendation with tripwires, and labeled assumptions',
              'It is short, fits on one page, leads with the recommendation, and leaves the supporting data in an appendix Francis can drop',
              'It ends on a single confident date, gives the board a number to budget against, and keeps the caveats out of the summary',
              'It avoids any mention of uncertainty, reads as settled, and cannot be picked apart by a board member looking for doubt',
            ],
            correctIndex: 0,
            explanation:
              'Forward-without-editing is the bar: complete enough to stand alone, honest enough to survive scrutiny, structured so the reasoning is visible - a board member can read it, understand the basis, and defend the decision to others. That is the difference between operations input and an opinion.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-delivery',
      nice: ['K0645', 'T1606'],
      title: 'Deliver and Log',
      description: 'Choose the entry that closes the tasking, then type it in the Ops Log (sidebar): name AURORA-7 and the recommendation (migrate / sunset).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-report'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Delivery Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which log entry closes the tasking?',
            options: [
              'AURORA-7 EOL assessment to board: beacon -6.3 dB, trend accelerating; migrate now (inside 2 quarters), floor in 2-3, trigger at tracking floor',
              'AURORA-7 EOL report to Francis: beacon -6.3 dB, trend linear; no action this year, review at next budget cycle, retire when it fails',
              'AURORA-7 retirement recommended: beacon -6.3 dB, trend accelerating; retire immediately, migration forced, date set 8 months out',
              'AURORA-7 data run complete: beacon -6.3 dB, step-track held; analysis pending, trend to be characterized, board note to follow',
            ],
            correctIndex: 0,
            explanation:
              "The log mirrors the report's spine: data (beacon -6.3 dB, step-track held), trend, binding constraint (beacon trackability), recommendation, assumptions stated, measured vs projected labeled - delivered via Martin. Anyone reading it later knows exactly what was delivered and on what basis.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
        {
          type: 'ops-log-entry',
          description: 'Delivery Entry Typed in the Ops Log',
          params: { logKeywords: ['aurora', 'migrat|sunset|retire'], logMinLength: 20 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Dana at 09:21]</em>
      </p>
      <p>
        "Board's doing budget planning and Francis wants an AURORA-7 retirement recommendation - from operations, not from a spreadsheet. You've flown that bird more than anyone on this rotation. Run one more data pass this morning, then build the assessment. The Working Document panel is your report template; it fills in as you make the calls. He wants something he can forward without editing."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/22/intro.mp3'),
    },
    objectives: {
      'measure-beacon': {
        text: `
        <p>
          Marcus from Halifax - I hear you're writing AURORA's obituary. For your trend. Our vehicle telemetry shows the array down to about seventy percent of beginning-of-life output, and the bus is auto-shedding RF load to protect the housekeeping buses. Your beacon decline and our power numbers are the same story. She's earned her retirement, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.SAD,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-measure-beacon.mp3'),
      },
      'sunset-window-quiz': {
        text: `
        <p>
          Francis Martin. Appreciate you taking this on directly. What the board needs is exactly what you're building - not a date we'll have to walk back, but a window with triggers we can plan a migration around. Cost-of-being-wrong runs both directions here. Retire too early and we waste an asset, too late and we strand customers. Give me the honest middle.
        </p>
        `,
        character: Character.FRANCIS_MARTIN,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-sunset-window-quiz.mp3'),
      },
      'review-report': {
        text: `
        <p>
          That's a document I can take to the board without rewriting a line - and more to the point, one I can defend when they push on it. The labeled assumptions are what'll save us the quarter this goes sideways. Well done.
        </p>
        `,
        character: Character.FRANCIS_MARTIN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-review-report.mp3'),
      },
      'log-delivery': {
        text: `
        <p>
          First report you've written that goes straight to a board instead of into a shift log. Notice it's the same discipline as a good log entry - say what you know, label what you don't, make the next reader able to act. Scales all the way up.
        </p>
        <p>
          Nineteen years. Good bird. Good send-off.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/22/obj-log-delivery.mp3'),
      },
    },
  },
};
