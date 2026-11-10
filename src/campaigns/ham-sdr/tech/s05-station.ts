/**
 * @file s05-station - Station fixture for C3 Technician S5 "Build the Better Antenna"
 * @description Receive bench with an adjustable dipole and an antenna analyzer. Fixtures (match the S5 brief):
 * - target 146.550 MHz; a dipole resonates at f0 = 143 / (sum of the two element lengths in m)
 * - the dipole is assembled slightly long, 0.500 m per side (resonance 143 MHz), and starts horizontal
 * - the reference signal is vertically polarized, so a horizontal dipole loses signal to cross-polarization
 * - the feed line starts unconnected at the antenna; the analyzer replaces the SDR at the coax during sweeps
 * - exposure estimate: 5 W, 1.64 gain, 50 percent duty, 1 m, general-population limit 0.2 mW/cm2
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S05_TARGET_MHZ = 146.55;
export const S05_TOTAL_LENGTH_M = 0.976;
export const S05_REF_ID = 'reference';

const lengthSheet: Worksheet = {
  id: 's05-length',
  title: 'Starting dipole length',
  prompt: 'A half-wave dipole is about 143 divided by the frequency in MHz, in meters, for both elements together. Work out the starting length for 146.550 MHz.',
  fields: [
    { id: 'total', label: 'Total length, both elements (m)', kind: 'number', answer: 0.976, tolerance: 0.01 },
    { id: 'each', label: 'Length of each element (m)', kind: 'number', answer: 0.488, tolerance: 0.005 },
  ],
  explanation:
    '143 divided by 146.550 is 0.976 m for the whole dipole, so each element starts at 0.488 m. Cut a little long and trim, because you can shorten wire but not lengthen it.',
  wrongFeedback: {
    total: 'Divide 143 by the frequency in MHz. The answer comes out a little under one meter.',
    each: 'The dipole has two equal elements, so each one is half of the total.',
  },
};

const siteSheet: Worksheet = {
  id: 's05-site',
  title: 'Choose the antenna site',
  prompt: 'Match each candidate site to the right decision.',
  fields: [
    {
      id: 'sites',
      label: 'Candidate sites',
      kind: 'match',
      options: ['Reject: contact risk if it falls', 'Reject: not stable enough', 'Reject: space already in use', 'Use this site'],
      answer: {
        'Under the overhead power line': 'Reject: contact risk if it falls',
        'Wobbly fence post by the garage': 'Reject: not stable enough',
        'Occupied corner of the TV mast': 'Reject: space already in use',
        'Clear garden mast away from wires': 'Use this site',
      },
    },
  ],
  explanation:
    'An antenna has to be able to fall without touching a power line, it has to stay where you put it, and it needs its own space. Only the clear garden mast meets all three.',
  wrongFeedback: { sites: 'Ask of each site: could it touch a power line, can it hold still in wind, and is the space free?' },
};

const exposureSheet: Worksheet = {
  id: 's05-exposure',
  title: 'RF exposure estimate',
  prompt:
    'Radio output 5 W, antenna gain 1.64 (power ratio), frequency 146.550 MHz, voice duty about 50 percent, person 1 m away. Power density is power times gain divided by 4 pi times distance squared.',
  fields: [
    { id: 'limit', label: 'Limit for the general public (mW/cm2)', kind: 'choice', options: ['0.2', '1.0', '5.0'], answer: '0.2' },
    { id: 'density', label: 'Average power density at 1 m (mW/cm2)', kind: 'number', answer: 0.033, tolerance: 0.006 },
    { id: 'verdict', label: 'Is the estimate under the limit?', kind: 'choice', options: ['Yes, under the limit', 'No, over the limit'], answer: 'Yes, under the limit' },
  ],
  explanation:
    '5 W times 1.64 is 8.2 W. Spread over a 1 m sphere that is 0.65 W/m2, or 0.065 mW/cm2, and half of that on average is about 0.033 mW/cm2, well under the 0.2 mW/cm2 public limit.',
  wrongFeedback: {
    limit: 'The public (uncontrolled) limit near 146 MHz is the lower of the two published limits.',
    density: 'Multiply 5 W by 1.64, divide by 4 times pi times 1 squared, convert W/m2 to mW/cm2 (divide by 10), then take half for duty.',
    verdict: 'Compare your density with the limit you chose.',
  },
};

export const s05Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 505,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Bench and garden mast', description: 'Workbench with the receiver, analyzer and dipole kit', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [
    { id: 'laptop', kind: 'laptop', label: 'Laptop', location: 'bench', powered: true },
    {
      id: 'sdr',
      kind: 'sdr',
      label: 'USB SDR receiver',
      location: 'bench',
      profileId: 'usb-sdr',
      powered: true,
      radio: { vfoMHz: 146.55, mode: 'FM', filterHz: 15000, squelch: 0, volume: 5 },
    },
    { id: 'sdr-adapter', kind: 'adapter', label: 'SMA adapter', location: 'bench' },
    { id: 'dipole-coax', kind: 'coax', label: 'Dipole feed line (RG-58)', location: 'bench', coax: { type: 'rg58', length: 5, unit: 'm' } },
    {
      id: 'dipole',
      kind: 'antenna',
      label: 'Adjustable dipole',
      location: 'bench',
      antenna: { kind: 'adjustable-dipole', overrides: { elementLengthsM: [0.5, 0.5], orientation: 'horizontal' } },
    },
    { id: 'analyzer', kind: 'analyzer', label: 'Antenna analyzer', location: 'bench' },
  ],
  connections: [
    { id: 'sdr-usb', a: { deviceId: 'sdr', portId: 'usb' }, b: { deviceId: 'laptop', portId: 'usb1' }, seated: true },
    { id: 'sdr-sma', a: { deviceId: 'sdr', portId: 'ant' }, b: { deviceId: 'sdr-adapter', portId: 'a' }, seated: true },
    { id: 'adp-coax', a: { deviceId: 'sdr-adapter', portId: 'b' }, b: { deviceId: 'dipole-coax', portId: 'a' }, seated: true },
  ],
  faults: [
    {
      id: 'long-elements',
      target: 'dipole',
      kind: 'long-elements',
      value: S05_TARGET_MHZ,
      inspectClue: 'Both elements are cut about 1 cm per side longer than the starting length on purpose, so they can be trimmed to resonance.',
      clearedBy: { action: 'auto' },
    },
  ],
  emitters: [
    {
      id: S05_REF_ID,
      label: 'Club reference beacon (vertical)',
      freqMHz: S05_TARGET_MHZ,
      mode: 'FM',
      erpDbm: -10,
      position: { xKm: 0, yKm: 8, heightM: 20 },
      polarization: 'V',
      payload: { kind: 'voice', text: 'Club reference beacon, vertical polarization, one four six five five zero', callsign: 'W0SRC' },
    },
  ],
  worksheets: [lengthSheet, siteSheet, exposureSheet],
  cards: [
    {
      id: 's05-dipole-rule',
      title: 'Dipole length rule',
      body: 'Total length in meters is about 143 divided by the frequency in MHz. Shorter raises the resonant frequency. Trim both elements equally, a little at a time, and re-check with the analyzer.',
    },
    {
      id: 's05-polarization',
      title: 'Polarization',
      body: 'FM stations on 2 m use vertical polarization. A horizontal antenna loses a lot of signal against a vertical one, so match the antenna to what you want to hear.',
    },
  ],
  hints: {
    'calculate-length': 'Divide 143 by 146.550, then split the answer between the two elements.',
    'resonant-region': 'Disconnect the SDR end of the coax, connect the analyzer there, calibrate, sweep, shorten both elements equally, and sweep again.',
    'match-polarization': 'Reconnect the SDR, then record a reading with the dipole horizontal and another with it vertical.',
  },
};
