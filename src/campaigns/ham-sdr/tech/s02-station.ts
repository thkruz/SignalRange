/**
 * @file s02-station - Station fixture for C3 Technician S2 "Power on the Bench"
 * @description A covered, current-limited 12.0 V practice board and a multimeter. No radio.
 * Fixtures (match the S2 mission brief):
 * - supply 12.0 V; R1 120 ohm 2 W; R2 470 ohm; LED forward drop 2.0 V; F1 0.5 A
 * - test points tp-supply+, tp-supply-, tp-f1-in, tp-f1-out, tp-sw1-in, tp-sw1-out, tp-r1-a,
 *   tp-r1-b, tp-q1-out, tp-led-a, tp-led-k, tp-gnd; break points supply-feed, r1-branch, led-branch
 * - baseline fault: an open contact in SW1's R1-branch path (`sw1-contact`). The board starts
 *   powered with the SW1 lever off. With the lever on, the LED branch (driven by Q1) lights, but
 *   the R1 branch carries no current, so a series meter at r1-branch reads 0 A against the
 *   predicted 0.10 A. That mismatch is what sends the student looking for the open branch.
 * - with power off and the lever on, continuity from tp-sw1-in to tp-sw1-out reads about 2.7 kOhm
 *   through the LED branch instead of beeping, which locates the open contact. Repair needs the
 *   board powered down (deenergizeToRepair). Post-repair: r1-branch about 0.10 A, led-branch about
 *   0.021 A.
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import { getAssetUrl } from '@app/utils/asset-url';

const fig = (name: string): string => getAssetUrl(`/assets/campaigns/home-sdr/figures/${name}`);

export const S02_SYMBOL_ANSWER = {
  resistor: 'R1, the 120 ohm resistor',
  capacitor: 'C1, the capacitor',
  inductor: 'L1, the coil',
  diode: 'D1, the diode',
  'switch-spst': 'SW1, the switch',
  battery: 'BT1, the battery',
} as const;

const symbolsSheet: Worksheet = {
  id: 's02-symbols',
  title: 'Match the circuit symbols',
  prompt: 'Match each schematic symbol to the part on the board. Figure T-1 shows how the official exam drawings use the same symbols.',
  figureUrl: fig('figure-T1.jpg'),
  fields: [
    {
      id: 'parts',
      label: 'Symbols to parts',
      kind: 'match',
      options: Object.values(S02_SYMBOL_ANSWER),
      answer: { ...S02_SYMBOL_ANSWER },
    },
  ],
  explanation: 'Every part has one standard symbol, so a drawing means the same thing on any board or radio.',
  wrongFeedback: { parts: 'Check the symbol shapes against the part labels printed on the board.' },
};

const selectSheet: Worksheet = {
  id: 's02-select',
  title: 'Select the meter function',
  prompt: 'You want to know how much voltage the test supply is delivering. Which meter setting and red-lead socket do you need?',
  fields: [
    {
      id: 'setup',
      label: 'Meter setup',
      kind: 'choice',
      options: ['DC voltage, red lead in the VΩ socket', 'DC current, red lead in the A socket', 'Continuity, red lead in the VΩ socket'],
      answer: 'DC voltage, red lead in the VΩ socket',
    },
  ],
  explanation:
    'Voltage is measured across two points, so the meter goes in parallel on the DC voltage setting. The A socket is for current and would put a near-short across the supply.',
  wrongFeedback: { setup: 'A voltage reading needs the voltage setting and the VΩ socket. The A socket is only for current in series.' },
};

const predictSheet: Worksheet = {
  id: 's02-predict',
  title: 'Predict the branch current',
  prompt: 'The R1 branch puts a 120 ohm resistor across the 12.0 V supply. Calculate the current and the power it dissipates.',
  fields: [
    { id: 'current', label: 'Current (A)', kind: 'number', answer: 0.1, tolerance: 0.005 },
    { id: 'power', label: 'Power (W)', kind: 'number', answer: 1.2, tolerance: 0.05 },
  ],
  explanation: 'Current is voltage divided by resistance: 12 V / 120 ohm = 0.10 A. Power is voltage times current: 12 V x 0.10 A = 1.2 W, inside the 2 W rating.',
  wrongFeedback: { current: 'Use I = E / R with 12 V and 120 ohms.', power: 'Use P = E x I with the current you just found.' },
};

const familiesSheet: Worksheet = {
  id: 's02-families',
  title: 'Compare the circuit families',
  prompt: 'Use the board diagram to answer each question.',
  fields: [
    { id: 'series', label: 'R1 and the SW1 contact share one path, so they are connected in', kind: 'choice', options: ['series', 'parallel'], answer: 'series' },
    {
      id: 'branches',
      label: 'The R1 branch and the LED branch both connect across the supply, so they are in',
      kind: 'choice',
      options: ['series', 'parallel'],
      answer: 'parallel',
    },
    { id: 'capacitor', label: 'A capacitor stores energy in', kind: 'choice', options: ['an electric field', 'a magnetic field'], answer: 'an electric field' },
    { id: 'inductor', label: 'An inductor stores energy in', kind: 'choice', options: ['an electric field', 'a magnetic field'], answer: 'a magnetic field' },
    { id: 'diode', label: 'A diode used to turn AC into DC performs', kind: 'choice', options: ['rectification', 'regulation'], answer: 'rectification' },
    { id: 'regulator', label: 'A circuit that holds supply voltage steady performs', kind: 'choice', options: ['rectification', 'regulation'], answer: 'regulation' },
  ],
  explanation:
    'Series parts share one path and one current. Parallel branches share the same voltage. Capacitors and inductors store energy in electric and magnetic fields. Diodes rectify and regulators steady the voltage.',
};

export const s02Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 102,
  operator: { license: 'none', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Bench', description: 'Workbench with the practice board and meter', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [{ id: 'board', kind: 'circuit-board', label: 'Practice board', location: 'bench', board: true, powered: true }],
  connections: [],
  faults: [
    {
      id: 'sw1-contact',
      target: 'board',
      kind: 'open-switch-contact',
      inspectClue: 'One contact inside SW1 is open: the lever moves, but the R1 branch never completes.',
      clearedBy: { action: 'repair' },
      deenergizeToRepair: true,
    },
  ],
  emitters: [],
  worksheets: [symbolsSheet, selectSheet, predictSheet, familiesSheet],
  hints: {
    'match-circuit-symbols': [
      'Open Notebook for the symbols worksheet, then look at the board diagram in the mission brief. Each drawing has a part with the same label on the board.',
      'Click the practice board and use Look closely to see the part labels. Match by the label (R1, C1, L1, D1), not by where the part sits.',
    ],
    'select-meter-function': [
      'Click the meter and read its dial and sockets. The worksheet asks what to measure and which socket the red lead belongs in.',
      'Supply voltage is a DC voltage reading. Pick the DC voltage function on the dial, and use the socket marked for voltage.',
    ],
    'measure-test-supply': [
      'Click the board and open its test points. Put the red probe on the supply plus point and the black probe on the supply minus point.',
      'For the second reading, swap the two probes. A minus sign only means the leads are the other way round.',
    ],
    'predict-branch-current': [
      'Work it out on the Notebook worksheet first. Current comes from the supply voltage and the R1 value on the board card.',
      'To measure it, the meter has to sit in the path of the current. Move the red lead to the A socket, close SW1, and use the R1 branch break point.',
    ],
    'find-open-branch': [
      'Switch the board off from its panel, then read the supply test points. A meter on a dead supply should read about zero.',
      'Leave SW1 on. Use the continuity function with one probe on each side of the SW1 contact. No beep means the path is open there.',
    ],
    'restore-indicator-circuit': [
      'Click the board and press Look closely. The clue names the part that failed.',
      'Repair the contact with the board switched off. Then power it back on and read both branches in series, the same way as before.',
    ],
    'compare-circuit-families': ['Open the families worksheet in Notebook and keep the board diagram beside it. Each question points at one part of the drawing.'],
  },
  cards: [
    {
      id: 's02-board-card',
      title: 'Practice board card',
      body: 'Supply 12.0 V, current-limited. R1 is 120 ohms, 2 W. Test points: SUP+, SUP-, F1 IN, F1 OUT, SW1 IN, SW1 OUT, R1 A, R1 B, Q1 OUT, LED A, LED K, GND. Break points: SUPPLY FEED, R1 BRANCH, LED BRANCH.',
    },
  ],
};
