import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import { vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 17: "Solar Event"
 *
 * Phase: Crisis Operations (Phase 3, Scenario 1 of 8)
 * Time Pressure: The transit window is fixed - the clock is astronomy's, not ours
 * Calculation Required: NO
 * New Mechanic: sun-transit weather event (engine: skyNoiseDegradation on the
 *   RX path, rise-peak-fall profile, RX-only)
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0751: Knowledge of system threats
 *   - T1020: Determine operational and safety impacts
 *   - K0689: Knowledge of network infrastructure principles and practices
 *
 * Supporting Codes:
 *   - T0153: Monitor network capacity and performance
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0593: Skill in handling incidents
 *
 * Premise: The semiannual sun transit window on TIDEMARK-1 from VT-01. The Sun
 * crosses the antenna boresight for ~5 minutes, raising the system noise
 * temperature until the demodulator briefly loses the carrier. The event is
 * predicted, contractually excused (with advance notice), and unfixable.
 *
 * The first Phase 3 lesson inverts every prior scenario: the right answer is to
 * accept degradation. Notify before, hold configuration during, verify and
 * document after. The only failure modes are panic actions and a late
 * notification.
 *
 * Tone: Crisis-phase operational. Dana briefing + sign-off, Marcus one
 * spacecraft-side confirmation. All quizzes SYSTEM. 4 clips.
 *
 * Sim notes:
 *   - weatherEvents 'sun-transit': starts T+300s, 300s duration, 12 dB peak.
 *     Profile sin^2 -> degradation >6 dB roughly T+375..525s, clear by ~T+585s.
 *   - 12 dB peak takes beacon and carrier C/N below threshold: demod genuinely
 *     unlocks near peak and self-recovers. Uplink is unaffected by design.
 *   - Custom-evaluator conditions read skyNoiseDegradation_dB via the
 *     window.signalRange handle (no imports - avoids manager import cycles).
 */

/** Current sky-noise degradation (dB) on VT-01's antenna, 0 if unavailable. */
const vt01SkyNoise = (): number => {
  const w = window as unknown as {
    signalRange?: {
      simulationManager?: {
        groundStations?: Array<{
          state?: { id?: string };
          antennas?: Array<{ state?: { skyNoiseDegradation_dB?: number } }>;
        }>;
      };
    };
  };
  const gs = w.signalRange?.simulationManager?.groundStations?.find(g => g.state?.id === 'VT-01');
  return gs?.antennas?.[0]?.state?.skyNoiseDegradation_dB ?? 0;
};

export const scenario17Data: ScenarioData = {
  id: 'nats-scenario17',
  prerequisiteScenarioIds: ['nats-scenario16'],
  url: 'nats/scenarios/nats-scenario17',
  imageUrl: 'nats/17/card.png',
  number: 17,
  title: 'Solar Event',
  subtitle: 'Sun Transit Outage',
  duration: '25-30 min',
  difficulty: 'intermediate',
  missionType: 'Environmental Operations',
  description: `The semiannual sun transit window arrives this morning: for about five minutes the Sun passes directly behind TIDEMARK-1 as seen from Vermont, and the antenna stares into a 20,000-kelvin noise source at full gain. The noise floor climbs, the margin collapses, and near the peak the demodulator will lose the carrier.<br><br>Nothing is broken. Nothing can be fixed. The event was predicted to the minute by the ephemeris service, the SLA excuses it with advance notice, and the geometry resolves itself.<br><br>Your job is the discipline: notify the customer before the window, hold the configuration through it, verify the recovery, and document what actually happened. The only way to fail a sun transit is to fight one.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'RX/TX Modems',
    'Sun Transit Prediction Sheet',
  ],
  timeLimitSeconds: 30 * 60,
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
      },
    ],
    satellites: [tidemark1Satellite, tidemark2Satellite, ses10Satellite],
    weatherEvents: [
      {
        id: 'tm1-sun-transit',
        groundStationId: 'VT-01',
        type: 'sun-transit',
        severity: 'severe',
        startTime: 300, // Window opens 5 minutes into the shift
        duration: 300, // ~5-minute transit
        linkMarginDegradation: 12, // Peak dB - enough to break demod lock near center
      },
    ],
    missionBriefUrl: 'https://docs.signalrange.space/campaign-1/scenario-17?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review Transit Prediction',
      description: 'Open the shift brief and the sun transit prediction sheet.',
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
          description: 'Acknowledge the Window',
          params: {
            character: Character.SYSTEM,
            question: 'Transit window opens five minutes into the shift. Ready?',
            options: ['Acknowledged - prediction sheet reviewed, pre-event checklist starting now.'],
            correctIndex: 0,
            explanation: 'The window does not move for anyone. Everything before it is preparation; everything during it is discipline.',
            pointPenalty: 0,
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
    // PHASE 1: PRE-WINDOW BASELINE AND UNDERSTANDING
    // ============================================================
    {
      id: 'baseline-dashboard',
      nice: ['T0153', 'K0741'],
      title: 'Pre-Transit Baseline',
      description: 'Confirm a clean board before the window - any alarm visible now is NOT the transit.',
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
          description: 'Baseline State',
          params: {
            character: Character.SYSTEM,
            question: 'Why does the pre-transit baseline matter more than usual today?',
            options: [
              'Anything abnormal AFTER the window starts will be attributed to the Sun - a fault hiding under the transit would survive unnoticed unless the board was provably clean before',
              'The baseline calibrates the prediction sheet',
              'The SLA requires a baseline screenshot',
              'It does not - the transit makes the baseline meaningless',
            ],
            correctIndex: 0,
            explanation: 'Predictable events make perfect camouflage. Clean board before the window means everything during it is the Sun - and anything still wrong after it is not.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'transit-geometry-quiz',
      nice: ['K1032', 'K0751'],
      title: 'Transit Geometry',
      description: 'Confirm what physically happens during a sun transit.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['baseline-dashboard'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Physics',
          params: {
            character: Character.SYSTEM,
            question: 'What actually degrades the link during a sun transit?',
            options: [
              'The Sun (a ~20,000 K noise source at C-band) passes through the antenna main beam behind the satellite - system noise temperature soars and C/N collapses, with the signal itself unchanged',
              'Solar radiation pressure pushes the satellite off station',
              'The Sun physically blocks the radio path to the satellite',
              'Solar heating detunes the LNB local oscillator',
            ],
            correctIndex: 0,
            explanation: 'The carrier power never changes - the noise under it rises. That is why nothing on the ground or the spacecraft can fix it: the antenna is pointed at the satellite, and the Sun is standing directly behind it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'transit-predictability-quiz',
      nice: ['K0751', 'K0689'],
      title: 'Why It Is Predictable',
      description: 'Confirm the seasonal pattern that makes transits plannable.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['transit-geometry-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Season',
          params: {
            character: Character.SYSTEM,
            question: 'When do sun transits occur for a GEO satellite, and for how long?',
            options: [
              'Twice a year near the equinoxes - a few minutes a day for several consecutive days, at a time computable years in advance from the station/satellite geometry',
              'Randomly, whenever solar activity peaks',
              'Once a year at the summer solstice, for several hours',
              'Only during solar eclipses',
            ],
            correctIndex: 0,
            explanation: 'Pure geometry: the Sun crosses the geostationary arc as seen from your latitude around each equinox. Every teleport publishes its transit calendar - which is why a late customer notification is an operator failure, never a surprise.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'baseline-rx-check',
      nice: ['T0153', 'K0773'],
      title: 'Baseline RX Snapshot',
      description: 'Document the healthy link before the window: beacon present, receiver locked, C/N at baseline.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['transit-predictability-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          description: 'RX Analysis Open',
          params: { tab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'TIDEMARK-1 Beacon Present',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
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
      id: 'why-not-handover-quiz',
      nice: ['T1020', 'K0721'],
      title: 'The Handover Question',
      description: 'Decide - and be able to defend - why the traffic stays on VT-01 through the window.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['baseline-rx-check'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Hold or Move',
          params: {
            character: Character.SYSTEM,
            question: 'A handover to ME-02 would dodge the transit. Why is riding through still the right call?',
            options: [
              'The outage is brief, predicted, and SLA-excluded with notice - a handover trades that for two transfer events, and ME-02 inherits its own transit on its own schedule anyway',
              'ME-02 cannot receive TIDEMARK-1',
              'Handover during any weather event is prohibited',
              'It is not - handover is always the safer choice',
            ],
            correctIndex: 0,
            explanation: 'Same lesson as the S14 rain fade, sharpened: escape has a price, and here the thing escaped costs less than the escape. Every station on the arc takes its transits; the constellation-level answer is notification discipline, not musical chairs.',
            pointPenalty: 5,
            preserveOptionOrder: true,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'notify-customer-quiz',
      nice: ['T1020', 'S0593'],
      title: 'Pre-Event Notification',
      description: 'Send the customer notice BEFORE the window opens - the notification is the SLA action.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['why-not-handover-quiz'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Notice',
          params: {
            character: Character.SYSTEM,
            question: 'Which notification goes to SeaLink ops right now?',
            options: [
              'Predicted solar transit on TIDEMARK-1 from Vermont, window and peak times attached; expect degraded margin and a possible 1-3 minute carrier interruption near peak; service recovers without intervention; this message constitutes SLA advance notice.',
              'TIDEMARK-1 will have an outage today. Will advise.',
              'No notification - the SLA excludes solar events automatically.',
              'Notification after the event, with the measured impact attached.',
            ],
            correctIndex: 0,
            explanation: 'Specific, timed, actionable, and BEFORE the event. The SLA exclusion is conditional on advance notice - a notification timestamped after window-open is contractually worthless.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 2: THE WINDOW
    // ============================================================
    {
      id: 'observe-onset',
      nice: ['T0153', 'S0648'],
      title: 'Confirm Predicted Onset',
      description: 'The window is opening. Confirm the sky-noise rise matches the prediction.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['notify-customer-quiz'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'custom',
          description: 'Sky Noise Rising (transit underway)',
          params: {
            evaluator: () => vt01SkyNoise() > 2,
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Onset Read',
          params: {
            character: Character.SYSTEM,
            question: 'The elevated sky-noise alarm is climbing on schedule. What does "on schedule" buy you?',
            options: [
              'Confidence this is the predicted transit and not a coincidental fault - the alarm tracking the prediction sheet IS the diagnosis',
              'Nothing - every alarm requires the full fault-isolation procedure',
              'Permission to mute the transmit chain',
              'A reason to repoint and check the geometry',
            ],
            correctIndex: 0,
            explanation: 'The prediction is the baseline. Onset within a minute of the sheet, profile shaped like the sheet - that is a healthy station experiencing astronomy. Deviation from the sheet is what would demand investigation.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'ride-through-peak',
      nice: ['S0593', 'T1020', 'K0689'],
      title: 'Hold Through the Peak',
      description: 'Sky noise is approaching peak and the demod will drop. Hold the configuration: uplink stays exactly as it is, no RX changes, no panic.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['observe-onset'],
      timeLimitSeconds: 5 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'custom',
          description: 'Transit Peak Reached (>6 dB sky noise)',
          params: {
            evaluator: () => vt01SkyNoise() > 6,
          },
          mustMaintain: false,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Uplink Untouched - Modem Transmitting',
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Stays Unmuted',
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Stays Enabled',
          mustMaintain: true,
        },
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Held (no chasing)',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'peak-behavior-quiz',
      nice: ['K0689', 'K1032'],
      title: 'What the Peak Looks Like',
      description: 'Confirm your read of the link at maximum degradation.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['ride-through-peak'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Peak Read',
          params: {
            character: Character.SYSTEM,
            question: 'Near peak the receiver loses carrier lock. What is true about the link right now?',
            options: [
              'The downlink is buried in solar noise at OUR antenna only - the satellite still hears our uplink perfectly, and the demod will relock on its own as the Sun moves off boresight',
              'The link is down in both directions until the transit ends',
              'The satellite transponder is saturated by solar energy',
              'The carrier is gone and must be re-acquired manually after the window',
            ],
            correctIndex: 0,
            explanation: 'Sun transit is a receive-side event at one station. The uplink never flinched - which is exactly why the transmit chain stays untouched. Anything you "fix" now becomes a real problem you created during a fake one.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // PHASE 3: RECOVERY AND DOCUMENTATION
    // ============================================================
    {
      id: 'verify-recovery',
      nice: ['T0153', 'T0431'],
      title: 'Verify Self-Recovery',
      description: 'The Sun is moving off boresight. Confirm the link recovers to baseline with zero operator action.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['peak-behavior-quiz'],
      timeLimitSeconds: 6 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'custom',
          description: 'Sky Noise Cleared (<1 dB)',
          params: {
            evaluator: () => vt01SkyNoise() < 1,
          },
          mustMaintain: false,
        },
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Re-Locked',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Back at Baseline (≥ 10 dB)',
          params: { minCNRatio: 10 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'post-event-sweep',
      nice: ['T0153', 'K0741'],
      title: 'Post-Event Alarm Sweep',
      description: 'Confirm the board is clean again - anything still alarming is NOT the Sun.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-recovery'],
      timeLimitSeconds: 2 * 60,
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
          description: 'Clean Exit',
          params: {
            character: Character.SYSTEM,
            question: 'Post-window board check: what are you specifically looking for?',
            options: [
              'Any alarm that survived the window - the transit excuses exactly five minutes of sky noise and nothing else',
              'Confirmation the sky-noise alarm is latched for the report',
              'Nothing - recovery was verified at the receiver already',
              'Elevated BUC temperature from the solar exposure',
            ],
            correctIndex: 0,
            explanation: 'The window is a clean five-minute box. Healthy before, healthy after, astronomy in between. An alarm that outlives the box was never the Sun - and now is when you catch it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'marcus-confirm',
      nice: ['T1020', 'K1032'],
      title: 'Spacecraft-Side Confirmation',
      description: 'Cross-check with Halifax that the spacecraft view matches the ground view.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['post-event-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Two Views, One Event',
          params: {
            character: Character.SYSTEM,
            question: 'What should Halifax have seen during our transit window?',
            options: [
              'Nothing abnormal on the spacecraft - our uplink steady throughout, vehicle telemetry nominal; the event existed only at our antenna',
              'A matching outage on the spacecraft bus',
              'Loss of our uplink during the peak minutes',
              'Elevated transponder temperature',
            ],
            correctIndex: 0,
            explanation: 'If Halifax saw anything, it was not (only) a transit. Their nominal telemetry is the final cross-check that closes the event as pure geometry.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'document-impact',
      nice: ['T1020', 'S0593'],
      title: 'Impact Documentation',
      description: 'Record what actually happened versus what was predicted.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['marcus-confirm'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'The Record',
          params: {
            character: Character.SYSTEM,
            question: 'Which set of facts belongs in the impact record?',
            options: [
              'Predicted vs actual window times, peak degradation observed, carrier lock-loss duration, notification timestamp (pre-window), and customer impact statement',
              'Just "sun transit occurred as predicted"',
              'The full spectrum analyzer trace history for the day',
              'Only the lock-loss duration - the rest was predicted anyway',
            ],
            correctIndex: 0,
            explanation: 'Predicted-vs-actual is what makes the next prediction trustworthy, the notification timestamp is what makes the SLA exclusion stick, and the impact statement is what the account team quotes. Three audiences, one log entry.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-shift-summary',
      nice: ['K0645', 'T0153'],
      title: 'Log the Event',
      description: 'Close out the transit in the operations log.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['document-impact'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Shift Log Entry',
          params: {
            character: Character.SYSTEM,
            question: 'Which entry correctly records this event?',
            options: [
              'Predicted solar transit TM-1/VT-01 executed per SOP-SX-001. Customer notified pre-window. Peak ~12 dB sky noise, brief demod loss near peak, self-recovered to baseline. No operator intervention, no residual alarms. Day 2 of 4 in this transit series - next window tomorrow, ~4 minutes earlier.',
              'TM-1 outage this morning. Resolved.',
              'Sun transit - no entry needed, event was excused.',
              'Emergency response to solar interference completed successfully.',
            ],
            correctIndex: 0,
            explanation: 'Including tomorrow\'s window in today\'s entry is the mark of someone who understands the series. The next operator walks in pre-briefed.',
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
        <em>[Text message from Dana at 11:38]</em>
      </p>
      <p>
        "Sun transit window on TM-1 this morning - prediction sheet's attached. Window opens at 1149, peak around 1151:30, clear by 1154. You know the drill from the read-ahead: this one you don't fight. Notify, ride it through, document. The only way to fail a sun transit is to panic during one."
      </p>
      `,
      character: Character.DANA_TORRES,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats/17/intro.mp3'),
    },
    objectives: {
      'notify-customer-quiz': {
        text: `
        <p>
          Notice is out and timestamped - good. Window opens in a couple of minutes. Eyes on the board, hands off the equipment. I'll be watching the same alarm you are.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/17/obj-notify-customer-quiz.mp3'),
      },
      'verify-recovery': {
        text: `
        <p>
          Marcus in Halifax. Vehicle telemetry was nominal straight through your window - your uplink never wavered on our side, not even at peak. Whatever the Sun did to your noise floor, the spacecraft never knew about it. Clean transit, eh.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/17/obj-verify-recovery.mp3'),
      },
      'log-shift-summary': {
        text: `
        <p>
          Textbook. You notified before the customer could ask, held still while the link looked terrible, and verified instead of assuming. Phase three starts with the hardest skill there is - knowing when the right move is no move.
        </p>
        <p>
          Same window tomorrow, four minutes earlier. Log's already got it.
        </p>
        `,
        character: Character.DANA_TORRES,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/17/obj-log-shift-summary.mp3'),
      },
    },
  },
};
