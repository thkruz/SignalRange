/**
 * @file s11-station - Station fixture for C3 Technician S11 "A Contact Through Space"
 * @description Riley's backyard: a dual-band handheld for the 70 cm uplink, a USB SDR for the 2 m
 * downlink and a dual-band satellite Yagi shared through a duplexer. Fixtures (simulation only):
 * - CUBEHOP-UV is a U/V FM relay: uplink 435.900 MHz with a 67.0 Hz access tone,
 *   downlink 145.900 MHz, Doppler about +/- 3.4 kHz at 2 m and +/- 10 kHz at 70 cm
 * - the satellite sends a beacon on the downlink so the pass can be acquired receive-only
 * - the ground station W0GRD (Mo, grid EN34) is fictional and answers a CQ with its grid square
 * - the duplexer gives 60 dB between the two radios; a plain splitter gives 6 dB and keying is blocked
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import { CUBEHOP_UV_NORAD } from './cubehop-uv';
import { conn } from './s09-12-helpers';

export const S11_UPLINK_MHZ = 435.9;
export const S11_DOWNLINK_MHZ = 145.9;
export const S11_TONE_HZ = 67;

const passSheet: Worksheet = {
  id: 's11-pass',
  title: 'Read the pass card',
  prompt: 'Use the pass card. The satellite moves toward you at about 23 millionths of the speed of light as it rises.',
  fields: [
    { id: 'uplink', label: 'Uplink frequency (MHz)', kind: 'number', answer: 435.9, tolerance: 0.0005 },
    { id: 'tone', label: 'Access tone (Hz)', kind: 'number', answer: 67, tolerance: 0.1 },
    { id: 'shift', label: 'Doppler shift of the 145.900 MHz downlink at that speed (kHz)', kind: 'number', answer: 3.36, tolerance: 0.1 },
    {
      id: 'direction',
      label: 'While the satellite is rising toward you, where does the downlink appear?',
      kind: 'choice',
      options: ['Above 145.900 MHz, then lower as it passes', 'Below 145.900 MHz, then higher as it passes', 'Exactly on 145.900 MHz all pass'],
      answer: 'Above 145.900 MHz, then lower as it passes',
    },
  ],
  explanation: 'The shift is the frequency times the speed ratio: 145.9 MHz times 23 millionths is about 3.4 kHz. An approaching satellite sounds higher and a receding one lower.',
  wrongFeedback: {
    uplink: 'Read the uplink row of the pass card.',
    tone: 'The access tone is on the uplink row.',
    shift: 'Multiply 145.9 MHz by 0.000023 and convert to kilohertz.',
    direction: 'Think about a siren approaching and then moving away.',
  },
};

const fadingSheet: Worksheet = {
  id: 's11-fading',
  title: 'Explain the fading',
  prompt: 'Operators often report a satellite signal that rises and falls every few seconds while the satellite stays high in the sky.',
  fields: [
    {
      id: 'cause',
      label: 'Which explanation fits the steady rise and fall in volume?',
      kind: 'choice',
      options: [
        'The satellite spins, so its antenna turns relative to your linear antenna',
        'The satellite is running out of power and cannot hold a steady signal for the remainder of the pass',
        'The duplexer is overheating and switching the receiver on and off repeatedly',
      ],
      answer: 'The satellite spins, so its antenna turns relative to your linear antenna',
    },
    {
      id: 'fix',
      label: 'What can you do about it at your end?',
      kind: 'choice',
      options: ['Rotate or tilt your antenna to follow the polarization', 'Raise the uplink power to the maximum', 'Remove the duplexer'],
      answer: 'Rotate or tilt your antenna to follow the polarization',
    },
  ],
  explanation:
    'A spinning satellite turns its antenna relative to yours, so the polarization match changes and the signal fades in a regular rhythm. More power would only add uplink trouble.',
  wrongFeedback: { cause: 'The pattern repeats at a steady rate, which points to something turning.', fix: 'Fix a polarization mismatch at the antenna, not with power.' },
};

const logSheet: Worksheet = {
  id: 's11-log',
  title: 'Close the log entry',
  prompt: 'Write up the pass the way you would for a log book.',
  fields: [
    {
      id: 'entry',
      label: 'Which log entry is complete?',
      kind: 'choice',
      options: ['Date, time, CUBEHOP-UV, W0GRD, grid EN34, uplink and downlink frequencies, signal report', 'CUBEHOP-UV worked', 'Time and my call sign only'],
      answer: 'Date, time, CUBEHOP-UV, W0GRD, grid EN34, uplink and downlink frequencies, signal report',
    },
  ],
  explanation: 'A log entry records enough to rebuild the contact: when, which satellite, who answered, the grid square and the frequencies you used.',
  wrongFeedback: { entry: 'A usable entry names the satellite, the other station and the exchange, not only that you made a contact.' },
};

export const s11Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 111,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'yard', label: "Riley's backyard", description: 'Satellite Yagi on a tripod, radios on a folding table', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'yard',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [
    {
      id: 'ht',
      kind: 'handheld',
      label: 'Dual-band handheld (uplink)',
      location: 'yard',
      profileId: 'dual-band-ht',
      powered: true,
      radio: { vfoMHz: 146.52, mode: 'FM', txPowerW: 5, squelch: 0 },
    },
    { id: 'ht-adapter', kind: 'adapter', label: 'SMA to UHF adapter', location: 'yard' },
    { id: 'up-coax', kind: 'coax', label: 'Uplink jumper', location: 'yard', coax: { type: 'rg58', length: 2, unit: 'm' } },
    {
      id: 'sdr',
      kind: 'sdr',
      label: 'USB SDR (downlink)',
      location: 'yard',
      profileId: 'usb-sdr',
      powered: true,
      radio: { vfoMHz: 145.5, mode: 'FM', filterHz: 15000, squelch: 0 },
    },
    { id: 'sdr-adapter', kind: 'adapter', label: 'SMA to UHF adapter', location: 'yard' },
    { id: 'dn-coax', kind: 'coax', label: 'Downlink jumper', location: 'yard', coax: { type: 'rg58', length: 2, unit: 'm' } },
    { id: 'duplexer', kind: 'duplexer', label: 'Duplexer, 2 m / 70 cm', location: 'yard', inspectNote: 'A real duplexer: about 60 dB between the 2 m and 70 cm ports.' },
    { id: 'ant-coax', kind: 'coax', label: 'Feedline to the Yagi', location: 'yard', coax: { type: 'rg8x', length: 8, unit: 'm' } },
    { id: 'yagi', kind: 'antenna', label: 'Dual-band satellite Yagi', location: 'yard', antenna: { kind: 'dual-band-yagi' } },
    { id: 'laptop', kind: 'laptop', label: 'Laptop', location: 'yard', powered: true },
  ],
  connections: [
    conn('ht-sma', 'ht', 'ant', 'ht-adapter', 'a'),
    conn('ht-adp', 'ht-adapter', 'b', 'up-coax', 'a'),
    conn('up-dup', 'up-coax', 'b', 'duplexer', 'uhf'),
    conn('sdr-sma', 'sdr', 'ant', 'sdr-adapter', 'a'),
    conn('sdr-adp', 'sdr-adapter', 'b', 'dn-coax', 'a'),
    conn('dn-dup', 'dn-coax', 'b', 'duplexer', 'vhf'),
    conn('dup-feed', 'duplexer', 'common', 'ant-coax', 'a'),
    conn('feed-yagi', 'ant-coax', 'b', 'yagi', 'in'),
    conn('sdr-usb', 'sdr', 'usb', 'laptop', 'usb1'),
  ],
  faults: [],
  emitters: [],
  satellite: {
    satelliteNoradId: CUBEHOP_UV_NORAD,
    id: 'cubehop-uv',
    name: 'CUBEHOP-UV',
    uplinkMHz: S11_UPLINK_MHZ,
    downlinkMHz: S11_DOWNLINK_MHZ,
    accessToneHz: S11_TONE_HZ,
    uplinkWindowHz: 7000,
    downlinkErpDbm: 30,
    wiring: { txRadioId: 'ht', rxRadioId: 'sdr' },
    beaconText: 'CUBEHOP-UV beacon, uplink four three five point nine, tone six seven',
    beaconPeriodS: 20,
    groundStation: { id: 'w0grd', callsign: 'W0GRD', name: 'Mo', grid: 'EN34', position: { xKm: 600, yKm: 300, heightM: 15 }, replyDelayS: 4 },
  },
  worksheets: [passSheet, fadingSheet, logSheet],
  cards: [
    {
      id: 's11-pass-card',
      title: 'Pass card',
      body: 'CUBEHOP-UV, one pass. Uplink 435.900 MHz FM with a 67.0 Hz tone. Downlink 145.900 MHz FM. Doppler is about 3.4 kHz at 2 m and 10 kHz at 70 cm. Use the Yagi: point it at the rise, then follow the satellite. Receive first, transmit second, and keep the power low.',
    },
    {
      id: 's11-exchange',
      title: 'Exchange card',
      body: 'Listen to the beacon first. Then send a short CQ with your call sign KF0SRT. When W0GRD answers with a grid square, reply and identify. Your own signal is a quick check, not the contact.',
    },
  ],
  hints: {
    'read-pass-card': 'Multiply the downlink frequency by the speed ratio, then decide whether an approaching satellite sounds higher or lower.',
    'prepare-paths': 'Inspect the duplexer and read its isolation, then set the handheld to the uplink with the access tone and low power, and the SDR to the downlink in FM.',
    'acquire-downlink': 'Point the Yagi where the satellite rises and tune the SDR above 145.900 MHz while it approaches. Listen for the beacon before you transmit.',
    'first-uplink':
      'Correct the uplink for Doppler (a bit lower while it approaches), key briefly with a CQ, and listen for your own signal on the downlink while you key. If the downlink drops out as you transmit, the two paths are not isolated enough.',
    'follow-doppler': 'The shift changes during the pass. Retune the uplink and key again later, so the satellite receiver always sees 435.900 MHz.',
    'grid-exchange': 'Call CQ, wait for W0GRD to answer with its grid, then reply and give your call sign.',
    'explain-fading': 'A regular rise and fall points to something turning, not to a power problem.',
    'log-the-pass': 'A log entry names the date, the satellite, the other station, the grid and the frequencies.',
  },
};
