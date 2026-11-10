/**
 * @file s04-station - Station fixture for C3 Technician S4 "I Can Hear Them"
 * @description A 5 W handheld, a club repeater and a club-loaned DMR handheld.
 * Fixtures (match the S4 mission brief):
 * - repeater W0SRC: output 146.940 MHz, input 146.340 MHz (-600 kHz), access tone 100.0 Hz,
 *   club operator N0CLB "Pat" answers a call; no outage
 * - the handheld boots on 146.940 MHz with simplex offset and the 123.0 Hz transmit tone, so it
 *   hears the repeater clearly but its transmissions are not accepted: first the wrong input
 *   frequency (repeater:wrong-frequency), then the wrong tone (repeater:wrong-tone)
 * - DMR: repeater W0SRC-D output 442.100 MHz, input 447.100 MHz, color code 1, slot 2 carries
 *   talkgroup 31337 "Club Tech Net". The loaner HT carries three channels with the same name root:
 *   channel 1 has the wrong color code (no-talk-permit), channel 2 the wrong slot (tg-not-on-slot),
 *   channel 3 is correct. The analog handheld never gains DMR.
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import type { HamConnection } from '@app/ham/ham-types';
import { makeClubRepeaterConfig, RADIO_BOOT_TONE_HZ } from '@app/ham/ops/repeater';

export const S04_REPEATER_OUT_MHZ = 146.94;
export const S04_ACCESS_TONE_HZ = 100.0;
export const S04_MEMORY_SLOT = 3;
/** Good DMR channel on the loaner (index into the codeplug) */
export const S04_DMR_GOOD_INDEX = 2;

const directorySheet: Worksheet = {
  id: 's04-directory',
  title: 'Read the repeater entry',
  prompt: 'Copy the W0SRC entry from the club directory card. Your radio must match it exactly to use the repeater.',
  fields: [
    { id: 'output', label: 'Repeater output (the frequency you listen on), MHz', kind: 'number', answer: 146.94, tolerance: 0.0005 },
    { id: 'offset', label: 'Offset (your radio transmits on the repeater input)', kind: 'choice', options: ['-600 kHz', '+600 kHz', 'No offset'], answer: '-600 kHz' },
    { id: 'tone', label: 'Access tone your radio must send, Hz', kind: 'number', answer: 100.0, tolerance: 0.5 },
  ],
  explanation: 'A repeater listens on its input frequency, 600 kHz below its output here, and only relays a signal that carries its access tone.',
  wrongFeedback: {
    output: 'The output is the frequency the repeater transmits on, which is the one you hear.',
    offset: 'The entry lists the input 600 kHz below the output.',
    tone: 'Use the access tone from the entry, not the radio default.',
  },
};

const dmrSheet: Worksheet = {
  id: 's04-dmr',
  title: 'Read the digital card',
  prompt: 'Read the club digital card and copy the settings your loaner radio channel must match.',
  fields: [
    { id: 'cc', label: 'Color code', kind: 'number', answer: 1, tolerance: 0 },
    { id: 'slot', label: 'Time slot', kind: 'number', answer: 2, tolerance: 0 },
    { id: 'tg', label: 'Talkgroup (Club Tech Net)', kind: 'number', answer: 31337, tolerance: 0 },
  ],
  explanation: 'A digital repeater only passes your signal if the color code matches, and a talkgroup only works on the time slot it is routed on.',
  wrongFeedback: { cc: 'Read the color code from the card.', slot: 'Read the time slot from the card.', tg: 'Copy the talkgroup number exactly.' },
};

const conn = (id: string, a: [string, string], b: [string, string]): HamConnection => ({
  id,
  a: { deviceId: a[0], portId: a[1] },
  b: { deviceId: b[0], portId: b[1] },
  seated: true,
});
const ch = (name: string, colorCode: number, timeSlot: 1 | 2, talkgroup: number) => ({ name, rxMHz: 442.1, txMHz: 447.1, colorCode, timeSlot, talkgroup });

const { hears: _hears, playerCallsign: _playerCallsign, ...clubRepeater } = makeClubRepeaterConfig(() => ({ snrDb: 0, decoded: false }), 'KF0SRT');

export const s04Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 104,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Shack', description: 'Desk with a handheld and a club loaner radio', position: { xKm: 0, yKm: 0, heightM: 8 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 8 },
  devices: [
    {
      id: 'ht',
      kind: 'handheld',
      label: 'Dual-band handheld',
      location: 'bench',
      profileId: 'dual-band-ht',
      powered: true,
      radio: { vfoMHz: S04_REPEATER_OUT_MHZ, mode: 'FM', txPowerW: 5, squelch: 3, volume: 6, offset: 'simplex', txToneHz: RADIO_BOOT_TONE_HZ },
    },
    { id: 'ht-ant', kind: 'antenna', label: 'Supplied rubber-duck antenna', location: 'bench', antenna: { kind: 'rubber-duck' } },
    {
      id: 'dmr-ht',
      kind: 'dmr-handheld',
      label: 'Club loaner DMR handheld',
      location: 'bench',
      profileId: 'loaner-dmr-ht',
      powered: true,
      radio: { mode: 'DMR', codeplug: [ch('Club Tech Net 1', 2, 2, 31337), ch('Club Tech Net 2', 1, 1, 31337), ch('Club Tech Net 3', 1, 2, 31337)] },
    },
    { id: 'dmr-ant', kind: 'antenna', label: 'Loaner rubber-duck antenna', location: 'bench', antenna: { kind: 'rubber-duck' } },
  ],
  connections: [conn('ht-ant-jack', ['ht', 'ant'], ['ht-ant', 'in']), conn('dmr-ant-jack', ['dmr-ht', 'ant'], ['dmr-ant', 'in'])],
  faults: [],
  emitters: [],
  repeater: { ...clubRepeater, callsign: 'W0SRC' },
  dmr: {
    id: 'dmr-rptr',
    callsign: 'W0SRC',
    outputMHz: 442.1,
    inputMHz: 447.1,
    colorCode: 1,
    slots: { 1: [8, 3100], 2: [9, 31337] },
    position: { xKm: 4, yKm: 4, heightM: 80 },
    erpDbm: 47,
    remote: { id: 'dmr-user', callsign: 'KD0RLY', name: 'Riley', talkgroup: 31337, timeSlot: 2, replyDelayS: 2, lines: ['Copy you on Club Tech Net. Welcome to digital.'] },
  },
  worksheets: [directorySheet, dmrSheet],
  cards: [
    {
      id: 's04-directory-card',
      title: 'Club repeater directory',
      body: 'W0SRC. Output 146.940 MHz. Input 146.340 MHz (offset -600 kHz). Access tone 100.0 Hz. Open to all licensed operators. Identify with your call sign when you call.',
    },
    {
      id: 's04-dmr-card',
      title: 'Club digital card',
      body: 'W0SRC digital. Output 442.100 MHz, input 447.100 MHz. Color code 1. Time slot 2. Talkgroup 31337, Club Tech Net. Load the loaner channel that matches all three, then key and wait for a reply.',
    },
  ],
};
