import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dB, dBm, IfFrequency } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2 } from './satellites';

/**
 * nats-eu Scenario 10 - "Priority Tasking" / Urgent Collect, Low Pass
 *
 * No new mechanics. The lesson is geometry: everything the operator has done
 * on 28 to 40 deg passes now has to be done on a pass that peaks at 18 deg,
 * where the link budget closes with about two decibels to spare and the uplink
 * needs 6 dB more EIRP to reach the bird at long range. Erik's vessel of
 * interest is off the Faroes and this is the only MERIDIAN-SAR-1 window that
 * covers it today: the collect is tasked by command on the pass and the
 * imagery is pulled down on the same pass.
 *
 * Phase 16 rewrite: the whole tasking, not just the pass. Seventeen minutes of
 * pre-pass work (sweep, reference, worksheet, the EIRP plan as steps - BUC
 * gain restored, HPA back-off set, output power proven once the amplifier is
 * up - the uplink modem retuned, the tracker pre-positioned), the pass, then
 * the chain safed in order, the back-off restored, the log and the customer.
 *
 * Scenario-local element sets, TLE epoch 2027-03-18 15:30:00 UTC; the clock
 * starts 15:18:00 (moved 12 min earlier in phase 16 so the pre-pass beats
 * fit). Authored with scripts/author-passes.mjs, observer Galway:
 * - MERIDIAN-SAR-1 (61701): AOS T+16.98 min (15:34:59Z, az 27), max el 17.8 deg
 *   at T+21.52 (15:39:31Z, slant range 1040 km), LOS T+26.05 min (15:44:03Z,
 *   az 159), 9.1 min, southbound. First pass after scenario start.
 * - MERIDIAN-SAR-2 (61702): AOS 16:24:59Z, max el 25.0 deg at 16:29:43Z,
 *   LOS 16:34:26Z. Present in the sky, not worked.
 *
 * Link-budget worksheet (published in the budget objective):
 * - slant range at max elevation 1040 km -> FSPL 174.1 dB at 11686 MHz
 *   (S2 worked 761 km / 171.4 dB: 3.7 dB more path loss here)
 * - EIRP 28 dBm, GW-01 4m Ku gain 51.8 dBi, Tsys 88 K, BW 36 MHz, misc 1.2 dB
 *   (the extra 0.2 dB over S2/S8 is the longer atmospheric path at 18 deg)
 * - correct worksheet -> C/N 8.09 dB (expectedCNRDb 8.1, tolerance 1.0)
 * - threshold 6 dB (QPSK 3/4 demod) + 1 dB required margin
 *
 * Uplink: HPA back-off 10 -> 4 dB is +6 dB EIRP. Below 3 dB the amplifier is
 * overdriven (`isOverdriven`, IMD alarm). The HPA output is drive + gain -
 * back-off, so the BUC has to be delivering its rated drive first: the
 * evening shift left the BUC gain wound down to 18 dB after a maintenance
 * run (staged state), and the EIRP plan starts by restoring 23 dB. At 4 dB
 * back-off the HPA delivers about 30 dBm (1 W) into the feed on this chain
 * (`hpa-output-power-set` 0.5 W is the proof once the amplifier is up); at
 * 10 dB it is a quarter of that.
 *
 * Commanding window is the SAR-1 pass with 20 s guard bands:
 * AOS 1019 s + 20 -> windowStartS 1039; LOS 1563 s - 20 -> windowEndS 1543.
 * Commands ACK on window + Doppler comp + key only, so the EIRP requirement
 * is enforced by the equipment conditions, not by the ACK.
 *
 * SAFETY NOTE (as S3): enabling the HPA with no drive from the BUC trips the
 * HPA_NOISE_AMPLIFICATION invariant and fails the mission. The tasking
 * objective keys the modem before the HPA and the description says so.
 *
 * Staged state (scenario-local clone): BUC gain 18 dB; TX modem 1 on the
 * 1435 MHz SAR-2 telecommand IF from Tuesday's rotation.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T0080: Test and evaluate system performance against requirements
 *   - T1567: Conduct satellite command and control operations
 *   - K0740: Knowledge of system performance indicators
 *
 * Supporting Codes:
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K0064: Knowledge of performance tuning tools and techniques
 *   - T0153: Monitor network capacity and performance
 *   - T0431: Check system hardware availability, functionality, integrity
 *   - S0421: Skill in operating network equipment
 *   - K0773: Knowledge of telecommunications principles and practices
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0645: Knowledge of standard operating procedures
 *   - S0478: Skill in communicating technical results to customers
 *   - T1580: Report mission outcome to the requesting organization
 */

/** SAR-1 element set for this epoch: the 18 deg southbound pass at 15:35. */
const meridianSar1LowPass = createMeridianSar1({
  tle1: '1 61701U 27015A   27077.64583333  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61701  97.2000 226.2500 0010000  90.0000   0.2500 15.60000000123456' as TleLine2,
});

/** SAR-2 element set for this epoch: a 25 deg pass at 16:25, not worked. */
const meridianSar2Parked = createMeridianSar2({
  tle1: '1 61702U 27015A   27077.64583333  .00001000  00000-0  10000-3 0  9994' as TleLine1,
  tle2: '2 61702  98.4000 233.7500 0010000  90.0000 164.5000 15.60000000123452' as TleLine2,
});

/**
 * GW-01 as the afternoon finds it. Deep clone, never a spread: the nested
 * state is handed to the equipment constructors and mutated at runtime.
 * BUC gain wound down to 18 dB after the morning maintenance run; TX modem
 * still on SAR-2's 1435 MHz command IF from Tuesday's rotation.
 */
const galwayTasking: GroundStationConfig = structuredClone(galwayGroundStation);
galwayTasking.rfFrontEnds[0].buc = { ...galwayTasking.rfFrontEnds[0].buc, gain: 18 as dB };
galwayTasking.transmitters![0].modems![0].ifSignal.frequency = 1435e6 as IfFrequency;

export const natsEuScenario10Data: ScenarioData = {
  id: 'nats-eu-scenario10',
  url: 'nats-eu/scenarios/nats-eu-scenario10',
  imageUrl: 'nats/10/card.png',
  number: 10,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario9'],
  title: 'Priority Tasking',
  subtitle: 'Urgent Collect, Low Pass',
  duration: '30 min',
  missionType: 'Tasking',
  description: `15:18 local. Erik Halvorsen at Nordic Maritime Watch has a vessel of interest off the Faroes and needs SAR imagery of it today. The only MERIDIAN-SAR-1 window that covers the box peaks at 18 degrees over Galway, in seventeen minutes.<br><br>The collect has to be tasked by command early in that pass, and the imagery has to come down on the same pass. Anneke at constellation ops has confirmed the bird is available.<br><br>The link budget says the margin at 18 degrees is about two decibels. The uplink needs more EIRP than you have ever run from GW-01, the amplifier has a limit, and the evening shift left the chain in a state you will have to read before you trust it. One pass. Everything else is arithmetic, done before the horizon.`,
  equipment: ['4m Ku-Band LEO Tracking Antenna', 'Ku-Band BUC (12600 MHz LO) + HPA', 'Link Analysis / TT&C Commanding consoles', 'QPSK 3/4 Transmit and Receive Modems'],
  settings: {
    isSync: true,
    groundStations: [galwayTasking],
    satellites: [meridianSar1LowPass, meridianSar2Parked],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-18',
    scenarioStartWallTime: '15:18:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-10?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // A fast operator can skip the dead air between "ready" and AOS. The skip
    // is blocked while a timed objective runs and stops 2 min before the pass.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'GW-01 Tasking Log',
      description: 'Urgent tasking NMW-URG-2027-0318, 2027-03-18. What was commanded, what the chain was set to, what came down.',
    },

    // M1 - the low-pass budget. expectedCNRDb is what a CORRECT worksheet
    // produces from the numbers published in the budget objective.
    // Measured under real program-track (nats-eu-phase-c-validation): peak
    // 8.11 dB at max elevation, ~150 s at or above 7 dB, ~40 s at or above 8 dB.
    linkBudget: {
      label: 'Low-elevation collect: SAR-1 downlink at 18 deg',
      expectedCNRDb: 8.1,
      toleranceDb: 1.0,
      thresholdCNRDb: 6,
      requiredMarginDb: 1,
    },

    // M2 - the tasking command. Window is the SAR-1 pass with 20 s guard
    // bands: AOS T+16.98 (1019 s) .. LOS T+26.05 (1563 s).
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 1039,
      windowEndS: 1543,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'SAR-TASK-URGENT', label: 'Task urgent SAR collect' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0740'],
      title: 'Read the Tasking',
      description: 'Open the tasking brief and confirm the target box, the pass, and what an 18 degree pass does to the numbers you are used to.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Tasking Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Low-Pass Geometry Understood',
          params: {
            character: Character.SYSTEM,
            question: 'This pass peaks at 18 degrees. Against the 28 degree passes you have worked, what changes in the link budget?',
            options: [
              'Slant range at max elevation is about 1040 km instead of 761 km: nearly 3 dB more path loss plus more atmosphere, so the margin over threshold shrinks to about two decibels.',
              'Nothing in the budget changes; a lower pass is just shorter.',
              'The satellite EIRP drops at low elevation, so the bird has to be commanded to full power first.',
              'The receive antenna gain falls off at low elevation, so the dish has to be re-peaked.',
            ],
            correctIndex: 0,
            explanation:
              'Path loss goes as the square of the range, and at 18 degrees the signal crosses several times more atmosphere than it does near the zenith. The receiver will still lock, but only just, and only near max elevation. Seventeen minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1: SWEEP, REFERENCE, BUDGET, EIRP PLAN, UPLINK, PARK
    // ============================================================
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Clear the board before the tasking: confirm the active alarm state on GW-01.',
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
            question: 'What is the active alarm state on GW-01 when the tasking comes in?',
            options: [
              'RX AGC at max gain (weak signal) - empty sky, not a fault; no hardware alarms',
              'No active alarms - all systems nominal',
              'HPA over-temperature',
              'GPSDO in holdover',
            ],
            correctIndex: 0,
            explanation:
              'The AGC rail is empty sky, not a fault, and nothing else is tripped; that does not mean the chain is set the way the tasking needs it. The maintenance run this morning left its fingerprints on the BUC and the modem.',
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
      description: 'GPSDO locked and out of holdover, BUC on the external reference. The uplink frequency the bird hears is only as good as this.',
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
        {
          type: 'buc-reference-locked',
          description: 'BUC on External Reference',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'budget-the-low-pass',
      nice: ['T0080', 'S0015', 'K0740'],
      title: 'Budget the Low Pass',
      description:
        'Fill the Link Analysis worksheet for MERIDIAN-SAR-1 at maximum elevation and press Compute. Worksheet numbers: satellite EIRP 28 dBm; slant range at max elevation 1040 km (free-space path loss 174.1 dB at 11686 MHz); GW-01 receive gain 51.8 dBi; system noise temperature 88 K; occupied bandwidth 36 MHz; miscellaneous losses 1.2 dB.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['reference-check'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Link Analysis Tab Open',
          params: { tab: 'link-budget' },
          mustMaintain: false,
        },
        {
          type: 'link-budget-computed',
          description: 'Predicted C/N Matches Truth',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Atmospheric Loss Read',
          params: {
            character: Character.SYSTEM,
            question: 'The card carries 1.2 dB of miscellaneous losses where the acceptance worksheet used 1.0. Where does the extra 0.2 dB come from?',
            options: [
              'The atmospheric path at 18 degrees is about three times longer than at the zenith, so gaseous absorption at Ku adds a couple of tenths on top of the implementation loss',
              'Cable loss increases when the antenna points near the horizon',
              'The LNB noise figure is worse at low elevation',
              'It is a rounding allowance with no physical meaning',
            ],
            correctIndex: 0,
            explanation:
              'Clear-sky gaseous loss at 12 GHz is a few hundredths of a dB straight up and scales roughly with one over the sine of the elevation. At 18 degrees that is a few tenths, and on a pass with two decibels of margin a few tenths belong on the card.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'restore-the-buc-gain',
      nice: ['S0675', 'K0064', 'T0431'],
      title: 'Restore the BUC Gain',
      description:
        'The morning maintenance run left the BUC gain at 18 dB. The station standard is 23 dB, and the HPA back-off numbers on the card assume it. Set 23 dB and confirm the BUC stays out of compression.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['budget-the-low-pass'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-gain-set',
          description: 'BUC Gain 23 dB',
          params: { gain: 23, gainTolerance: 0.5 },
          mustMaintain: true,
        },
        {
          type: 'buc-not-saturated',
          description: 'BUC Out of Compression',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Chain Arithmetic Read',
          params: {
            character: Character.SYSTEM,
            question: 'The HPA output is its input plus gain minus back-off. What would 4 dB of back-off have delivered with the BUC still at 18 dB?',
            options: [
              'The EIRP of a 9 dB back-off on a correct chain: 5 dB short of the plan, with every indicator green',
              'The same EIRP; the HPA compensates for the drive level',
              'An overdriven HPA, because less drive means more gain',
              'Nothing: the BUC would refuse to unmute below 20 dB',
            ],
            correctIndex: 0,
            explanation:
              'EIRP is a sum, and the back-off is only one term. The card\'s "4 dB" assumes the BUC delivers its rated drive. Read the chain from the modem outward before you set the number at the end of it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'raise-the-eirp',
      nice: ['S0675', 'K0064', 'K0740'],
      title: 'Raise Uplink EIRP Without Overdriving',
      description:
        'The command has to reach the bird at long range: take the HPA back-off from 10 dB to 4 dB for 6 dB more EIRP. Below 3 dB the amplifier is overdriven and the IMD alarm trips.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['restore-the-buc-gain'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-back-off-set',
          description: 'HPA Back-Off at 4 dB',
          params: { backOff: 4, backOffTolerance: 0.5 },
          mustMaintain: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Linear (No IMD Alarm)',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'IMD Limit Read',
          params: {
            character: Character.SYSTEM,
            question: 'The IMD readout worsens by about 2 dB for every dB of back-off you give up, and the alarm trips below 3 dB. What is the cost of ignoring it for one pass?',
            options: [
              'Intermodulation products land in the neighbouring channels: a splattered band, which Rotterdam has said costs more than a missed collect',
              'Nothing on a single pass; the alarm is a maintenance reminder',
              'The HPA shuts itself down and the command is lost',
              'The bird rejects the command because the carrier is distorted',
            ],
            correctIndex: 0,
            explanation:
              'An amplifier driven past its linear region makes new frequencies out of the ones it was given. Those go up the same dish at the same EIRP, into channels that belong to somebody else. 4 dB is the number: 6 dB more EIRP, 1 dB of linearity to spare.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'tune-the-uplink',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Tune the Uplink',
      description:
        "TX modem 1 is on SAR-2's 1435 MHz command IF from Tuesday. Retune it to 1405 MHz (14005 MHz through the 12600 MHz BUC LO) for SAR-1, and engage uplink Doppler compensation on the TT&C console now, not at AOS.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['raise-the-eirp'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX 1405 MHz',
          params: { modemNumber: 1, frequency: 1405e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
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
      description: 'AOS 15:34:59 from azimuth 027, north-northeast. Park the tracker on the rise azimuth at 5 degrees so the slew is done before she is over the horizon.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-the-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 027 / El 5',
          params: { azimuth: 27, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEATS 2-3: THE PASS
    // ============================================================
    {
      id: 'acquire-low',
      nice: ['S0421', 'K1032'],
      title: 'Acquire at the Horizon',
      description: 'AOS 15:35. Program-track MERIDIAN-SAR-1 and confirm the beacon on RX analysis as it clears the horizon. Chain cold until the beacon is in.',
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
      id: 'task-the-collect',
      nice: ['T1567', 'K0773', 'S0675'],
      title: 'Task the Collect',
      description:
        'Modem on air FIRST, then the HPA; with the amplifier up, the TX chain should show at least half a watt into the feed at 4 dB back-off. Then send SAR-TASK-URGENT early in the pass. The imaging block needs lead time to arm before the bird is over the box, and the window closes at 15:43:43.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-low'],
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'hpa-output-power-set',
          description: 'HPA Output >= 0.5 W',
          params: { minOutputPower: 0.5, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'command-acknowledged',
          description: 'SAR-TASK-URGENT Acknowledged',
          params: { commandId: 'SAR-TASK-URGENT' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'pull-the-imagery',
      nice: ['T0153', 'K0740', 'T0080'],
      title: 'Pull the Imagery With the Margin You Have',
      description:
        'Lock the 1414 MHz imagery downlink and hold C/N above the 6 dB threshold for 30 seconds, then commit the link in Link Analysis at max elevation (15:39:31) with at least 1 dB over threshold. Commit early and the margin is not there.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['task-the-collect'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'RX Modem Locked on Downlink',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'C/N Held Above 6 dB for 30 s',
          params: { modemNumber: 1, minCNRatio: 6, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
          maintainDuration: 30,
        },
        {
          type: 'link-margin-met',
          description: 'Measured Margin >= 1 dB',
          params: { minMarginDb: 1 },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Short Window Read',
          params: {
            character: Character.SYSTEM,
            question: 'On the 28 degree passes 8 dB held for four minutes. Today it holds for about forty seconds either side of 15:39:31. Why is the window so short?',
            options: [
              'On a low pass the bird never gets close: range falls from 2000 km to 1040 km and climbs straight back, so the C/N curve is a spike, not a plateau',
              'The Doppler rate is higher on a low pass, so the modem loses lock sooner',
              'The imaging block is transmitting for only forty seconds',
              'The HPA at 4 dB back-off desensitises the receiver except at closest approach',
            ],
            correctIndex: 0,
            explanation:
              'Elevation is range. Near the zenith a pass spends minutes within a few percent of its closest range; at 18 degrees it is close for seconds. The number the card asks for exists at culmination and nowhere else on the curve.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },

    // ============================================================
    // BEAT 4: SAFE, RESTORE, LOG, REPORT
    // ============================================================
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645', 'S0675'],
      title: 'Safe the Uplink',
      description: 'LOS 15:44:03. Chain down in the mirror order: HPA output off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['pull-the-imagery'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'restore-the-back-off',
      nice: ['S0675', 'K0645', 'K0064'],
      title: 'Restore the Back-Off',
      description: 'Put the HPA back-off back to the station standard, 10 dB, before anyone else uses this chain.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-back-off-set',
          description: 'HPA Back-Off at 10 dB',
          params: { backOff: 10, backOffTolerance: 0.5 },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Standard Restored',
          params: {
            character: Character.SYSTEM,
            question: 'Why put the back-off back to 10 dB now, when the next tasking might need 4 again?',
            options: [
              '4 dB was the EIRP for one 18 degree geometry; on a normal pass it is 6 dB over the coordinated level for the bird, an interference risk for the neighbours, and a station that is not the one on the card for the next operator',
              'Because the HPA cannot run at 4 dB for more than one pass without overheating',
              'It does not matter; the back-off resets itself when the HPA is disabled',
              'So the IMD alarm clears',
            ],
            correctIndex: 0,
            explanation:
              'Exceptions are set for a pass and cleared after it. The station standard is what everything else - the card, the coordination filing, the next shift - assumes. Leave the chain the way the paperwork says it is.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'log-the-tasking',
      nice: ['T1580', 'K0645', 'S0842'],
      title: 'Log the Tasking',
      description: 'Write the tasking into the log: what was commanded, what the chain was set to and for how long, what came down.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['restore-the-back-off'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Tasking Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What does the tasking log need beyond "collect tasked, imagery received"?',
            options: [
              'The command and its ACK time, the EIRP exception (4 dB back-off, for this pass, restored after), the measured C/N against the 8.1 dB prediction, and the geometry it was measured at',
              "The customer's name and the target box",
              'Just the ACK, since the frames prove the rest',
              'The worksheet inputs, which are already on the card',
            ],
            correctIndex: 0,
            explanation:
              "A log line is the next person's evidence. The EIRP exception in particular: without it, a 4 dB back-off found on the chain next week is a mystery, and with it, it is a finding.",
            pointPenalty: 5,
            documentSection: 'Tasking',
            documentLine:
              '15:35Z MERIDIAN-SAR-1 GW-01, urgent collect NMW-URG-2027-0318: SAR-TASK-URGENT ACK inside the window under Doppler comp and a valid key. EIRP exception: BUC gain restored 18 -> 23 dB, HPA back-off 4 dB for the pass, restored to 10 dB after LOS. Imagery decoded at 18 deg, link committed >= 1 dB over the 6 dB threshold; peak C/N ~8.1 dB against 8.1 predicted.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'report-to-customer',
      nice: ['S0478', 'T1580'],
      title: 'Report to Erik',
      description: 'The frames are in. Tell the customer what he got and what this geometry means for the next request.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-tasking'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Customer Report Sent',
          params: {
            character: Character.SYSTEM,
            question: 'The collect decoded at about 8 dB C/N, two decibels over threshold. What do you tell the customer?',
            options: [
              'Captured and usable, and that this geometry is the floor: anything lower needs the Shetland site or the next orbit.',
              'Captured, and GW-01 can repeat it on any pass he likes.',
              'Captured, but the imagery is degraded because the link was marginal.',
              'Captured; the technical details are in the tasking log if he wants them.',
            ],
            correctIndex: 0,
            explanation:
              'Two decibels over threshold is a clean decode, not a degraded one; the frames are as good as any. What the customer needs to know is that 18 degrees is about the lowest pass this station will close, so the next box further north is a Shetland job or a wait for a better orbit.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Erik Halvorsen, Nordic Maritime Watch, 15:17]</em>
      </p>
      <p>
        "Vessel of interest went dark off the Faroes overnight. I have a box, 62.5 N 7.5 W, forty kilometres square. Your SAR-1 pass at 15:35 is the only one that covers it before it moves. One pass, tasking and download. Can you do it?"
      </p>
      `,
      character: Character.ERIK_HALVORSEN,
      emotion: Emotion.CONCERNED,
      audioUrl: '',
    },
    objectives: {
      'budget-the-low-pass': {
        text: `
        <p>
          Anneke here. SAR-1 is yours for the pass, imaging block is free and the command link is keyed. It is a low one though, you will need more uplink power than usual to reach her at that range. Your EIRP, your call. Just keep the HPA linear; I would rather lose the collect than have you splatter the band.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'task-the-collect': {
        text: `
        <p>
          Task received on board, imaging block armed. She will shoot the box at closest approach and start the dump straight after. The downlink is all yours now, hold it through max elevation.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'pull-the-imagery': {
        text: `
        <p>
          Frames in. The box is covered and the target is in it. Thank you.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'safe-the-uplink': {
        text: `
        <p>
          Chain down on my side too, thank you. For the record: the IMD readout never moved off the green. That is the number I will quote when somebody asks whether Galway can be trusted with a low pass.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'report-to-customer': {
        text: `
        <p>
          Understood on the geometry. If the next box is further north I will ask for Shetland or wait for the better orbit. Good work today, Galway.
        </p>
        `,
        character: Character.ERIK_HALVORSEN,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
