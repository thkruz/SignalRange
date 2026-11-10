/**
 * @file s01-station - Station fixture for C3 Technician S1 "The First Signal"
 * @description Receive-only bench: USB SDR into a laptop through an SMA adapter, a short coax and a
 * simple vertical. Fixtures (match the S1 mission brief):
 * - training signal: 146.550 MHz FM, "W0SRC" club training transmission, 15 kHz preset filter
 * - the SDR boots on 146.200 MHz with a 25 kHz filter and squelch at 10, so the signal is not
 *   heard until the player tunes, narrows the filter and opens the squelch
 * - the SMA connector at the SDR is partly seated (fault `loose-sma`); seating needs the SDR
 *   powered down (`seatRequiresPowerOff`)
 * - the USB cable starts unplugged; the player connects `sdr.usb` to `laptop.usb1`
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S01_MESSAGE = 'Club training net tonight at seven, check in on one four six five five zero';

const traceSheet: Worksheet = {
  id: 's01-trace',
  title: 'Trace the receive path',
  prompt: 'Match each part of the bench to the job it does between the air and the laptop.',
  fields: [
    {
      id: 'order',
      label: 'Receive path',
      kind: 'match',
      options: [
        'Shows the waterfall and plays the audio',
        'Captures the radio wave',
        'Turns radio signals into data',
        'Carries the signal to the receiver',
        'Changes the connector style',
      ],
      answer: {
        Antenna: 'Captures the radio wave',
        'Coax jumper': 'Carries the signal to the receiver',
        'SMA adapter': 'Changes the connector style',
        'USB SDR': 'Turns radio signals into data',
        Laptop: 'Shows the waterfall and plays the audio',
      },
    },
  ],
  explanation: 'The signal enters at the antenna, travels down the coax and adapter, is digitised by the SDR, and the laptop displays and decodes it.',
  wrongFeedback: { order: 'Follow the signal in the order it travels, from the air to your ears.' },
};

const messageSheet: Worksheet = {
  id: 's01-message',
  title: 'Record the message',
  prompt: 'Which sentence matches what the training transmission said?',
  fields: [
    {
      id: 'text',
      label: 'Received message',
      kind: 'choice',
      options: [S01_MESSAGE, 'Club picnic is cancelled, no net tonight', 'Repeater is down for maintenance until Friday'],
      answer: S01_MESSAGE,
    },
  ],
  explanation: 'The transcript shows the club training net announcement. Writing down what you heard is the first habit of a good log.',
  wrongFeedback: { text: 'Listen again and compare each word of the transcript with the options.' },
};

export const s01Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 101,
  operator: { license: 'none', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Bench', description: 'Workbench with the receiver and laptop', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  seatRequiresPowerOff: true,
  devices: [
    { id: 'laptop', kind: 'laptop', label: 'Laptop', location: 'bench', powered: true },
    {
      id: 'sdr',
      kind: 'sdr',
      label: 'USB SDR receiver',
      location: 'bench',
      profileId: 'usb-sdr',
      powered: true,
      radio: { vfoMHz: 146.2, mode: 'FM', filterHz: 25000, squelch: 10, volume: 5 },
    },
    { id: 'sdr-adapter', kind: 'adapter', label: 'SMA adapter', location: 'bench' },
    { id: 'sdr-coax', kind: 'coax', label: 'Short coax jumper', location: 'bench', coax: { type: 'rg58', length: 3, unit: 'm' } },
    { id: 'sdr-ant', kind: 'antenna', label: 'Simple vertical antenna', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
  ],
  connections: [
    { id: 'sdr-sma', a: { deviceId: 'sdr', portId: 'ant' }, b: { deviceId: 'sdr-adapter', portId: 'a' }, seated: false },
    { id: 'sdr-adp-coax', a: { deviceId: 'sdr-adapter', portId: 'b' }, b: { deviceId: 'sdr-coax', portId: 'a' }, seated: true },
    { id: 'sdr-feed', a: { deviceId: 'sdr-coax', portId: 'b' }, b: { deviceId: 'sdr-ant', portId: 'in' }, seated: true },
  ],
  faults: [
    {
      id: 'loose-sma',
      target: 'sdr-sma',
      kind: 'loose-connector',
      inspectClue: 'The SMA plug at the receiver is only finger-loose: the nut has not been threaded onto the adapter.',
      clearedBy: { action: 'seat' },
    },
  ],
  emitters: [
    {
      id: 'training',
      label: 'Club training transmission',
      freqMHz: 146.55,
      mode: 'FM',
      erpDbm: -13,
      position: { xKm: 8, yKm: 0, heightM: 20 },
      polarization: 'V',
      payload: { kind: 'voice', text: S01_MESSAGE, callsign: 'W0SRC' },
    },
  ],
  worksheets: [traceSheet, messageSheet],
  cards: [
    {
      id: 's01-receive-chain',
      title: 'Receive chain',
      body: 'Antenna, coax, adapter, SDR, USB cable, laptop. A weak link anywhere in the chain costs signal before the receiver ever sees it.',
    },
  ],
};
