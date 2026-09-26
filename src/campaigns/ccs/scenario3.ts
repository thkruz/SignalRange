import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { Hertz, MHz } from '@app/types';
import { sandstormGroundStation } from './ground-stations';
import { cobalt4Satellite, talon2Satellite } from './satellites';

/**
 * Campaign 4 (9th EWS / Counter Communications) - Scenario 3 "First Shift"
 *
 * The contractor's first shift at SANDSTORM (the Campaign 2 bridge: Charlie's
 * friend read the attribution report and asked for the operator who wrote
 * it). It is not a jamming shift. SANDSTORM's second job is TT&C backup for
 * TALON-2, the unit's own X-band MILSATCOM relay - the friendly bird whose
 * 8175-8225 MHz uplink is the protected band in the EA tasking - and tonight
 * the primary MILSATCOM terminal is down for maintenance. The evening contact
 * is SANDSTORM's: point the monitor aperture at TALON-2, take its telemetry,
 * read the spacecraft subsystem by subsystem, call its state of health, send
 * one housekeeping dump on the TX chain, safe it, log it, hand back.
 *
 * Phase 18 E: first use of settings.telemetry (the read-only Telemetry tab
 * with limit bands) and of the telemetry-* conditions. The state-of-health
 * call is a decision graded on the soh-yellow-limit / telemetry-stale facts:
 * "nominal" is a claim about fresh frames inside limits, not the absence of
 * red badges. No EA settings, so the deconfliction interlock is not armed -
 * the jam strings stay cold and the objectives say so.
 *
 * Timeline (mission elapsed): contact window T+600 .. T+2400. TALON-2 is GEO
 * (az 166.0 / el 49.6 from SANDSTORM, stationary on this timescale); the
 * monitor aperture parks at az 90 / el 10 and is slewed on by the operator.
 * The monitor receiver (receiver 3) is staged on the 1625 MHz telemetry IF by
 * the day crew; the TX exciters carry the 1125 MHz jam tune and modem 1 must
 * be retuned to the 1200 MHz TT&C uplink IF.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K1032: Knowledge of satellite-based communication systems (spacecraft subsystems)
 *   - S0648: Skill in detecting anomalies (state of health against limits)
 * Supporting Codes:
 *   - T0431: Monitor timing and telemetry reference systems
 *   - S0421: Skill in operating communications equipment
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - T0153: Monitor system performance
 *   - K0737: Knowledge of RF spectrum characteristics
 */

/** SS-01 as the day crew staged it for TALON-2: monitor beacon on 7300, monitor receiver on 1625. Deep clone, never spread. */
const sandstormTalon: GroundStationConfig = structuredClone(sandstormGroundStation) as unknown as GroundStationConfig;
sandstormTalon.antennasState![1] = { ...sandstormTalon.antennasState![1], beaconFrequencyHz: 7300e6 as Hertz };
sandstormTalon.receivers![2].modems![0] = { ...sandstormTalon.receivers![2].modems![0], frequency: 1625 as MHz };

/** TALON-2 state-of-health channels: ten channels across five subsystems, all nominal tonight. */
const TALON2_CHANNELS = [
  { id: 'bus-v', label: 'Main bus voltage', unit: 'V', subsystem: 'EPS', nominal: 28.1, noise: 0.2, yellowLow: 26.5, yellowHigh: 29.5, redLow: 25.5, redHigh: 30.5 },
  { id: 'batt-soc', label: 'Battery state of charge', unit: '%', subsystem: 'EPS', nominal: 92, noise: 0.4, yellowLow: 70, redLow: 55, decimals: 0 },
  { id: 'sa-i', label: 'Solar array current', unit: 'A', subsystem: 'EPS', nominal: 18.5, noise: 0.3, yellowLow: 12, yellowHigh: 24, redLow: 8, redHigh: 28 },
  { id: 'batt-t', label: 'Battery temperature', unit: 'degC', subsystem: 'TCS', nominal: 21, noise: 0.3, yellowLow: 5, yellowHigh: 32, redLow: 0, redHigh: 40 },
  { id: 'twta-t', label: 'TWTA baseplate temperature', unit: 'degC', subsystem: 'TCS', nominal: 58, noise: 0.5, yellowLow: 40, yellowHigh: 75, redLow: 30, redHigh: 85 },
  {
    id: 'wheel-rpm',
    label: 'Reaction wheel 1 speed',
    unit: 'rpm',
    subsystem: 'ADCS',
    nominal: 3200,
    noise: 30,
    yellowLow: 1500,
    yellowHigh: 5000,
    redLow: 800,
    redHigh: 6000,
    decimals: 0,
  },
  { id: 'sun-err', label: 'Sun sensor pointing error', unit: 'deg', subsystem: 'ADCS', nominal: 0.05, noise: 0.02, yellowHigh: 0.3, redHigh: 0.8, decimals: 2 },
  { id: 'tp-pwr', label: 'TP-T1 output power', unit: 'dBm', subsystem: 'COMM', nominal: 42, noise: 0.2, yellowLow: 38, yellowHigh: 44, redLow: 35, redHigh: 46 },
  { id: 'rx-agc', label: 'Command receiver AGC', unit: 'dBm', subsystem: 'COMM', nominal: -65, noise: 1, yellowLow: -80, yellowHigh: -50, redLow: -90, redHigh: -40, decimals: 0 },
  { id: 'cpu-load', label: 'OBC processor load', unit: '%', subsystem: 'OBC', nominal: 34, noise: 2, yellowHigh: 70, redHigh: 90, decimals: 0 },
];

export const ccsScenario3Data: ScenarioData = {
  id: 'ccs-scenario3',
  url: 'ccs/scenarios/ccs-scenario3',
  imageUrl: 'nats/22/card.png',
  number: 2,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['ccs-scenario2'],
  title: 'First Shift',
  subtitle: 'TALON-2 State of Health',
  duration: '25-35 min',
  missionType: 'Spacecraft Operations',
  description: `Your first shift at SANDSTORM as a contractor, and it is not a jamming shift. The site's second job is TT&C backup for TALON-2, the unit's own X-band relay - the bird behind the protected band in every tasking order here - and tonight the primary MILSATCOM terminal is down for maintenance. The 0210Z contact is yours.
  <br/><br/>Point the monitor aperture at TALON-2 and take its telemetry. Read the spacecraft one subsystem at a time - power, thermal, attitude, comms, computer - and call its state of health on what the frames say, not on the colour of the badges. Then one housekeeping dump on the TX chain, safe the uplink, log the contact and hand it back. The jam strings stay cold all night: this is the bird they exist to protect.`,
  equipment: [
    '3-metre X-band Look-through Monitor (TALON-2 telemetry aperture)',
    '5-metre X-band Jam Antenna (cold)',
    'X-band RF Front End (7000 MHz BUC LO / 8925 MHz LNB LO)',
    'TT&C Console with Telemetry Display',
    'Dual Exciters on a Shared HPA (modem 1 retuned for TT&C)',
  ],
  settings: {
    isSync: true,
    groundStations: [sandstormTalon],
    satellites: [talon2Satellite, cobalt4Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-11-08',
    scenarioStartWallTime: '02:00:00',
    missionBriefUrl: 'https://docs.signalrange.space/campaign-4/scenario-3?content-only=true&dark=true',

    workingDocument: {
      title: 'TALON-2 Contact Log 2027-312-01',
      description: 'The 0210Z backup contact: telemetry, state of health, the command, the hand-back.',
    },

    // Phase 18 E - the telemetry stream, on the monitor aperture (antenna 1).
    telemetry: {
      groundStationId: 'SS-01',
      satelliteNoradId: 90071,
      antennaIndex: 1,
      frameRateHz: 1,
      staleAfterS: 10,
      channels: TALON2_CHANNELS,
    },

    // The command uplink on the TX chain: 8200 MHz through the 7000 MHz BUC LO
    // (modem 1 retuned to 1200 MHz IF). GEO: no Doppler compensation.
    commanding: {
      groundStationId: 'SS-01',
      targetNoradId: 90071,
      windowStartS: 600,
      windowEndS: 2400,
      requireDopplerComp: false,
      requireValidKey: true,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'TLM-RATE-HI', label: 'Telemetry to high rate' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },
  },
  objectives: [
    {
      id: 'read-the-shift-package',
      nice: ['K0645', 'K1032'],
      title: 'Read the Shift Package',
      description: 'Open the shift package: what SANDSTORM does for TALON-2 tonight, what it does not, and why the jam strings stay cold.',
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
          description: 'Role Confirmed',
          params: {
            question: 'What is SANDSTORM doing for TALON-2 at 0210Z, and what is the one thing it must not do?',
            options: [
              "Backup TT&C: telemetry on the monitor aperture, one command on the TX chain. It must not radiate anything but that command into 8175-8225 MHz - the band is TALON-2's own uplink",
              "Battle-damage assessment: watch TALON-2's downlink for interference while the primary terminal is down",
              'Denial rehearsal: TALON-2 is a friendly stand-in for COBALT-4 so the jam chain can be exercised safely',
              "Ranging: measure TALON-2's slant range for the orbit-determination team",
            ],
            correctIndex: 0,
            explanation:
              'The protected band exists because this bird lives in it. Tonight the site is on the other side of that rule: it is the station that keeps TALON-2 alive while the primary terminal is down. Telemetry, one command, hand back.',
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
      id: 'jam-strings-cold',
      nice: ['K0645', 'K0737'],
      title: 'Confirm the Jam Strings Are Cold',
      description: 'TX Chain: HPA output disabled, JAM-A and JAM-B un-keyed. Nothing leaves this trailer until the command is ready.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-the-shift-package'],
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: { equipmentIndex: 0, requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'JAM-A (Modem 1) Un-keyed',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'JAM-B (Modem 2) Un-keyed',
          params: { modemNumber: 2 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'point-the-monitor',
      nice: ['S0421', 'K1032'],
      title: 'Point the Monitor at TALON-2',
      description: 'The monitor aperture (antenna 2) is parked at az 90 / el 10. TALON-2 sits at azimuth 166, elevation 50. Slew it on and hold it there for the contact.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['jam-strings-cold'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'Monitor Antenna on TALON-2',
          params: { equipmentIndex: 1, azimuth: 166, elevation: 50, tolerance: 3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'acquire-telemetry',
      nice: ['T0431', 'S0421'],
      title: 'Acquire Telemetry',
      description: 'Receiver 3 is on the 1625 MHz telemetry IF. Open the Telemetry tab and watch the frame counter: ten frames on a LIVE link is a stream you can read.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['point-the-monitor'],
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'Monitor Receiver on 1625 MHz',
          params: { equipmentIndex: 2, modemNumber: 1, frequency: 1625e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
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
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'read-the-power-bus',
      nice: ['K1032', 'S0648'],
      title: 'Read the Power Subsystem',
      description: 'EPS: main bus voltage and battery state of charge, both inside their yellow limits on fresh frames. Read them on the Telemetry tab and say what they mean.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['acquire-telemetry'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Bus Voltage Read Nominal',
          params: { channelId: 'bus-v', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'Battery State of Charge Read Nominal',
          params: { channelId: 'batt-soc', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'EPS Understood',
          params: {
            question: 'Bus 28.1 V, battery 92 %, array current 18.5 A, in the middle of the evening. What does that set of three tell you?',
            options: [
              'The array is carrying the load and topping the battery: a healthy sunlit bus. The number to watch is the battery on the next eclipse, not any of these three now',
              'The battery is discharging: 92 % is below full and the bus is a volt above nominal, so a cell is failing',
              'The array is undersized: 18.5 A at 28 V is only 518 W and a relay of this size needs more',
              'Nothing on its own: EPS telemetry only means something against the previous contact',
            ],
            correctIndex: 0,
            explanation:
              'Voltage says the regulator is holding the bus; state of charge says the battery is where a sunlit bird keeps it; array current says the sun is on the panels and the load is covered. Three numbers, one picture. The interesting one is the battery at the bottom of the next eclipse.',
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
      id: 'read-the-thermal',
      nice: ['K1032', 'S0648'],
      title: 'Read the Thermal Picture',
      description: 'TCS: battery temperature and the TWTA baseplate. Read both nominal on the Telemetry tab and say which one would move first if something were wrong.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-the-power-bus'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Battery Temperature Read Nominal',
          params: { channelId: 'batt-t', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'TWTA Temperature Read Nominal',
          params: { channelId: 'twta-t', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'TCS Understood',
          params: {
            question: 'Battery 21 degC with a 32 degC yellow limit; TWTA baseplate 58 degC with a 75 degC yellow limit. Which is the one to watch, and why?',
            options: [
              'The battery: its limits are tight because a lithium cell above 32 degC ages fast and above 40 is a fire risk, and a stuck heater moves it slowly enough to miss between contacts. The TWTA runs hot by design',
              'The TWTA: 58 degC is already three-quarters of the way to its limit and an amplifier failure takes the whole payload',
              'Neither: both are inside limits, and a thermal problem on a GEO bird announces itself with a red badge',
              'Both equally: any channel that moves is the one to watch',
            ],
            correctIndex: 0,
            explanation:
              'Read a limit as the distance to harm, not as a fraction. The TWTA is designed to live at 58 and its limit is a long way off; the battery lives at 21 and eleven degrees of headroom is a stuck heater and a missed contact away. Slow channels with tight limits are the ones you write down.',
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
      id: 'read-attitude-and-comm',
      nice: ['K1032', 'S0648'],
      title: 'Read Attitude and Comms',
      description: 'ADCS and COMM: reaction wheel 1 and the TP-T1 output power. Read both nominal and say what a wheel speed is actually telling you.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-the-thermal'],
      conditions: [
        {
          type: 'telemetry-channel-in-band',
          description: 'Reaction Wheel Speed Read Nominal',
          params: { channelId: 'wheel-rpm', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'telemetry-channel-in-band',
          description: 'Transponder Output Power Read Nominal',
          params: { channelId: 'tp-pwr', telemetryBand: 'green', requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'ADCS Understood',
          params: {
            question: 'Reaction wheel 1 at 3200 rpm, sun sensor error 0.05 deg, transponder output 42 dBm. What is the wheel speed telling you?',
            options: [
              'Stored momentum: a wheel spins to hold the bird still against the torques on it, and a speed that climbs contact after contact is momentum that will need a dump. 3200 in the middle of the band is a bird at rest',
              'Pointing accuracy: the faster the wheel, the tighter the pointing, and 3200 rpm is why the sun error is small',
              'A fault: a reaction wheel should be at rest on a stationary GEO bird; 3200 rpm means it is fighting something',
              'Nothing unless it changes: wheel speed is a housekeeping channel with no operational meaning',
            ],
            correctIndex: 0,
            explanation:
              "The wheel is the attitude system's bank account. Its speed is how much momentum the bird has had to absorb, and the trend across contacts is the number that says when a momentum dump is due. The sun error says the pointing is good; the wheel says how hard the bird is working to keep it that way.",
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
      nice: ['S0648', 'T0153', 'K1032'],
      title: 'Call the State of Health',
      description: 'Every channel green on fresh frames. Read the whole panel on the Telemetry tab, then give RAMPART the state-of-health call for the log.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['read-attitude-and-comm'],
      conditions: [
        {
          id: 'soh-seen',
          type: 'telemetry-soh-nominal',
          description: 'State of health read on Telemetry',
          params: { requiresObservation: true, observationTab: 'telemetry' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'State of Health',
          params: {
            character: Character.SYSTEM,
            prompt: 'RAMPART: "SANDSTORM, TALON-2 state of health for the 0210 contact?" What do you call?',
            evidence: ['soh-seen'],
            decisionOptions: [
              {
                label: 'Nominal - every channel inside yellow limits on fresh frames, stream LIVE. Logged; proceeding to the housekeeping dump',
                correctWhen: {
                  all: [
                    { fact: 'soh-yellow-limit', is: false },
                    { fact: 'telemetry-stale', is: false },
                  ],
                },
                consequence: { log: 'TALON-2 state of health called NOMINAL on fresh frames' },
              },
              {
                label: 'Degraded - a channel is in its yellow band. Holding the command until Rotterdam concurs',
                correctWhen: { fact: 'soh-yellow-limit', is: true },
                consequence: { log: 'TALON-2 state of health called DEGRADED' },
                feedback: 'Every badge on the panel reads NOMINAL. A degraded call on a green panel is a call you did not read.',
              },
              {
                label: 'Unknown - the stream is stale. Re-acquiring before I call anything',
                correctWhen: { fact: 'telemetry-stale', is: true },
                consequence: { log: 'TALON-2 state of health called UNKNOWN - stale stream' },
                feedback: 'The link badge reads LIVE and the frame counter is climbing. Stale is a fact about the stream, not a way to avoid the call.',
              },
              {
                label: 'Nominal by default - no red badges, so nothing to report',
                feedback:
                  'No red badges is not a state of health. Nominal means every channel inside its limits on frames that arrived just now - which happens to be true, and is what you say when it is.',
              },
            ],
            explanation:
              'A state-of-health call is a claim about fresh frames inside limits, made after reading them. Tonight that claim is true. The discipline is that "nominal" and "no red badges" are different sentences, and only one of them goes in the log.',
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
      nice: ['T1567', 'K0737'],
      title: 'Arm the TT&C Uplink',
      description:
        'TX Chain: modem 1 carries the 1125 MHz jam tune. Retune it to the 1200 MHz TT&C IF - 8200 MHz through the 7000 MHz BUC LO - and leave the HPA disabled until the window.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['call-state-of-health'],
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'Modem 1 on 1200 MHz (8200 MHz RF)',
          params: { modemNumber: 1, frequency: 1200e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'housekeeping-dump',
      nice: ['T1567', 'K1032', 'S0421'],
      title: 'Housekeeping Dump',
      description: 'Window opens at T+10:00. HPA up, key modem 1, send HK-DUMP from the TT&C console and confirm the ACK. One command, inside the window, on the right carrier.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['arm-the-uplink'],
      conditions: [
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
        {
          type: 'command-acknowledged',
          description: 'HK-DUMP Acknowledged',
          params: { commandId: 'HK-DUMP' },
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
      description: 'ACK in hand. Un-key modem 1 and disable the HPA. The chain goes back to cold before the log entry, not after.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['housekeeping-dump'],
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
      description: 'The contact log line for RAMPART: what was read, what was called, what was sent, what came back, and the state the chain was left in.',
      groundStation: 'SS-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      conditions: [
        {
          type: 'status-check',
          description: 'Contact Logged',
          params: {
            question: 'Which line goes in the TALON-2 contact log?',
            options: [
              '0210Z contact SANDSTORM (backup). Telemetry acquired on the monitor aperture, stream LIVE; EPS/TCS/ADCS/COMM/OBC all nominal on fresh frames; SOH NOMINAL called. HK-DUMP sent 8200 MHz, ACK. Chain safed. Handed back to RAMPART',
              'TALON-2 contact complete, no issues, spacecraft healthy',
              'Backup contact flown while the primary terminal was down; SANDSTORM confirms TALON-2 is fine and the jam chain was not used',
              '0210Z: one command sent and acknowledged; telemetry looked normal',
            ],
            correctIndex: 0,
            explanation:
              'Where the telemetry came from, what state the stream was in, what was read subsystem by subsystem, what was called, what was sent and what came back, and how the chain was left. The next operator reads that line before they touch anything.',
            character: Character.SYSTEM,
            pointPenalty: 2,
            documentSection: 'Contact',
            documentLine:
              '0210Z TALON-2 backup contact, SANDSTORM. Monitor aperture on 166/50, receiver 3 on 1625 MHz IF, telemetry LIVE. EPS bus 28.1 V / SOC 92 %; TCS batt 21 degC / TWTA 58 degC; ADCS wheel 3200 rpm; COMM TP-T1 42 dBm; OBC 34 % - all nominal. SOH NOMINAL. HK-DUMP 8200 MHz ACK. Chain safed (HPA off, modem 1 un-keyed). Handed back to RAMPART.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
  ],
};
