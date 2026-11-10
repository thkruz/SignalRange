/**
 * @file s10-station - Station fixture for C3 Technician S10 "Beyond the Local Horizon"
 * @description The club's borrowed HF transceiver at Riley's, on a known-good ten-meter dipole.
 * Fixtures (match the S10 mission brief; all stations are simulation fixtures):
 * - Technician phone segment 28.300 to 28.500 MHz, operating frequency 28.400 MHz USB, low power
 * - the rig starts on 28.250 MHz LSB with a wide filter, which is the wrong place for voice
 * - K0LCL is a local USB net on 28.380 MHz; W0OFF on 28.420 MHz sits 700 Hz high, so only RIT
 *   makes it intelligible while the transmit frequency stays on the dial (separate channels avoid collisions with the 28.400 MHz contact)
 * - W0SRC (Sam) is a distant USB station on 28.400 MHz reached by a daytime F2 path, open at the
 *   authored scenario time; CW (28.060 W0XQT) and FT8 (28.074 N0FTX) examples are emitted by the HF module
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import { conn } from './s09-12-helpers';

export const S10_RIT_OFFSET_HZ = 700;

const segmentSheet: Worksheet = {
  id: 's10-segment',
  title: 'Read the band and privilege card',
  prompt: 'Use the Technician privilege card for ten meters. A USB voice signal occupies the 2.8 kHz above the dial frequency.',
  fields: [
    { id: 'low', label: 'Lowest frequency (MHz) of the Technician phone segment', kind: 'number', answer: 28.3, tolerance: 0.0005 },
    { id: 'high', label: 'Highest frequency (MHz) of the Technician phone segment', kind: 'number', answer: 28.5, tolerance: 0.0005 },
    { id: 'maxDial', label: 'Highest USB dial frequency (MHz) that keeps the whole 2.8 kHz signal inside the segment', kind: 'number', answer: 28.4972, tolerance: 0.0004 },
    {
      id: 'below',
      label: 'You hear voice on 28.250 MHz. May a Technician transmit voice there?',
      kind: 'choice',
      options: ['No, that part of the band is for CW and data', 'Yes, any frequency on ten meters allows voice', 'Yes, if the power is low'],
      answer: 'No, that part of the band is for CW and data',
    },
  ],
  explanation: 'Technician voice privileges on ten meters are 28.300 to 28.500 MHz. A USB signal reaches 2.8 kHz above the dial, so the dial stops at 28.4972 MHz.',
  wrongFeedback: {
    low: 'Read the phone row of the privilege card.',
    high: 'Read the phone row of the privilege card.',
    maxDial: 'Subtract the 2.8 kHz of occupied bandwidth from the upper segment edge.',
    below: 'Check which row of the card covers that frequency.',
  },
};

const propagationSheet: Worksheet = {
  id: 's10-propagation',
  title: 'Match the propagation examples',
  prompt: 'Match each path name to what the example shows.',
  fields: [
    {
      id: 'paths',
      label: 'Propagation examples',
      kind: 'match',
      options: ['Line of sight', 'Ionospheric path', 'Sporadic E', 'Ducting', 'Radio horizon'],
      answer: {
        'Line of sight': 'A direct path between two antennas that see each other',
        'Ionospheric path': 'A signal refracted back by a charged layer high above the ground',
        'Sporadic E': 'A short-lived patch of dense ionization that opens a distant path',
        Ducting: 'A layer of air near the ground that guides a VHF signal far beyond the horizon',
        'Radio horizon': 'The distance at which the curve of the Earth blocks a direct path',
      },
    },
  ],
  explanation: 'A direct path ends at the radio horizon. The ionosphere and sporadic E bend signals back to the ground, and ducting traps VHF signals in a layer of air.',
  wrongFeedback: { paths: 'Decide whether each example needs the ionosphere, the lower air, or only a clear straight line.' },
};

const allowedSheet: Worksheet = {
  id: 's10-allowed',
  title: 'Place the examples on the band chart',
  prompt: 'You heard CW on 28.060 MHz and an FT8 signal on 28.074 MHz. Answer from the band chart.',
  fields: [
    {
      id: 'cw',
      label: 'Which Technician privilege covers the CW signal on 28.060 MHz?',
      kind: 'choice',
      options: ['CW is allowed there, in the segment below 28.300 MHz', 'Voice is allowed there', 'Nothing is allowed there for Technicians'],
      answer: 'CW is allowed there, in the segment below 28.300 MHz',
    },
    {
      id: 'ft8',
      label: 'Is the FT8 signal on 28.074 MHz a voice mode?',
      kind: 'choice',
      options: ['No, it is a narrow digital mode in the data segment', 'Yes, it is a voice mode', 'It is a CW signal'],
      answer: 'No, it is a narrow digital mode in the data segment',
    },
  ],
  explanation: 'The bottom of ten meters holds CW and digital signals. Voice belongs in the phone segment from 28.300 MHz up.',
  wrongFeedback: { cw: 'Look at the segment that starts at 28.000 MHz on the chart.', ft8: 'FT8 is a digital mode sent as tones.' },
};

export const s10Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 110,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: "Riley's shack", description: 'Borrowed HF transceiver on the shack desk', position: { xKm: 0, yKm: 0, heightM: 10 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 10 },
  devices: [
    {
      id: 'hf',
      kind: 'hf-rig',
      label: 'Borrowed HF transceiver',
      location: 'bench',
      profileId: 'loaner-hf',
      powered: true,
      radio: { vfoMHz: 28.25, mode: 'LSB', filterHz: 6000, txPowerW: 5, squelch: 0 },
    },
    {
      id: 'hf-coax',
      kind: 'coax',
      label: 'HF feedline',
      location: 'bench',
      coax: { type: 'rg8x', length: 10, unit: 'm', endA: { family: 'BNC', gender: 'plug' }, endB: { family: 'UHF', gender: 'plug' } },
    },
    { id: 'hf-dipole', kind: 'antenna', label: 'Ten-meter dipole', location: 'bench', antenna: { kind: 'ten-meter-dipole' } },
  ],
  connections: [conn('h1', 'hf', 'ant', 'hf-coax', 'a'), conn('h2', 'hf-coax', 'b', 'hf-dipole', 'in')],
  faults: [],
  emitters: [
    {
      id: 's10-local-net',
      label: 'K0LCL local net',
      freqMHz: 28.38,
      mode: 'USB',
      erpDbm: 30,
      position: { xKm: 8, yKm: 3, heightM: 10 },
      polarization: 'H',
      payload: { kind: 'voice', text: 'K0LCL on the local ten meter net, anyone listening on twenty eight three eighty', callsign: 'K0LCL' },
    },
    {
      id: 's10-offset-voice',
      label: 'W0OFF, 700 Hz high',
      freqMHz: 28.42 + S10_RIT_OFFSET_HZ / 1e6,
      mode: 'USB',
      erpDbm: 30,
      position: { xKm: 12, yKm: 5, heightM: 10 },
      polarization: 'H',
      payload: { kind: 'voice', text: 'This is W0OFF testing, I am a few hundred hertz off your dial', callsign: 'W0OFF' },
    },
  ],
  hf: {
    schedule: [],
    defaultCondition: 'open',
    stations: [{ id: 'w0src', callsign: 'W0SRC', name: 'Sam', grid: 'EM38', position: { xKm: 1500, yKm: 200, heightM: 12 }, freqMHz: 28.4, erpDbm: 46, replyDelayS: 3 }],
  },
  worksheets: [segmentSheet, propagationSheet, allowedSheet],
  cards: [
    {
      id: 's10-privileges',
      title: 'Band and privilege card',
      body: 'Technician ten meters: 28.000 to 28.300 MHz CW and data, 28.300 to 28.500 MHz CW and SSB voice. A USB signal occupies the 2.8 kHz above the dial frequency, so keep the whole signal inside the segment.',
    },
    {
      id: 's10-exchange',
      title: 'Contact card',
      body: 'Practice on the local net at 28.380 MHz and the offset station at 28.420 MHz. For the contact, listen first, then call CQ on 28.400 MHz USB at low power, answer W0SRC with your signal report, and identify with KF0SRT before you end.',
    },
  ],
  hints: {
    'check-segment': 'Read the phone row of the privilege card, then work out where a 2.8 kHz wide signal has to stop.',
    'set-mode-and-filter': 'Voice on ten meters uses the upper sideband, and the filter should match the width of a voice signal.',
    'tune-with-rit': 'RIT moves the receive frequency only. Use it on the station that sounds off pitch, then key up and check where you are transmitting.',
    'read-propagation': 'Compare the examples by what carries the signal beyond the horizon: nothing, the ionosphere, or the lower air.',
    'make-hf-contact': 'Listen on 28.400 MHz first. Call CQ at low power, answer the report, and identify.',
    'compare-modes': 'CW and digital signals sit below 28.300 MHz. Tune each one in and compare the bandwidth.',
    'reject-band-edge': 'Try 28.498 MHz on USB and read why the radio refuses. Then pick a dial frequency that fits.',
  },
};
