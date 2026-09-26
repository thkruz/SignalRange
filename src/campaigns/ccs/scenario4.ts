import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { Hertz, IfFrequency, MHz } from '@app/types';
import type { Degrees } from 'ootk';
import { sandstormGroundStation } from './ground-stations';
import { cobalt4Satellite, talon2Satellite } from './satellites';

/**
 * Campaign 4 (9th EWS / Counter Communications) - Scenario 4 "State of Health"
 *
 * Second TALON-2 backup contact, the night after First Shift, and the panel
 * is not green. Two things move: reaction wheel 1 spikes into yellow for a
 * minute at T+4:00 and comes back on its own - a transient, logged and left
 * alone - and from T+7:00 the battery temperature climbs at three degrees a
 * minute and does not come back. The heater that ran through the eclipse
 * exit has stuck on. The state-of-health call is DEGRADED with the channel
 * named and the trend stated; the response is a command (TCS-HTR-OFF) inside
 * the window; the verification is the same channel turning over on the
 * Telemetry tab - not the ACK. Then safe, log, hand back.
 *
 * Phase 18 E: evaluating state of health against expected values (9.8) as a
 * decision graded on soh-yellow-limit, and command verification (9.10) as a
 * telemetry read after the ACK. The excursion carries endsOnCommandId, so the
 * battery only recovers once TCS-HTR-OFF has been acknowledged; a command
 * sent outside the window, or to the wrong mnemonic, leaves the channel
 * climbing and the verification unmet.
 *
 * Timeline (mission elapsed): window T+300 .. T+2400. Wheel transient
 * T+240 .. T+300 (step to 5200 rpm, yellow). Battery heater from T+420: 21 to
 * 38 degC over 400 s (yellow at 32 from ~T+680; red at 40 never reached
 * inside the window if the heater is commanded off by ~T+900). Recovery ramps
 * back to nominal over 240 s from the ACK.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - S0648: Skill in detecting anomalies (state of health against limits)
 *   - T0431: Monitor telemetry and reference systems
 * Supporting Codes:
 *   - K1032: Knowledge of satellite-based communication systems
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - S0421: Skill in operating communications equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - T0153: Monitor system performance
 *   - S0593: Skill in handling incidents
 */

/** SS-01 as last night left it: monitor already on TALON-2, receiver 3 on 1625, modem 1 on the TT&C IF. Deep clone, never spread. */
const sandstormSoh: GroundStationConfig = structuredClone(sandstormGroundStation) as unknown as GroundStationConfig;
sandstormSoh.antennasState![1] = {
  ...sandstormSoh.antennasState![1],
  azimuth: 166.0 as Degrees,
  elevation: 49.6 as Degrees,
  targetAzimuth: 166.0 as Degrees,
  targetElevation: 49.6 as Degrees,
  beaconFrequencyHz: 7300e6 as Hertz,
};
sandstormSoh.receivers![2].modems![0] = { ...sandstormSoh.receivers![2].modems![0], frequency: 1625 as MHz };
sandstormSoh.transmitters![0].modems[0] = {
  ...sandstormSoh.transmitters![0].modems[0],
  ifSignal: { ...sandstormSoh.transmitters![0].modems[0].ifSignal, frequency: 1200e6 as IfFrequency },
};

const TALON2_CHANNELS = [
  { id: 'bus-v', label: 'Main bus voltage', unit: 'V', subsystem: 'EPS', nominal: 28.1, noise: 0.2, yellowLow: 26.5, yellowHigh: 29.5, redLow: 25.5, redHigh: 30.5 },
  { id: 'batt-soc', label: 'Battery state of charge', unit: '%', subsystem: 'EPS', nominal: 88, noise: 0.4, yellowLow: 70, redLow: 55, decimals: 0 },
  { id: 'sa-i', label: 'Solar array current', unit: 'A', subsystem: 'EPS', nominal: 18.2, noise: 0.3, yellowLow: 12, yellowHigh: 24, redLow: 8, redHigh: 28 },
  { id: 'batt-t', label: 'Battery temperature', unit: 'degC', subsystem: 'TCS', nominal: 21, noise: 0.3, yellowLow: 5, yellowHigh: 32, redLow: 0, redHigh: 40 },
  { id: 'htr-state', label: 'Battery heater state', unit: '', subsystem: 'TCS', nominal: 0, yellowHigh: 0.5, decimals: 0 },
  { id: 'twta-t', label: 'TWTA baseplate temperature', unit: 'degC', subsystem: 'TCS', nominal: 58, noise: 0.5, yellowLow: 40, yellowHigh: 75, redLow: 30, redHigh: 85 },
  {
    id: 'wheel-rpm',
    label: 'Reaction wheel 1 speed',
    unit: 'rpm',
    subsystem: 'ADCS',
    nominal: 3250,
    noise: 30,
    yellowLow: 1500,
    yellowHigh: 5000,
    redLow: 800,
    redHigh: 6000,
    decimals: 0,
  },
  { id: 'sun-err', label: 'Sun sensor pointing error', unit: 'deg', subsystem: 'ADCS', nominal: 0.05, noise: 0.02, yellowHigh: 0.3, redHigh: 0.8, decimals: 2 },
  { id: 'tp-pwr', label: 'TP-T1 output power', unit: 'dBm', subsystem: 'COMM', nominal: 42, noise: 0.2, yellowLow: 38, yellowHigh: 44, redLow: 35, redHigh: 46 },
  { id: 'cpu-load', label: 'OBC processor load', unit: '%', subsystem: 'OBC', nominal: 35, noise: 2, yellowHigh: 70, redHigh: 90, decimals: 0 },
];

export const ccsScenario4Data: ScenarioData = {
  id: 'ccs-scenario4',
  url: 'ccs/scenarios/ccs-scenario4',
  imageUrl: 'nats/23/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ccs-scenario3'],
  title: 'State of Health',
  subtitle: 'A Channel That Does Not Come Back',
  duration: '25-35 min',
  missionType: 'Spacecraft Operations',
  description: `Second backup contact on TALON-2. The primary terminal is still down and the bird came out of eclipse forty minutes ago. Last night every channel was green and the call was easy.
  <br/><br/>Tonight two things will move on the panel. One of them comes back on its own; one of them does not. Tell them apart, name the channel and the trend, make the call, send the command that fixes it inside the window - and then prove it worked with the telemetry, not with the ACK.`,
  equipment: [
    '3-metre X-band Look-through Monitor (on TALON-2)',
    '5-metre X-band Jam Antenna (cold)',
    'X-band RF Front End (7000 MHz BUC LO / 8925 MHz LNB LO)',
    'TT&C Console with Telemetry Display',
    'Dual Exciters on a Shared HPA (modem 1 on the TT&C IF)',
  ],
  settings: {
    isSync: true,
    groundStations: [sandstormSoh],
    satellites: [talon2Satellite, cobalt4Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-11-09',
    scenarioStartWallTime: '02:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-4/scenario-4?content-only=true&dark=true',

    workingDocument: {
      title: 'TALON-2 Contact Log 2027-313-01',
      description: 'The 0205Z backup contact: what moved, what was called, what was commanded, what the telemetry said afterwards.',
    },

    telemetry: {
      groundStationId: 'SS-01',
      satelliteNoradId: 90071,
      antennaIndex: 1,
      frameRateHz: 1,
      staleAfterS: 10,
      channels: TALON2_CHANNELS,
      excursions: [
        // The transient: wheel 1 spikes for a minute and comes back on its own.
        { id: 'wheel-transient', channelId: 'wheel-rpm', startTime: 240, duration: 60, rampToValue: 5200, label: 'Reaction wheel 1 transient' },
        // The trend: the eclipse-exit heater stays on until commanded off.
        { id: 'htr-stuck-state', channelId: 'htr-state', startTime: 420, rampToValue: 1, endsOnCommandId: 'TCS-HTR-OFF', recoverySeconds: 0, label: 'Battery heater ON' },
        {
          id: 'htr-stuck',
          channelId: 'batt-t',
          startTime: 420,
          rampToValue: 38,
          rampSeconds: 400,
          endsOnCommandId: 'TCS-HTR-OFF',
          recoverySeconds: 240,
          label: 'Battery heater stuck on',
        },
      ],
    },

    commanding: {
      groundStationId: 'SS-01',
      targetNoradId: 90071,
      windowStartS: 300,
      windowEndS: 2400,
      requireDopplerComp: false,
      requireValidKey: true,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'TCS-HTR-OFF', label: 'Battery heater OFF' },
        { id: 'TCS-HTR-ON', label: 'Battery heater ON' },
        { id: 'ADCS-MOM-DUMP', label: 'Momentum dump' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },
  },
  objectives: [
    {
      id: 'read-the-shift-package',
      nice: ['K0645', 'K1032'],
      title: 'Read the Shift Package',
      description: 'Open the shift package: what changed since last night (eclipse exit), which commands are in the stack, and what "verify" means.',
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
          description: 'Verification Understood',
          params: {
            question: 'You send a command and the console says ACK. What has been verified?',
            options: [
              'That the bird received and accepted the frame. Whether it did anything is verified in telemetry: the channel the command was meant to change, changing',
              'That the command executed: an ACK is only sent after the on-board sequence completes',
              'That the uplink, key and window were good - which is the same as the command having worked',
              'Nothing until the next contact: state changes are only reported in the next housekeeping dump',
            ],
            correctIndex: 0,
            explanation:
              'ACK is receipt. Execution is what the spacecraft does next, and the only place it shows is the telemetry. A heater-off command is verified by the temperature turning over, and by nothing else.',
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
      nice: ['T0431', 'S0421'],
      title: 'Acquire Telemetry',
      description: 'The monitor is still on TALON-2 from last night. Open the Telemetry tab and take ten frames on a LIVE link.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-the-shift-package'],
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Telemetry Tab Open',
          params: { tab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-frames-received',
          description: 'Ten Frames Received',
          params: { minFrames: 10 },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'Battery Temperature Read Nominal at Acquisition',
          params: { channelId: 'batt-t', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'the-transient',
      nice: ['S0648', 'K1032'],
      title: 'Transient on Wheel 1',
      description: 'At T+4:00 reaction wheel 1 jumps into yellow. Read it on the Telemetry tab while it is there, watch it come back, and say what it was.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['acquire-telemetry'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Wheel Speed Read Yellow',
          params: { channelId: 'wheel-rpm', telemetryBand: 'yellow', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Transient Named',
          params: {
            question: 'Wheel 1 went to 5200 rpm for about a minute and came back to 3250 on its own. What was it, and what do you do?',
            options: [
              'A transient: a momentum bump the wheel absorbed and unloaded on its own. Log the time and the peak; it goes in the trend, not in a command',
              'A fault: a wheel that changes speed by 2000 rpm is failing and needs a momentum dump commanded now',
              'A sensor artefact: nothing on a GEO bird moves that fast, so the channel is bad',
              'Nothing worth logging: it is back in green',
            ],
            correctIndex: 0,
            explanation:
              'A channel that departs and returns by itself is a transient. It is real, it is logged with its time and peak, and it becomes one point in a trend that might mean something in a month. It is not a command tonight.',
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
      id: 'spot-the-trend',
      nice: ['S0648', 'T0431'],
      title: 'Spot the Trend',
      description: 'From T+7:00 the battery temperature climbs and does not turn over. Read it in yellow on the Telemetry tab, with the heater state channel next to it.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['the-transient'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Battery Temperature Read Yellow',
          params: { channelId: 'batt-t', telemetryBand: 'yellow', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'Heater State Read ON',
          params: { channelId: 'htr-state', telemetryBand: 'yellow', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Trend Named',
          params: {
            question: 'Battery temperature 33 degC and rising about three degrees a minute; heater state ON forty minutes after eclipse exit. What is this?',
            options: [
              'A stuck heater: the eclipse-exit heater should have cycled off at 20 degC. At this rate the battery is at the 40 degC red limit inside three minutes. This is a command, tonight, now',
              'Normal eclipse-exit warming: the battery is catching up with the sun and will settle',
              'A sensor drift: the heater channel is a flag, not a temperature, and the two disagree',
              'A transient like the wheel: log it and see if it comes back',
            ],
            correctIndex: 0,
            explanation:
              'A channel with a cause visible next to it (heater ON) and a rate that reaches harm inside the window is a trend, not a transient. The difference between the two is exactly what the state-of-health call has to say.',
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
      id: 'call-state-of-health',
      nice: ['S0648', 'S0593', 'K1032'],
      title: 'Call the State of Health',
      description: 'RAMPART wants the call. Read the whole panel - one channel yellow and climbing, the rest green - and say what it is and what you will do about it.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['spot-the-trend'],
      conditions: [
        {
          id: 'batt-seen',
          type: 'telemetry-channel-in-band',
          description: 'Battery temperature read on Telemetry',
          params: { channelId: 'batt-t', telemetryBand: 'yellow', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'State of Health',
          params: {
            character: Character.SYSTEM,
            prompt: 'RAMPART: "SANDSTORM, TALON-2 state of health?" What do you call, and what comes next?',
            evidence: ['batt-seen'],
            decisionOptions: [
              {
                label:
                  'Degraded - battery temperature in yellow and climbing at three degrees a minute, heater stuck ON since eclipse exit. Commanding TCS-HTR-OFF inside the window and verifying on the temperature trend',
                correctWhen: {
                  all: [
                    { fact: 'soh-yellow-limit', is: true },
                    { fact: 'telemetry-stale', is: false },
                  ],
                },
                consequence: { log: 'TALON-2 state of health called DEGRADED: battery heater stuck ON; TCS-HTR-OFF to be commanded' },
              },
              {
                label: 'Nominal - one channel in yellow is not a degraded bird; log it and dump housekeeping',
                correctWhen: { fact: 'soh-yellow-limit', is: false },
                consequence: { log: 'TALON-2 state of health called NOMINAL with a channel in yellow' },
                feedback:
                  'Nominal means every channel inside limits on fresh frames. One channel outside its limits with a cause showing and a rate that reaches red inside the window is the definition of degraded.',
              },
              {
                label: 'Unknown - the stream is stale and the temperature is frozen history; re-acquire before calling anything',
                correctWhen: { fact: 'telemetry-stale', is: true },
                consequence: { log: 'TALON-2 state of health called UNKNOWN - stale stream' },
                feedback: 'The link reads LIVE and the frames are climbing. The temperature is not frozen; it is rising, which is the problem.',
              },
              {
                label: 'Critical - payload to safe mode now, before the battery reaches red',
                feedback:
                  'PLD-SAFE turns off the mission to protect a battery that a heater command protects just as well. Match the response to the cause: the heater is on; turn the heater off.',
              },
            ],
            explanation:
              'Degraded, named: the channel, the direction, the rate, the cause showing beside it, and the action. A state-of-health call that names the channel is a call somebody can act on. Then act on it.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'arm-the-uplink',
      nice: ['T1567', 'K0645'],
      title: 'Arm the Uplink',
      description: 'Modem 1 is on the 1200 MHz TT&C IF from last night. HPA up, modem 1 keyed. The window has been open since T+5:00.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['call-state-of-health'],
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
      id: 'heater-off',
      nice: ['T1567', 'K1032', 'S0593'],
      title: 'Command the Heater Off',
      description: 'TT&C console: TCS-HTR-OFF. One command, the right mnemonic, inside the window. The ACK is receipt - not the end of this.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['arm-the-uplink'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'TCS-HTR-OFF Acknowledged',
          params: { commandId: 'TCS-HTR-OFF' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'verify-the-command',
      nice: ['T0431', 'S0648', 'K1032'],
      title: 'Verify the Command',
      description:
        'Back to the Telemetry tab. The heater state should read OFF and the battery temperature should turn over and come back inside limits. Read it green. That is the verification.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['heater-off'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Heater State Read OFF',
          params: { channelId: 'htr-state', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'Battery Temperature Back in Limits',
          params: { channelId: 'batt-t', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Verification Read',
          params: {
            question: 'Heater OFF on the next frame; battery temperature turned over and is back under 32 degC four minutes later. Which of those verified the command?',
            options: [
              'Both, in order: the heater state changing proves the command executed; the temperature turning over proves it fixed the thing you commanded it for',
              'The ACK: it was received, so it worked',
              'The heater state alone: the temperature is a consequence and would have come down anyway once the eclipse warming ended',
              'Neither: verification needs a housekeeping dump and a comparison with the previous contact',
            ],
            correctIndex: 0,
            explanation:
              'A command is verified twice: the direct effect (the state it was meant to change) and the reason you sent it (the trend it was meant to stop). Tonight both are on the same panel, four minutes apart. Log both times.',
            character: Character.SYSTEM,
            pointPenalty: 2,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Uplink',
      description: 'Verified. Un-key modem 1 and disable the HPA before the log entry.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['verify-the-command'],
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
      description: 'The contact log line: the transient, the trend, the call, the command, the verification, the state the chain was left in.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      conditions: [
        {
          type: 'status-check',
          description: 'Contact Logged',
          params: {
            question: 'Which line goes in the TALON-2 contact log?',
            options: [
              '0205Z contact SANDSTORM (backup). Telemetry LIVE. T+4:00 wheel 1 transient to 5200 rpm, self-cleared, logged. T+7:00 battery temperature climbing ~3 degC/min, heater ON (stuck after eclipse exit); SOH DEGRADED called. TCS-HTR-OFF sent, ACK; heater OFF next frame; temperature turned over, back in limits. Chain safed. TCS anomaly report to RAMPART',
              'TALON-2 contact: one anomaly, resolved by command',
              'Battery over-temperature emergency on TALON-2 averted by SANDSTORM; heater failure suspected; spacecraft at risk until repaired',
              '0205Z: wheel and battery anomalies; heater commanded off; bird healthy',
            ],
            correctIndex: 0,
            explanation:
              'Two events, each with its time, its reading, what was called, what was done, and how it was proven. "Resolved" is a conclusion; "turned over, back in limits" is what the panel said. The heater still needs an engineer - that is the report, not the log.',
            character: Character.SYSTEM,
            pointPenalty: 2,
            documentSection: 'Contact',
            documentLine:
              '0205Z TALON-2 backup contact, SANDSTORM. Telemetry LIVE. T+4:00 wheel 1 transient to 5200 rpm, self-cleared in 60 s, logged. T+7:00 battery temperature climbing ~3 degC/min with heater ON (stuck after eclipse exit); SOH DEGRADED. TCS-HTR-OFF 8200 MHz ACK; heater OFF on the next frame; battery temperature turned over and returned inside limits. Chain safed. TCS heater anomaly reported to RAMPART for engineering.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
