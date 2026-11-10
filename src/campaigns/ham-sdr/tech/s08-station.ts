/**
 * @file s08-station - Station fixture for C3 Technician S8 "Noise in the Shack"
 * @description A USB SDR on a direction-finding Yagi, a laptop charger and a switching supply on the desk. Fixtures:
 * - the suspect supply sits about 6 m from the antenna on a bearing of 55 degrees; a reflection lobe appears 110 degrees away, 8 dB weaker
 * - the receiver sits on 146.550 MHz FM; the noise rise is read with the player's own `rx.record`
 * - a clean spare supply is on the shelf; installing it quiets the noise for good
 * - the mobile radio has its microphone gain at 9 (overdriven); gain 4 to 6 gives clean audio for Riley (KD0RLY)
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S08_FAULT_ID = 'noisy-supply';
/** True bearing from the antenna to the suspect supply, degrees */
export const S08_SOURCE_BEARING_DEG = 55;
const SOURCE_DISTANCE_M = 6;

const reflectionSheet: Worksheet = {
  id: 's08-reflection',
  title: 'Why two directions?',
  prompt: 'The noise shows up strongly in one direction and weakly in another. Choose the best explanation, then the direction you would trust.',
  fields: [
    {
      id: 'why',
      label: 'What causes the weaker second direction?',
      kind: 'choice',
      options: [
        'The noise bounces off a nearby surface and reaches the antenna from another direction',
        'There are two separate noise sources',
        'The antenna is broken',
        'The receiver is picking up its own noise',
      ],
      answer: 'The noise bounces off a nearby surface and reaches the antenna from another direction',
    },
    {
      id: 'trust',
      label: 'Which direction do you trust as the real source?',
      kind: 'choice',
      options: ['The direction with the strongest, most consistent reading', 'The weakest direction', 'Any direction, they are the same', 'The direction the antenna started in'],
      answer: 'The direction with the strongest, most consistent reading',
    },
  ],
  explanation:
    'Radio noise reflects off walls and metal, so a second, weaker lobe can show up at another bearing. The strongest and most repeatable reading points at the real source.',
  wrongFeedback: {
    why: 'Think about what happens to radio waves that meet a wall or a metal surface.',
    trust: 'A reflection loses some strength on the way, so it reads weaker than the direct path.',
  },
};

const symptomSheet: Worksheet = {
  id: 's08-symptoms',
  title: 'Symptoms and causes',
  prompt: 'Match the symptom to the most likely cause. Your transmitted audio sounded distorted to Riley.',
  fields: [
    {
      id: 'audio',
      label: 'Distorted audio on transmit, clean on receive. Most likely cause?',
      kind: 'choice',
      options: ['Microphone gain set too high', 'A noisy power supply near the receiver', 'A loose antenna connector on receive', 'A weak battery in the laptop'],
      answer: 'Microphone gain set too high',
    },
  ],
  explanation:
    'Too much microphone gain overdrives the transmitter and distorts the audio. Noise from a nearby supply raises the receive floor instead and does not change how you sound.',
  wrongFeedback: { audio: 'Only the transmit audio is bad, so look at what feeds the transmitter.' },
};

export const s08Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 808,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Desk', description: 'Desk with the SDR, laptop and radio', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [
    { id: 'laptop', kind: 'laptop', label: 'Laptop', location: 'bench', powered: true },
    { id: 'laptop-charger', kind: 'charger', label: 'Laptop charger', location: 'bench', powered: true },
    { id: 'sdr', kind: 'sdr', label: 'USB SDR', location: 'bench', profileId: 'usb-sdr', powered: true, radio: { vfoMHz: 146.55, mode: 'FM', filterHz: 15000 } },
    { id: 'adapter', kind: 'adapter', label: 'SMA adapter', location: 'bench' },
    { id: 'coax', kind: 'coax', label: 'Short coax (3 m)', location: 'bench', coax: { type: 'rg58', length: 3, unit: 'm' } },
    { id: 'df-yagi', kind: 'antenna', label: 'Direction-finding Yagi', location: 'bench', antenna: { kind: 'df-yagi' } },
    {
      id: 'suspect-supply',
      kind: 'noise-source',
      label: 'Switching supply on the shelf',
      location: 'bench',
      powered: true,
      position: {
        xKm: (SOURCE_DISTANCE_M * Math.sin((S08_SOURCE_BEARING_DEG * Math.PI) / 180)) / 1000,
        yKm: (SOURCE_DISTANCE_M * Math.cos((S08_SOURCE_BEARING_DEG * Math.PI) / 180)) / 1000,
        heightM: 2,
      },
      noise: { psdDbmHzAt1m: -128, reflection: { bearingOffsetDeg: 110, extraLossDb: 8 } },
    },
    { id: 'spare-supply', kind: 'noise-source', label: 'Spare supply (known clean)', location: 'bench', spare: true },
    {
      id: 'mobile',
      kind: 'mobile',
      label: 'Mobile radio',
      location: 'bench',
      profileId: 'dual-band-mobile',
      powered: true,
      radio: { vfoMHz: 146.55, mode: 'FM', txPowerW: 10, micGain: 9 },
    },
    { id: 'psu', kind: 'power-supply', label: '13.8 V supply', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'feed', kind: 'coax', label: 'Antenna feed line (5 m)', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' } },
    { id: 'outdoor-ant', kind: 'antenna', label: 'Outdoor vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
  ],
  connections: [
    { id: 'sdr-usb', a: { deviceId: 'sdr', portId: 'usb' }, b: { deviceId: 'laptop', portId: 'usb1' }, seated: true },
    { id: 'sdr-sma', a: { deviceId: 'sdr', portId: 'ant' }, b: { deviceId: 'adapter', portId: 'a' }, seated: true },
    { id: 'adp-coax', a: { deviceId: 'adapter', portId: 'b' }, b: { deviceId: 'coax', portId: 'a' }, seated: true },
    { id: 'coax-yagi', a: { deviceId: 'coax', portId: 'b' }, b: { deviceId: 'df-yagi', portId: 'in' }, seated: true },
    { id: 'mob-feed', a: { deviceId: 'mobile', portId: 'ant' }, b: { deviceId: 'feed', portId: 'a' }, seated: true },
    { id: 'feed-ant', a: { deviceId: 'feed', portId: 'b' }, b: { deviceId: 'outdoor-ant', portId: 'in' }, seated: true },
  ],
  faults: [
    {
      id: S08_FAULT_ID,
      target: 'suspect-supply',
      kind: 'noisy-supply',
      inspectClue: 'The label says it is a cheap switching supply. The case is warm and the cable has no ferrite bead. It is plugged in two metres from the antenna feed.',
      clearedBy: { action: 'install', spareKind: 'noise-source' },
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
  worksheets: [reflectionSheet, symptomSheet],
  cards: [
    {
      id: 's08-same-settings',
      title: 'Compare under the same settings',
      body: 'A noise reading only means something next to another reading taken with the same frequency, bandwidth and gain. Change one thing at a time, then record again.',
    },
    {
      id: 's08-find-bearing',
      title: 'Finding a noise source',
      body: 'Turn the directional antenna in steps and record the noise at each heading. The strongest repeatable reading points at the source. A weaker second peak is usually a reflection.',
    },
  ],
  hints: {
    'record-pattern': 'Record the noise with the antenna and the receiver settings left alone. You will compare every later reading with this one.',
    'battery-baseline': 'Power off the suspect supply and the laptop charger, then record again without changing any receiver setting.',
    'isolate-source': 'Turn on one thing at a time and record after each: the charger alone, then the suspect supply alone.',
    'locate-direction': 'Power the suspect supply back on, turn the antenna in steps of about 45 degrees and record the noise at each heading.',
    'substitute-supply': 'Swap in the spare supply, leave every receiver setting alone and record again.',
    'check-audio': 'Call Riley, then lower the microphone gain to between 4 and 6 and answer.',
  },
};
