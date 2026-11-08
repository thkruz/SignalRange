import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { ME02_TM2_TRANSMITTER, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 14: "Rain Fade"
 *
 * Phase: Qualified Operations (Phase 2, Scenario 6 of 8)
 * Time Pressure: Moderate (rain front arriving early in the scenario)
 * Calculation Required: NO
 * New UI Elements: None - reuses S3 (feed heater + AGC) and S1 (C/N margin)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0689: Knowledge of network infrastructure principles and practices
 *   - S0675: Skill in optimizing system performance
 *   - K0721: Knowledge of risk management principles and practices
 *
 * Supporting Codes:
 *   - T0153: Monitor network capacity and performance
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - S0593: Skill in handling incidents
 *
 * Premise: A heavy rain cell (50 mm/h) is moving over VT-01. The customer
 * (James Okafor, SeaLink fleet captain) has called ahead - their SLA
 * terms allow degradation but penalize handover events. He wants the
 * operator to hold VT-01 through the weather if at all possible.
 *
 * The operator's job: enable feed heater, watch AGC headroom, monitor
 * link margin, and make the call - hold or hand off. The right answer
 * for a C-band rain cell (~1 dB of C/N) is to hold; the wrong answer is to escape
 * the moment the link wavers.
 *
 * S3 taught "weather hits → hand over." S14 teaches that escape is not
 * always correct. Customer-constraint reasoning is explicit, and this
 * is the first scenario in the campaign that introduces K0721 (risk
 * management) as a primary code.
 *
 * Tone: Qualified operator. Dialog capped at 4 clips. SYSTEM for all
 * quizzes by default. Named characters only for the customer call,
 * the decision check-in, and the close.
 *
 * Story Continuity:
 *   - Dana is on-site, primary supervisor.
 *   - ME-02 has been running TIDEMARK-2 since S3 - available as fallback
 *     but currently busy with its own customers.
 *   - James Okafor speaks the customer-impact side; he doesn't talk RF.
 *
 * Sim notes:
 *   - Fade gating (Phase 32 D20, nats-r7-s14-F1): the rain starts as
 *     'monitor-during-fade' opens and ramps in over 180 s, so the RAIN FADE
 *     alarm (C/N loss >= 0.5 dB) comes up about 2 minutes in. That step's
 *     watch row reads the alarm live on VT-01's antenna and has to hold 20 s,
 *     so it and every fade-phase step behind it (AGC Behavior, AGC Headroom,
 *     the HPA read "with the cell overhead") wait for the cell. Before, the
 *     20 s C/N watch finished before any dip and the quizzes ran ahead of it.
 *     The custom evaluator reads through the window.signalRange handle (no
 *     manager imports), as S17's sky-noise rows do.
 */

/** Whether VT-01's antenna has the RAIN FADE alarm up right now. */
const vt01RainFadeUp = (): boolean => {
  const w = window as unknown as {
    signalRange?: {
      simulationManager?: {
        groundStations?: Array<{
          state?: { id?: string };
          antennas?: Array<{ getStatusAlarms?: () => Array<{ message: string }> }>;
        }>;
      };
    };
  };
  const gs = w.signalRange?.simulationManager?.groundStations?.find((g) => g.state?.id === 'VT-01');
  const alarms = gs?.antennas?.[0]?.getStatusAlarms?.() ?? [];

  return alarms.some((a) => a.message.startsWith('RAIN FADE'));
};

export const scenario14Data: ScenarioData = {
  id: 'nats-scenario14',
  prerequisiteScenarioIds: ['nats-scenario13'],
  url: 'nats/scenarios/nats-scenario14',
  imageUrl: 'nats/14/card.png',
  number: 14,
  title: 'Rain Fade',
  subtitle: 'Adapt Without Handover',
  duration: '25-35 min',
  difficulty: 'intermediate',
  missionType: 'Weather Contingency',
  description: `Heavy rain cell moving over Vermont, maybe twenty minutes through. At C-band the link will fade but it shouldn't black out.<br><br>The customer - James Okafor, fleet captain for the Atlantic Shipping Alliance, SeaLink's anchor customer - has called ahead. Their SLA terms penalize handover events more than they penalize a few dB of margin loss, so he's asked us to hold VT-01 through the weather if we can. ME-02 is busy on TIDEMARK-2 and would have to drop its own customers to take TIDEMARK-1.<br><br>Your job: enable the feed heater, watch AGC headroom, track the beacon C/N, and make the call. Hold or hand off - the right answer is the one the link supports.`,
  equipment: ['9-meter C-band Antenna', 'RF Front End (Feed Heater, AGC)', 'Spectrum Analyzer', 'RX/TX Modems', 'ME-02: Operational (TIDEMARK-2)'],
  timeLimitSeconds: 35 * 60, // 35 minutes
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: tracking TIDEMARK-1, healthy at baseline. Rain begins 5 s after Monitor Through the Fade opens (about 1320).
      {
        ...vermontGroundStation,
      },
      // ME-02: operational, currently serving TIDEMARK-2. Present as a
      // theoretical fallback but engaged with its own traffic.
      {
        id: 'ME-02',
        name: 'Maine Ground Station',
        isOperational: true,
        location: {
          latitude: 45.2538,
          longitude: -69.7657,
          elevation: 180,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            isPowered: true,
            azimuth: 146.96 as Degrees, // Maine sees TM-2 (45 W) here, not at Vermont's 143.3 / 31.8 (Phase 28 D4)
            elevation: 32.42 as Degrees,
            // polarization: derived from geometry (Phase 29 D8)
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526, // TIDEMARK-2
            targetAzimuth: 146.96 as Degrees,
            targetElevation: 32.42 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 4180e6 as Hertz, // TIDEMARK-2 beacon (RF)
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 mirrors VT-01's LNB LO so the TM-2 beacon comes out at 1070 MHz IF.
            // Maine carries TIDEMARK-2 (its own hub carrier, phase 27): chain hot,
            // BUC unmuted, HPA on at its operating back-off
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
            centerFrequency: 1070e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
            // Phase 27: the TIDEMARK beacon reads -54 to -59 dBm at the RX IF tap
            // (ledger), the floor ~-114 dBm in 3 Hz: both on screen, 10 dB/div
            minAmplitude: -140 as dBm,
            maxAmplitude: -40 as dBm,
            scaleDbPerDiv: 10 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          },
        ],
        // ME-02's TM-2 hub carrier keyed (phase 27)
        transmitters: [ME02_TM2_TRANSMITTER],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite, ses10Satellite],
    weatherEvents: [
      {
        id: 'vermont-rain-front',
        groundStationId: 'VT-01',
        type: 'rain',
        severity: 'severe',
        // A heavy convective cell (Phase 19.2): at C-band even 50 mm/h costs
        // VT-01 only ~1 dB of C/N, and most of that is sky noise (the wet
        // path radiates into the beam), not attenuation. A 12 mm/h
        // 'moderate' front cost ~0.15 dB, which no display could show.
        rainRateMmPerHour: 50,
        // The front arrives as the operator starts monitoring, not at a fixed
        // 300 s that a fast player finished before and a slow one missed the
        // start of (nats-s14-F5)
        startAfterObjectiveId: 'monitor-during-fade',
        startTime: 5,
        duration: 1200, // 20 minutes of rain
        // Informational only for rain (the loss is computed from the rate):
        // the ~1 dB the noise model gives at C-band. Compare S3's blizzard,
        // where ice on the feed does the damage.
        linkMarginDegradation: 1,
      },
    ],
    trafficOwnership: [
      {
        satelliteNoradId: 61525, // TIDEMARK-1
        initialOwnerId: 'VT-01',
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-14?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    // Brief: Wednesday, 1318 Local
    scenarioStartDate: '2026-02-11',
    scenarioStartWallTime: '13:18:00',
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Shift Brief',
      description: 'Open the shift brief, including the customer note from SeaLink, and acknowledge you are ready to begin.',
      groundStation: 'VT-01',
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
          description: 'Ready to Begin',
          params: {
            character: Character.SYSTEM,
            question: 'Have you reviewed the shift brief and SeaLink customer note?',
            options: ['Yes, brief reviewed. Standing by for the front.'],
            correctIndex: 0,
            explanation: 'The front is only minutes out, so get your protective measures in place before it arrives.',
            pointPenalty: 0,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // CUSTOMER CONSTRAINT
    // ============================================================
    {
      id: 'acknowledge-customer-constraint',
      nice: ['K0721', 'S0593'],
      title: 'Customer Constraint',
      description: 'James Okafor (Atlantic Shipping Alliance) has called ahead about the weather. Acknowledge what he is asking for.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer SLA Posture',
          params: {
            character: Character.SYSTEM,
            question: 'James is asking us to hold VT-01 through the rain rather than hand off. What is the operational reason?',
            options: [
              'Their SLA penalizes handover events more heavily than a few dB of margin loss',
              'Their SLA does not allow ME-02 to carry SeaLink traffic without prior certification',
              'The handover process always drops their vessel telemetry, so every handover is a logged outage',
              'ME-02 is busy carrying TIDEMARK-2, so there is no station available to hand over to',
            ],
            correctIndex: 0,
            explanation:
              'SeaLink runs vessel telemetry that survives short C/N dips, but it logs a hard event on every uplink change. A handover event costs them more under the contract than a C/N dip does. The customer is telling us what they value, so listen.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PROACTIVE PROTECTION - FEED HEATER
    // ============================================================
    {
      id: 'select-vermont-station',
      nice: ['S0421'],
      title: 'Open VT-01',
      description: 'Select the Vermont Ground Station.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acknowledge-customer-constraint'],
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
    {
      id: 'pre-storm-dashboard',
      nice: ['T0153', 'K0741'],
      title: 'Pre-Storm Dashboard Sweep',
      description: 'Confirm VT-01 is healthy at baseline before the rain arrives.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-vermont-station'],
      timeLimitSeconds: 1 * 60,
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
          description: 'Pre-Storm Baseline',
          params: {
            character: Character.SYSTEM,
            question: 'What is VT-01 reporting before the front arrives?',
            options: [
              'No warnings or criticals, just the Signal(s) Detected info row',
              'A BUC over-temperature alarm, so transmit waits until it cools',
              'An antenna tracking error, with beacon lock lost before the front',
              'A GPSDO holdover alarm, with the timing reference at risk',
            ],
            correctIndex: 0,
            explanation:
              'That\'s a clean baseline: there are no warning or critical alarms, and the one informational row, Signal(s) Detected, just says the receiver sees carriers. Note the C/N now, so you know what "nominal" looks like once the rain starts pulling it down.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'enable-feed-heater',
      nice: ['S0421', 'K0689'],
      title: 'Enable Feed Heater',
      description:
        'Open the ACU Control panel and enable the feed heater before the front arrives. The card says "Prevents ice, keeps the feed dry", and in rain the same heater does the second job. The Rain Blower is optional at C-band, even in a heavy cell, and isn\'t part of this procedure.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['pre-storm-dashboard'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'ACU Control Open',
          params: { tab: 'acu-control' },
          mustMaintain: true,
        },
        {
          type: 'feed-heater-enabled',
          description: 'Feed Heater Enabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'understand-heater-vs-rain',
      nice: ['K0689', 'K0773'],
      title: 'Heater Purpose for Rain',
      description: 'Confirm what the feed heater is doing for a rain event (versus snow).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['enable-feed-heater'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Heater Role During Rain',
          params: {
            character: Character.SYSTEM,
            question: 'What is the feed heater doing during a rain event that is well above freezing?',
            options: [
              'Keeping water from sheeting on the feed - dry surfaces attenuate less than wet ones',
              'Keeping the LNB warm through the cold rain - noise temperature climbs as the LNB cools',
              'Preventing ice on the feed - the radome cools below air temperature and 12°C rain can freeze',
              'Raising RF gain through the feed - a warm feed horn passes more of the incoming signal',
            ],
            correctIndex: 0,
            explanation:
              "Standing water on the feed is itself an attenuator. The heater keeps surfaces above the dew point so droplets evaporate instead of beading and pooling. It's the same hardware as the anti-icing case in a winter storm, with a different mechanism, and rain at 12°C isn't going to freeze.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BASELINE LINK MARGIN
    // ============================================================
    {
      id: 'open-rx-analysis-baseline',
      nice: ['S0421'],
      title: 'Open RX Analysis',
      description: 'Switch to the RX Analysis tab to monitor the link as the front moves in.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['understand-heater-vs-rain'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'baseline-beacon-and-lock',
      nice: ['T0153', 'K0773', 'K1032'],
      title: 'Baseline Beacon and Lock',
      description:
        "Confirm the TIDEMARK-1 beacon is healthy and RX modem 1 is locked with margin before the rain hits, and note its Raw C/N too. You'll read the 7 dB action threshold on the same readout.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-rx-analysis-baseline'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Detected',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -95 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          // The brief's Nominal band: within 1 dB of the ~13 dB baseline
          // (nats-r4-s14-F1; the old 10 dB floor had no source)
          type: 'receiver-snr-threshold',
          description: 'RX Modem 1 Raw C/N ≥ 12 dB (nominal, within 1 dB of the ~13 dB baseline)',
          params: { modemNumber: 1, minCNRatio: 12, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          // Write the baseline down (Phase 27 Q3): the ledger reads 13.1 dB
          // raw C/N on VT-01's own TIDEMARK-1 carrier before the rain
          // (nats-scenario14.json), about 8.4 dB over the ~4.7 dB C/N at
          // which QPSK 3/4 acquires lock (Phase 29 D9)
          type: 'status-check',
          description: 'Baseline Raw C/N Read',
          params: {
            character: Character.SYSTEM,
            question: 'What Raw C/N does RX modem 1 show on the TIDEMARK-1 carrier before the rain?',
            options: ['About 13 dB', 'About 7 dB', 'About 4 dB', 'About 25 dB'],
            correctIndex: 0,
            explanation:
              'About 13 dB. The action rule in the brief hangs off that baseline: the threshold is RX modem 1 Raw C/N of 7 dB, which is about 6 dB under it and still about 2.3 dB above where QPSK 3/4 acquires lock. The modem shows Required Es/N0 5.0 dB, and Es/N0 runs about 0.8 dB above Raw C/N. So the modem acquires lock from about 4.7 dB C/N (Required 5.0 plus a 0.5 dB acquisition margin, less the 0.8 dB Es/N0 offset) and holds it down to about 3.7 dB. Compare against the baseline when the cell is overhead.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'baseline-margin-quiz',
      nice: ['K0740', 'K0721'],
      title: 'Link Margin Baseline',
      description: 'Pin down what "link margin" means for the call you may have to make.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['baseline-beacon-and-lock'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Margin Definition',
          params: {
            character: Character.SYSTEM,
            question: 'Why does noting the baseline C/N matter for this scenario specifically?',
            options: [
              'It shows how much fade the link can absorb before demodulation fails',
              'It tells the customer how much uplink power we spend to hold their carrier',
              'It sets the spectrum analyzer Max Amp / Min Amp before the rain shifts the noise floor',
              'The modem firmware requires it before it will hold lock through a fade',
            ],
            correctIndex: 0,
            explanation:
              "Margin is the baseline C/N minus the demodulation threshold. QPSK 3/4 acquires lock at about 4.7 dB C/N (Required 5.0 plus a 0.5 dB acquisition margin, less the 0.8 dB Es/N0 offset). With Raw C/N near 13 dB, that's about 8 dB of headroom, 6 dB of it above the 7 dB action threshold. A heavy cell at C-band costs only about 1 dB of C/N, mostly sky-noise rise, so we're comfortable. Without baseline data, every dip looks scary.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // ACTIVE MONITORING - RAIN ARRIVES
    // ============================================================
    {
      id: 'monitor-during-fade',
      nice: ['T0153', 'S0675'],
      title: 'Monitor Through the Fade',
      description:
        "Stay on RX Analysis as the front arrives, within seconds of this step opening. Watch RX modem 1's Raw C/N until the RAIN FADE alarm is up, then for 20 s more with it up. At C-band the dip is about 1 dB, not much more than the readout's normal wander. The modem loses that 1 dB because our own uplink is rained on too, while the RAIN FADE alarm detail reads the downlink loss alone, about 0.7 dB at the peak. The alarm shows once the fade passes 0.5 dB, about 2 minutes into the cell, and the ACU Environmental card shows Precipitation ACTIVE while the cell is overhead.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['baseline-margin-quiz'],
      timeLimitSeconds: 6 * 60,
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
          // The cell is overhead: the live RAIN FADE alarm, held 20 s on RX
          // Analysis, gates this watch and the fade-phase steps behind it
          // (Phase 32 D20, nats-r7-s14-F1)
          type: 'custom',
          description: 'RAIN FADE Alarm Up (cell overhead)',
          params: {
            evaluator: vt01RainFadeUp,
          },
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Lock Maintained',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'RX Modem 1 Raw C/N ≥ 7 dB (Action Threshold)',
          params: { modemNumber: 1, minCNRatio: 7, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on TIDEMARK-1',
          params: { noradId: 61525, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'agc-behavior-quiz',
      nice: ['K0773', 'T0153'],
      title: 'AGC Behavior in the Fade',
      description: 'Confirm what the AGC is doing as the rain attenuates the input signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['monitor-during-fade'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'AGC Compensation',
          params: {
            character: Character.SYSTEM,
            question: 'The rain cell is over the dish, C/N has dipped by about 1 dB and the post-AGC output level is steady. What does that tell you?',
            options: [
              'The AGC is compensating, and the gain stage still has headroom',
              'The fade is over, so the input level will climb back within a minute',
              'The LNB has raised its own gain, so the front end compensates first',
              'The receiver has switched to a backup carrier instead of TIDEMARK-1',
            ],
            correctIndex: 0,
            explanation:
              "At C-band even a heavy cell costs only about 1 dB, and noise accounts for most of it: the wet path radiates into the beam and lifts the floor while the carrier is barely attenuated. The same cell would take several dB off a Ku link. The AGC absorbs what's left without anyone noticing. What you watch isn't the output level, because that's what the AGC stabilizes, but how much gain the AGC is using. When that approaches its maximum, you're out of cushion.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'agc-headroom-quiz',
      nice: ['K0689', 'K0721'],
      title: 'AGC Headroom Reading',
      description: 'Establish how AGC headroom maps to operational risk.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['agc-behavior-quiz'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'AGC Headroom Interpretation',
          params: {
            character: Character.SYSTEM,
            question: 'Through the cell the AGC gain moves by under 1 dB and stays far below its maximum. What does that say about the decision to hold?',
            options: [
              'Plenty of headroom is left, so holding is justified',
              'The headroom is already spent, so any non-zero AGC value means hand over now',
              'Headroom is irrelevant, since AGC has no bearing on the handover call',
              'Headroom is shrinking, so reduce HPA backoff now to relieve the AGC',
            ],
            correctIndex: 0,
            explanation:
              "The rain moves the total passband power by under 1 dB, so the AGC gain follows by under 1 dB (0.5-1.0 dB measured). That's a small slice of its range, so the cushion is barely touched. The handover trigger isn't the AGC being active. It's the AGC near its maximum with continued fade, or modem unlock, and we're nowhere near either.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // OPTIMIZATION - HPA BACKOFF
    // ============================================================
    {
      id: 'open-tx-chain',
      nice: ['S0421'],
      title: 'Open TX Chain',
      description: 'Switch to the TX Chain panel. The HPA is a knob you could turn - decide whether you should.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['agc-headroom-quiz'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'hpa-backoff-decision-quiz',
      nice: ['S0675', 'K0721'],
      title: 'HPA Backoff Decision',
      description: "Reducing HPA backoff would add a couple of dB of uplink power. Decide whether that's the right move right now.",
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Backoff Cost',
          params: {
            character: Character.SYSTEM,
            question: 'The downlink C/N is holding above threshold with AGC headroom to spare. Should you reduce HPA backoff to push more uplink power?',
            options: [
              "No. The link is healthy, and extra IMD risk buys margin we don't need",
              'Yes. The fade is active, and running the HPA hot in weather is standard practice',
              'Yes. The customer asked us to hold, and holding requires maximum uplink power',
              "No. The HPA is carrying traffic, so backoff can't be adjusted while transmitting",
            ],
            correctIndex: 0,
            explanation:
              'Optimization isn\'t "turn every dial to max." If the link has margin you don\'t need, the responsible move is to leave it unspent. Reduced backoff means higher IMD on neighbors and more amplifier stress, for no operational benefit here. Keep the configuration nominal.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-hpa-still-nominal',
      nice: ['T0431', 'S0675'],
      title: 'Verify HPA Still Nominal',
      description: 'On TX Chain, read the HPA panel: Output, Back-off, IM3 and Overdrive. Back-off stays where it is.',
      groundStation: 'VT-01',
      intent: 'confirm',
      prerequisiteObjectiveIds: ['hpa-backoff-decision-quiz'],
      timeLimitSeconds: 1 * 60,
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
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          // Keep it so: the HPA has carried the customer since shift start (Q2)
          requiresChange: false,
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Operating Limits',
          mustMaintain: true,
        },
        {
          // Read quiz in place of the dwell (Phase 27 Q3). Ledger
          // (nats-scenario14.json): 16 dBm drive, 50.0 dBm out, back-off 10
          // dB under the 60 dBm P1dB, IM3 -43 dBc
          type: 'status-check',
          description: 'HPA Panel Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does the HPA panel read with the cell overhead?',
            options: [
              'Output 50 dBm (100 W), back-off 10 dB, IM3 about -43 dBc, Overdrive Normal',
              'Output 53 dBm (200 W), back-off 7 dB, IM3 about -37 dBc - the ALC pushed power up for the fade',
              'Output 50 dBm, back-off 10 dB, Overdrive OVERDRIVE - the rain is reflecting power back into the HPA',
              'Output 40 dBm (10 W), back-off 20 dB - the HPA has de-rated itself for the weather',
            ],
            correctIndex: 0,
            explanation:
              "Nothing on the uplink moved: 50 dBm out, 10 dB under P1dB, IM3 about -43 dBc. An HPA doesn't react to downlink weather on its own, and the brief says to leave it alone.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // DECISION POINT - HOLD OR HAND OFF
    // ============================================================
    {
      id: 'handover-threshold-quiz',
      nice: ['K0721', 'S0593'],
      title: 'Handover Threshold',
      description: 'Pin down the conditions under which the call flips from "hold" to "hand off."',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-hpa-still-nominal'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'When Handover IS Justified',
          params: {
            character: Character.SYSTEM,
            question: 'The customer prefers no handover, but they don\'t get the last word on RF reality. Which condition flips the call to "hand off now"?',
            options: [
              'Raw C/N under 7 dB and falling, AGC at max in a continued fade, or lost lock',
              'Raw C/N a dB below baseline, AGC gain leaving its floor, or Precipitation ACTIVE',
              'Rain reaching the dish, the first dB of input fade, or the beacon C/N dipping',
              'ME-02 reporting available, Dana asking for a status, or James calling back',
            ],
            correctIndex: 0,
            explanation:
              "The customer can ask us to favor a hold, but they can't ask us to keep serving on a dead link. The trigger is operational, not contractual: RX modem 1 Raw C/N under 7 dB and not recovering, AGC at max and still fading, or an actual loss of lock.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'decision-hold',
      nice: ['K0721', 'S0593'],
      title: 'Make the Call',
      description: 'Given current link state, log your operational call for the next ten minutes.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['handover-threshold-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Hold or Hand Off',
          params: {
            character: Character.DANA_TORRES,
            question: 'Your call - what are we doing for the rest of this front?',
            options: [
              'Hold VT-01. AGC has headroom, modem locked, customer preference honored. Re-evaluate if state changes.',
              'Hand off to ME-02. AGC is active, fade still building, customer told we tried. Re-acquire on VT-01 after.',
              'Stow VT-01. Rain is heaviest at the peak, feed protected, customer notified. Re-acquire when the front clears.',
              'Hold VT-01. Reduce HPA backoff 2 dB, push uplink power up, customer preference honored. Restore after the front.',
            ],
            correctIndex: 0,
            explanation:
              "Holding is right while the AGC has headroom, the modem is locked and the customer prefers it. Keep the trigger conditions in mind so you know when to flip, because that's what makes a hold a decision and not inertia.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // SUSTAINED MONITORING THROUGH PEAK
    // ============================================================
    {
      id: 'sustained-monitor',
      nice: ['T0153', 'S0675'],
      title: 'Hold Through the Cell',
      description:
        'Keep VT-01 on TIDEMARK-1 until the rain cell has passed, about 20 minutes from its arrival. Hold the lock, keep RX modem 1 Raw C/N above the 7 dB action threshold, keep the antenna on TIDEMARK-1 and leave the heater on. You can wait it out, or use the skip control in the command bar once the hold rows are green. It jumps to the end of the cell, and the mission clock is held while you wait, so both score the same.',
      groundStation: 'VT-01',
      // A watch: every row but the weather is meant to stay as it is
      intent: 'confirm',
      prerequisiteObjectiveIds: ['decision-hold'],
      // Long enough to wait the whole cell out in real time (Phase 27 Q4)
      timeLimitSeconds: 22 * 60,
      timerStartTrigger: 'on-activate',
      timeSkip: { minutes: 20, label: 'rain cell', availableAfterConditions: true },
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Lock Maintained',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'RX Modem 1 Raw C/N Holds ≥ 7 dB',
          params: { modemNumber: 1, minCNRatio: 7 },
          mustMaintain: true,
          maintainDuration: 30,
        },
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on TIDEMARK-1',
          params: { noradId: 61525 },
          mustMaintain: true,
        },
        {
          type: 'feed-heater-enabled',
          description: 'Feed Heater Still Enabled',
          mustMaintain: true,
        },
        {
          type: 'weather-event-ended',
          description: 'Rain Cell Passed',
          params: { weatherEventId: 'vermont-rain-front' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },

    // ============================================================
    // POST-STORM AND DOCUMENTATION
    // ============================================================
    {
      id: 'post-storm-baseline-quiz',
      nice: ['T0153', 'K0741'],
      title: 'Post-Storm Recovery',
      description: 'Confirm what you expect as the front clears.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['sustained-monitor'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Post-Storm Expectation',
          params: {
            character: Character.SYSTEM,
            question: 'The rain is clearing. What do you expect to see in the next few minutes?',
            options: [
              'C/N recovers toward baseline; AGC backs its gain down; modem lock unchanged',
              'C/N stays depressed; AGC holds its gain; the wet feed keeps the link degraded',
              'C/N recovers toward baseline; AGC stays at max until reset; modem lock unchanged',
              'C/N recovers toward baseline; AGC backs its gain down; modem must be re-locked by hand',
            ],
            correctIndex: 0,
            explanation:
              "Rain fade is transient. The AGC tracks the recovery downward without intervention, and the demodulator has had lock the whole time, so there's nothing to do but watch it normalize.",
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'document-handover-avoided',
      nice: ['K0645', 'T0153', 'S0593'],
      title: 'Log the Hold',
      description: 'Select the shift log entry that records the hold, the trigger thresholds you watched, and the note to SeaLink that service held.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['post-storm-baseline-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly logs this event for the next shift?',
            options: [
              'Heavy rain cell over VT-01, about 1 dB of C/N lost. Held TM-1 per SeaLink SLA; watched 7 dB Raw C/N, AGC at max, modem unlock, none fired. SeaLink told.',
              'Heavy rain cell over VT-01, about 1 dB of C/N lost. Handed TM-1 to ME-02 at fade onset; AGC far from max, customer notified, service restored on VT-01 afterward.',
              'Heavy rain cell over VT-01, about 1 dB of C/N lost. Lost lock on TM-1 near peak; AGC at max, modem re-locked after the cell cleared, customer notified.',
              'Light rain over VT-01, no measurable fade. Held TM-1 as routine; AGC at floor, modem lock maintained, no customer contact needed.',
            ],
            correctIndex: 0,
            explanation:
              'Log what happened, what you chose and why, the trigger thresholds you watched and that none fired, and that SeaLink heard it from us. The next operator picks up the same tripwires, and the account team can see the customer was told.',
            pointPenalty: 5,
          },
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
        <em>[Text message from Dana at 13:18]</em>
      </p>
      <p>
        "There's a rain cell a couple of minutes out. It's a heavy one, twenty minutes through, but at C-band that's still only about a dB. James Okafor called, and their SLA likes margin loss better than handover events, so he wants us to hold if we can. ME-02 is busy on TIDEMARK-2. The brief's on your terminal."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/14/intro.mp3'),
    },
    // Each line introduces its step: James calls as the constraint step opens
    // (on completion it read as a reply to the quiz), Dana's check-in opens
    // the threshold question, and "log it" opens the log step, not after it
    objectivesOnStart: {
      'acknowledge-customer-constraint': {
        text: `
        <p>
          Hey - it's James Okafor, Atlantic Shipping. Saw your weather notice on the SeaLink portal. Look, every handover event lights up the contract dashboard for our board, and we'd rather take a little ride through a few dB than have that show up.
        </p>
        <p>
          Hold us on Vermont if you can. If you can't, you can't - we'll wear it. But your call, not a marketing call.
        </p>
        `,
        character: Character.JAMES_OKAFOR,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/14/obj-acknowledge-customer-constraint.mp3'),
      },
      'handover-threshold-quiz': {
        text: `
        <p>
          The AGC's behaving, the modem's locked, and James wants us to hold, so I don't see a reason to hand off. Before we commit, tell me which readings would make you flip the call.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/14/obj-handover-threshold-quiz.mp3'),
      },
      'document-handover-avoided': {
        text: `
        <p>
          Clean ride through. Drop James a line on the portal that we held, then log it with the trigger thresholds you were watching - if it'd gone the other way, the next operator should know what we were looking at. Good shift.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/14/obj-document-handover-avoided.mp3'),
      },
    },
  },
};
