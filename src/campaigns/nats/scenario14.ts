import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { Receiver } from '@app/equipment/receiver/receiver';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, Hertz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { vermontGroundStation } from './ground-stations';
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
 * Premise: Light to moderate rain is moving over VT-01. The customer
 * (James Okafor, SeaLink fleet captain) has called ahead - their SLA
 * terms allow degradation but penalize handover events. He wants the
 * operator to hold VT-01 through the weather if at all possible.
 *
 * The operator's job: enable feed heater, watch AGC headroom, monitor
 * link margin, and make the call - hold or hand off. The right answer
 * for a moderate rain front is to hold; the wrong answer is to escape
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
 */

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
  description: `Rain front moving over Vermont. Light to moderate, maybe twenty minutes through. The link will fade but it shouldn't black out.<br><br>The customer - James Okafor at SeaLink - has called ahead. Their SLA terms penalize handover events more than they penalize a few dB of margin loss, so he's asked us to hold VT-01 through the weather if we can. ME-02 is busy on TIDEMARK-2 and would have to drop its own customers to take TIDEMARK-1.<br><br>Your job: enable the feed heater, watch AGC headroom, track the beacon C/N, and make the call. Hold or hand off - the right answer is the one the link supports.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (Feed Heater, AGC)',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'ME-02: Operational (TIDEMARK-2)',
  ],
  timeLimitSeconds: 35 * 60, // 35 minutes
  settings: {
    isSync: true,
    groundStations: [
      // VT-01: tracking TIDEMARK-1, healthy at baseline. Rain begins at +5min.
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
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            polarization: -25 as Degrees,
            trackingMode: 'program-track',
            isBeaconLocked: true,
            targetSatelliteId: 61526, // TIDEMARK-2
            targetAzimuth: 219.7 as Degrees,
            targetElevation: 26.3 as Degrees,
            targetPolarization: -25 as Degrees,
            slewing: false,
            beaconCN: 10.2 as dB,
            beaconFrequencyHz: 1070e6 as Hertz,
            isLocked: true,
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            // ME-02 mirrors VT-01's LNB LO so TM-2 beacon lands at 1070 MHz IF.
            // ME-02 TX is active on its own TIDEMARK-2 traffic; player should
            // not touch it during this scenario.
            buc: { isMuted: true },
            hpa: { isHpaEnabled: false, isHpaSwitchEnabled: false },
          }),
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -91 as dBm,
            centerFrequency: 1070e6 as Hertz,
            span: 2e3 as Hertz,
            rbw: 1e3 as Hertz,
            minAmplitude: -95 as dBm,
            maxAmplitude: -75 as dBm,
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
        transmitters: [],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      tidemark1Satellite,
      tidemark2Satellite,
      ses10Satellite,
    ],
    weatherEvents: [
      {
        id: 'vermont-rain-front',
        groundStationId: 'VT-01',
        type: 'rain',
        severity: 'moderate',
        startTime: 300, // 5 minutes into the scenario
        duration: 1200, // 20 minutes of rain
        // 3 dB of degradation - within AGC compensation range; link should
        // hold with margin. Compare to S3's 8 dB severe blizzard.
        linkMarginDegradation: 3,
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
            explanation: 'Front arrives in about five minutes. Get protective measures in place before it does.',
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
      description: 'James from SeaLink has called ahead about the weather. Acknowledge what he is asking for.',
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
            question: 'James from SeaLink is asking us to hold VT-01 through the rain rather than hand off. What is the operational reason?',
            options: [
              'Their SLA penalizes handover events more heavily than a few dB of margin loss',
              'ME-02 has not been certified to carry SeaLink traffic',
              'The handover process always causes a customer outage',
              'Maine is currently weathered in as well',
            ],
            correctIndex: 0,
            explanation: 'SeaLink runs vessel telemetry that survives short C/N dips but logs a hard event on every uplink change. A handover event costs them more contractually than 3 dB of fade does. The customer is telling us what they value - listen.',
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
              'No active alarms, link healthy - clean baseline to fade from',
              'BUC over-temperature, do not transmit',
              'Antenna tracking error',
              'GPSDO in holdover',
            ],
            correctIndex: 0,
            explanation: 'Clean baseline. Note the C/N now so you know what "nominal" looks like when the rain starts pulling it down.',
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
      description: 'Open the ACU Control panel and enable the feed heater before the front arrives.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['pre-storm-dashboard'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
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
            question: 'The heater is doing what for a rain event that is well above freezing?',
            options: [
              'Keeping water from beading and sheeting on the feed - dry surfaces attenuate less than wet ones',
              'Heating the LNB to compensate for cold rain',
              'Preventing ice (rain at 12°C cannot freeze)',
              'Boosting RF gain through the feed',
            ],
            correctIndex: 0,
            explanation: 'Standing water on the feed is itself an attenuator. The heater keeps surfaces above dew point so droplets evaporate instead of pooling. Same hardware as the anti-icing case in S3, different mechanism.',
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
      description: 'Confirm the TIDEMARK-1 beacon is healthy and the receiver is locked with margin before the rain hits.',
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
          },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'Baseline C/N ≥ 10 dB',
          params: { minCNRatio: 10 },
          mustMaintain: true,
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
              'It defines how much fade the link can absorb before reaching the demodulation threshold',
              'It tells the customer how much power we are using',
              'It calibrates the spectrum analyzer for the storm',
              'It is required by the modem firmware',
            ],
            correctIndex: 0,
            explanation: 'Margin = baseline C/N minus demod threshold. With 10+ dB of headroom and 3 dB of expected fade, we are comfortable. Without baseline data, every dip looks scary.',
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
      description: 'Hold position on the RX Analysis tab as the front passes. Confirm the link stays above threshold.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['baseline-margin-quiz'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Lock Maintained',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Above Storm Threshold (≥ 7 dB)',
          params: { minCNRatio: 7 },
          mustMaintain: true,
          maintainDuration: 20,
        },
        {
          type: 'antenna-locked',
          description: 'Antenna Locked on TIDEMARK-1',
          params: { noradId: 61525 },
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
            question: 'Input level dropped a few dB as the rain hit, but the post-AGC output level is steady. What does that tell you?',
            options: [
              'AGC is compensating - the demodulator still sees a usable signal, and we still have headroom in the gain stage',
              'The fade is over and the rain has stopped',
              'The LNB has automatically raised its gain',
              'The receiver has switched to a backup carrier',
            ],
            correctIndex: 0,
            explanation: 'AGC absorbs the first several dB of fade transparently. The thing to watch is not the output level (that is what AGC stabilizes) but how much gain the AGC is using. When it approaches its max, you are out of cushion.',
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
            question: 'AGC is currently using ~3 dB of its compensation range. What does that say about the decision to hold?',
            options: [
              'Plenty of headroom remaining - link is comfortable, hold is justified',
              'AGC at any non-zero value means we should hand over immediately',
              'AGC compensation has no relationship to handover decisions',
              'We must reduce HPA backoff to relieve the AGC',
            ],
            correctIndex: 0,
            explanation: 'AGC near floor = wide cushion. The handover trigger is not AGC active - it is AGC near max with continued fade, or modem unlock. We are nowhere near either.',
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
      description: 'Reducing HPA backoff would add a couple of dB of uplink power. Decide whether that is the right move right now.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['open-tx-chain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Backoff Tradeoff',
          params: {
            character: Character.SYSTEM,
            question: 'The downlink C/N is holding above threshold with AGC headroom to spare. Should you reduce HPA backoff to push more uplink power?',
            options: [
              'No - the link is healthy; trading IMD risk for unused margin is a bad bargain',
              'Yes - always run the HPA hot during weather',
              'Yes - the customer requires maximum uplink power during a fade',
              'No - because the HPA cannot be adjusted while transmitting',
            ],
            correctIndex: 0,
            explanation: 'Optimization is not "turn every dial to max." If the link has margin you do not need, the responsible move is to not spend it. Reduced backoff means higher IMD on neighbors and more amplifier stress for no operational benefit here. Keep the configuration nominal.',
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
      description: 'Confirm the HPA remains within operating limits with backoff unchanged.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['hpa-backoff-decision-quiz'],
      timeLimitSeconds: 1 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'TX Chain Open',
          params: { tab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Within Operating Limits',
          mustMaintain: true,
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
            question: 'The customer prefers no handover, but the customer does not get the last word on RF reality. Which condition flips the call to "hand off now"?',
            options: [
              'AGC at max with continued fade, or modem dropping lock',
              'Any drop in C/N from baseline',
              'The first raindrop hitting the dish',
              'When ME-02 reports it would be available',
            ],
            correctIndex: 0,
            explanation: 'The customer can ask us to favor "hold." The customer cannot ask us to keep serving on a dead link. The trigger is operational, not contractual: AGC at max and still fading, or actual lock loss.',
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
              'Begin immediate handover to ME-02.',
              'Stow the antenna and accept the outage.',
              'Reduce HPA backoff to push more uplink power.',
            ],
            correctIndex: 0,
            explanation: 'Right call. We are holding. State the trigger conditions to yourself so you know when to flip - that is the discipline of holding, not just inertia.',
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
      title: 'Hold Through the Peak',
      description: 'Maintain the link through the heaviest part of the front. Lock and C/N must stay above threshold.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['decision-hold'],
      timeLimitSeconds: 8 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Lock Maintained',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Holds ≥ 7 dB',
          params: { minCNRatio: 7 },
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
              'C/N stays depressed - the link has been permanently degraded',
              'AGC stays at max because it cannot reset',
              'Modem must be manually re-locked',
            ],
            correctIndex: 0,
            explanation: 'Rain fade is transient. The AGC tracks the recovery downward without intervention, and the demod has had lock the whole time. Nothing to do but watch it normalize.',
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
      description: 'Select the correct entry for the shift log.',
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
              'Moderate rain over VT-01, ~3 dB fade. Held TM-1 service per customer SLA preference; AGC max 3 dB, modem lock maintained throughout, no handover.',
              'Emergency handover to ME-02 due to rain.',
              'Lost lock on TM-1 during storm; service restored after storm cleared.',
              'No weather event; routine shift.',
            ],
            correctIndex: 0,
            explanation: 'Log what happened, what you chose, why, and the evidence the choice was correct. Next operator picks up with the trigger thresholds you were watching.',
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
        "Rain front in about five minutes. Light to moderate, twenty minutes through. James from SeaLink called - their SLA likes margin loss better than handover events, so he wants us to hold if we can. ME-02 is busy on TM-2. Brief's on your terminal."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/14/intro.mp3'),
    },
    objectives: {
      'acknowledge-customer-constraint': {
        text: `
        <p>
          Hey - it's James over at SeaLink. Saw your weather notice on the portal. Look, every handover event lights up the contract dashboard for our board, and we'd rather take a little ride through a few dB than have that show up.
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
          AGC's behaving, modem's locked, customer wants the hold. I see no reason to escape. Make the call and tell me what you'd flip on.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/14/obj-handover-threshold-quiz.mp3'),
      },
      'document-handover-avoided': {
        text: `
        <p>
          Clean ride through. Log it with the trigger thresholds you were watching - if it'd gone the other way, the next operator should know what we were looking at. Good shift.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/14/obj-document-handover-avoided.mp3'),
      },
    },
  },
};
