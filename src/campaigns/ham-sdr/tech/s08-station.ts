/**
 * @file s08-station - Station fixture for C3 Technician S8 "Noise in the Shack"
 * @description A USB SDR on a direction-finding Yagi, a laptop charger and a switching supply on the desk. Fixtures:
 * - the suspect supply sits about 6 m from the antenna on a bearing of 55 degrees; a reflection lobe appears 110 degrees away, 8 dB weaker
 * - the receiver sits on 146.550 MHz FM; the noise rise is read with the player's own `rx.record`
 * - a clean spare supply is on the shelf; installing it quiets the noise for good
 * - the mobile radio runs 15 W with its microphone gain at a clean 5. Its feed line has no ferrite choke (fault
 *   `rf-feedback-feed`, threshold 8 W): above 8 W, RF gets into the audio and Riley (KD0RLY) hears hum and a squeal
 *   whatever the mic gain is. The remedy is the spare feed line with a choke (`install`). Separately, mic gain above 7
 *   overdrives the audio at ANY power and is cured by lowering the gain, so the two symptoms differ:
 *   feedback follows the power, overdrive follows the gain. Riley's voice-test reports tell them apart.
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S08_FAULT_ID = 'noisy-supply';
export const S08_FEEDBACK_FAULT_ID = 'rf-feedback-feed';
/** Output power above which the unchoked feed line corrupts the audio, W */
export const S08_FEEDBACK_THRESHOLD_W = 8;
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

const audioCauseSheet: Worksheet = {
  id: 's08-audio-cause',
  title: 'Two audio problems',
  prompt: 'Riley gave you two different reports. Match each symptom to its cause and pick the remedy the evidence supports.',
  fields: [
    {
      id: 'follows-gain',
      label: 'Distorted at every power level, and worse as the mic gain goes up. Cause?',
      kind: 'choice',
      options: ['Microphone gain set too high', 'RF getting back into the audio path'],
      answer: 'Microphone gain set too high',
    },
    {
      id: 'follows-power',
      label: 'Hum and squeal on the carrier only when you run high power, with the mic gain normal. Cause?',
      kind: 'choice',
      options: ['Microphone gain set too high', 'RF getting back into the audio path'],
      answer: 'RF getting back into the audio path',
    },
    {
      id: 'remedy',
      label: 'You hear the hum and squeal at high power with the gain at 5. Which remedy does that evidence support?',
      kind: 'choice',
      options: ['Fit a ferrite choke on the feed line', 'Turn the mic gain down further', 'Replace the microphone'],
      answer: 'Fit a ferrite choke on the feed line',
    },
  ],
  explanation:
    'Overdrive follows the gain: it shows at any power and clears when you lower the gain. RF feedback follows the power: the voice is fine, the carrier carries hum, and a choke on the feed line (or more distance) cures it. Turning the gain down does nothing for feedback.',
  wrongFeedback: {
    'follows-gain': 'Compare the two reports. Which problem stayed when you cut the power?',
    'follows-power': 'This symptom appeared only at high power and went away at low power.',
    remedy: 'Your gain was already at 5. A fix has to match the symptom: this one followed the power, not the gain.',
  },
};

const symptomSheet: Worksheet = {
  id: 's08-symptoms',
  title: 'Symptoms and causes',
  prompt: 'Match the symptom to the most likely cause. Your transmitted audio had hum and a squeal at high power, and receive was clean.',
  fields: [
    {
      id: 'audio',
      label: 'Hum and squeal on transmit at high power, clean on receive, normal mic gain. Most likely cause?',
      kind: 'choice',
      options: ['RF getting back into the audio path', 'A noisy power supply near the receiver', 'A loose antenna connector on receive', 'A weak battery in the laptop'],
      answer: 'RF getting back into the audio path',
    },
  ],
  explanation: 'RF feedback corrupts the transmitted audio when power is high. Noise from a nearby supply raises the receive floor instead and does not change how you sound.',
  wrongFeedback: { audio: 'Only the transmit audio is bad, and only at high power, so look at what lets RF into the audio.' },
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
      radio: { vfoMHz: 146.55, mode: 'FM', txPowerW: 15, micGain: 5 },
    },
    { id: 'psu', kind: 'power-supply', label: '13.8 V supply', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'feed', kind: 'coax', label: 'Antenna feed line (5 m)', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' } },
    { id: 'feed-choked', kind: 'coax', label: 'Antenna feed line (5 m) with ferrite choke', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' }, spare: true },
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
    {
      id: S08_FEEDBACK_FAULT_ID,
      target: 'feed',
      kind: 'rf-feedback',
      value: S08_FEEDBACK_THRESHOLD_W,
      inspectClue:
        'The feed line has no ferrite choke and runs right beside the microphone cable. At high power, RF can couple into the audio path. A feed line with a choke is on the shelf.',
      clearedBy: { action: 'install', spareKind: 'coax' },
    },
  ],
  emitters: [],
  remoteStations: {
    audioCheck: true,
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
  worksheets: [reflectionSheet, audioCauseSheet, symptomSheet],
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
    'compare-audio': 'Key a Test tone intent twice. First at 15 W with the mic gain at 5, then at 5 W with the mic gain at 9. Read what Riley says each time.',
    'check-audio': 'Call Riley at 15 W. If she hears hum and squeal, install the feed line with the choke, then answer at the same power. Lowering the mic gain will not cure it.',
  },
};
