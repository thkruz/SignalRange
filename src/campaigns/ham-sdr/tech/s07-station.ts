/**
 * @file s07-station - Station fixture for C3 Technician S7 "It Only Fails When I Transmit"
 * @description Mobile radio on a bench supply through a worn DC lead. Fixtures (match the S7 brief):
 * - supply 13.8 V; lead loop resistance 0.30 ohm (worn) versus 0.03 ohm (good); the radio resets below 11.5 V
 * - radio set to 50 W: it draws about 1 A receiving and about 8 A transmitting
 * - at 8 A the worn lead drops 2.4 V, so the radio sees about 11.4 V while the supply terminals still read 13.8 V
 * - DC test points: psu+, psu-, lead-mid, radio+, radio-
 * - the radio starts into a dummy load; the outdoor antenna feed line waits unconnected at one end
 * - the remote station is Riley (KD0RLY), simplex on 146.550
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S07_FAULT_ID = 'worn-dc-lead';
export const S07_RESET_V = 11.5;

const dropSheet: Worksheet = {
  id: 's07-drop',
  title: 'Where did the voltage go?',
  prompt:
    'While transmitting, the radio draws about 8 A. The lead between the supply and the radio has about 0.30 ohm of resistance. Work out the voltage lost in the lead (voltage = current times resistance).',
  fields: [
    { id: 'drop', label: 'Voltage lost in the lead (V)', kind: 'number', answer: 2.4, tolerance: 0.15 },
    {
      id: 'culprit',
      label: 'Which part is the problem?',
      kind: 'choice',
      options: ['The DC lead has too much resistance', 'The supply cannot make 13.8 V', 'The antenna is mismatched', 'The microphone is faulty'],
      answer: 'The DC lead has too much resistance',
    },
  ],
  explanation:
    '8 A times 0.30 ohm is 2.4 V. The supply terminals still show 13.8 V, but the radio only gets 13.8 minus 2.4, about 11.4 V, which is below its reset point. The loss happens only while current flows, so an unloaded reading cannot show it.',
  wrongFeedback: {
    drop: 'Multiply the current in amps by the resistance in ohms.',
    culprit: 'The supply reads fine at its own terminals. Look for where the voltage disappears between the supply and the radio.',
  },
};

const enduranceSheet: Worksheet = {
  id: 's07-endurance',
  title: 'Portable endurance estimate',
  prompt:
    'A portable setup uses a 10 Ah battery. The radio draws about 1 A receiving and about 8 A transmitting, and you transmit 20 percent of the time. Work out the average current and how many hours the battery lasts.',
  fields: [
    { id: 'avg', label: 'Average current (A)', kind: 'number', answer: 2.4, tolerance: 0.15 },
    { id: 'hours', label: 'Battery life (hours)', kind: 'number', answer: 4.17, tolerance: 0.3 },
    {
      id: 'why',
      label: 'Why does the radio draw far more DC power than its RF output?',
      kind: 'choice',
      options: [
        'The transmitter is not 100 percent efficient, so the rest becomes heat',
        'The antenna stores the extra power',
        'The battery meter reads high',
        'RF power is measured in different units',
      ],
      answer: 'The transmitter is not 100 percent efficient, so the rest becomes heat',
    },
  ],
  explanation:
    'Average current is 0.2 times 8 A plus 0.8 times 1 A, which is 2.4 A. A 10 Ah battery then lasts 10 divided by 2.4, about 4.2 hours. The DC input is higher than the RF output because part of it is lost as heat in the transmitter.',
  wrongFeedback: {
    avg: 'Weight each current by the share of time spent in that state, then add them.',
    hours: 'Divide the battery capacity in amp-hours by the average current.',
    why: 'Think about what happens to the power that does not leave the antenna.',
  },
};

export const s07Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 707,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Bench', description: 'Bench with the mobile radio and its power supply', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [
    { id: 'mobile', kind: 'mobile', label: 'Mobile radio', location: 'bench', profileId: 'dual-band-mobile', powered: true, radio: { vfoMHz: 146.55, mode: 'FM', txPowerW: 50 } },
    { id: 'psu', kind: 'power-supply', label: '13.8 V supply and DC lead', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
    { id: 'feed', kind: 'coax', label: 'Antenna feed line (5 m)', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' } },
    { id: 'outdoor-ant', kind: 'antenna', label: 'Outdoor vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
  ],
  connections: [
    { id: 'mob-dummy', a: { deviceId: 'mobile', portId: 'ant' }, b: { deviceId: 'dummy', portId: 'in' }, seated: true },
    { id: 'feed-ant', a: { deviceId: 'feed', portId: 'b' }, b: { deviceId: 'outdoor-ant', portId: 'in' }, seated: true },
  ],
  faults: [
    {
      id: S07_FAULT_ID,
      target: 'psu',
      kind: 'high-resistance-lead',
      inspectClue: 'The DC lead is thin, its insulation is warm to the touch, and one crimp has gone dull and green. The fuse holder is fine.',
      clearedBy: { action: 'repair' },
      deenergizeToRepair: true,
    },
  ],
  emitters: [],
  remoteStations: {
    stations: [
      {
        id: 'riley',
        callsign: 'KD0RLY',
        name: 'Riley',
        location: 'across town',
        grid: 'EN34',
        position: { xKm: 6, yKm: 2, heightM: 15 },
        freqMHz: 146.55,
        mode: 'FM',
        erpDbm: 37,
        replyDelayS: 3,
        personality: ['Good to hear you. Go ahead whenever you are ready.'],
      },
    ],
  },
  worksheets: [dropSheet, enduranceSheet],
  cards: [
    {
      id: 's07-measure-under-load',
      title: 'Measure under load',
      body: 'A supply can read 13.8 V with nothing drawn from it. Read the voltage at the radio while it transmits, because that is where it must stay above the reset point.',
    },
    {
      id: 's07-lead-repair',
      title: 'Repairing a power lead',
      body: 'Switch the supply off first. Replace the whole lead with one rated for the current, and keep the fuse in the positive lead close to the supply.',
    },
  ],
  hints: {
    'reproduce-reset': 'Key the radio for a few seconds into the dummy load and watch the station log for the reset.',
    'compare-probe-points': 'Take three readings: the supply terminals while transmitting, the radio terminals while receiving, and the radio terminals while transmitting.',
    'repair-lead': 'Power the supply off before you touch the lead, repair it, then power the supply and the radio back on.',
    'verify-transmit': 'Read the radio terminals while transmitting, then connect the antenna feed line and call Riley.',
  },
};
