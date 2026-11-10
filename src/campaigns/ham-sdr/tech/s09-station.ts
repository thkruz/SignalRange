/**
 * @file s09-station - Station fixture for C3 Technician S9 "Send the Message"
 * @description Riley's shack: dual-band FM mobile on a vertical, a USB audio/PTT interface and a
 * laptop running packet software. Fixtures (match the S9 mission brief):
 * - training channel 145.570 MHz FM (simulation fixture), remote station KD0RLY, path WIDE1-1
 * - the packet software starts on the wrong sound input (laptop microphone), transmit level 9
 *   (over-driven), output on the laptop speakers, system sounds routed to the interface, and the
 *   default identity (N0CALL to APRS, no path)
 * - KD0RLY's node beacons a reference packet every 30 s, so a decode can be checked before the
 *   player transmits anything
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import { conn } from './s09-12-helpers';

export const S09_MESSAGE = 'Swap meet at the club on Saturday, tables open at nine';
export const S09_CHANNEL_MHZ = 145.57;

const traceSheet: Worksheet = {
  id: 's09-trace',
  title: 'Trace the audio and PTT connections',
  prompt: 'Match each signal in the packet setup to the connection that carries it.',
  fields: [
    {
      id: 'paths',
      label: 'Signal paths',
      kind: 'match',
      options: ['Receive audio', 'Transmit audio', 'Push-to-talk', 'Radio lead'],
      answer: {
        'Receive audio': 'Radio to the interface, then the computer input',
        'Transmit audio': 'Computer output, then the interface, then the radio',
        'Push-to-talk': 'A keying line from the interface to the radio',
        'Radio lead': 'Mini-DIN cable between the radio data port and the interface',
      },
    },
  ],
  explanation:
    'Audio from the radio reaches the computer through the interface, audio from the computer goes back out the same way, and a separate keying line tells the radio when to transmit.',
  wrongFeedback: { paths: 'Follow the signal one way at a time: radio to computer for receive, computer to radio for transmit, and a keying line for push-to-talk.' },
};

const networksSheet: Worksheet = {
  id: 's09-networks',
  title: 'Tell the digital networks apart',
  prompt: 'Answer from what you saw in the packet window and on the reference page.',
  fields: [
    {
      id: 'ui',
      label: 'Which frame type is never acknowledged by the receiver?',
      kind: 'choice',
      options: ['An unconnected UI frame, such as a position report', 'A connected-mode information frame', 'A connection request'],
      answer: 'An unconnected UI frame, such as a position report',
    },
    {
      id: 'internet',
      label: 'A packet gateway connects the radio network to the Internet. What does that change about transmit privileges?',
      kind: 'choice',
      options: [
        'Nothing, because Internet access grants no transmit privileges',
        'Anyone online may then transmit on amateur frequencies',
        'Encoded messages no longer need a station identification',
      ],
      answer: 'Nothing, because Internet access grants no transmit privileges',
    },
    {
      id: 'kinds',
      label: 'Match each service to its job',
      kind: 'match',
      options: ['APRS', 'Linked voice repeater', 'Winlink', 'Mesh network'],
      answer: {
        APRS: 'Position reports and short messages',
        'Linked voice repeater': 'Voice contacts over a wide area',
        Winlink: 'Email carried through radio gateways',
        'Mesh network': 'Many nodes relaying data for each other',
      },
    },
  ],
  explanation:
    'Unconnected frames are never acknowledged, and an Internet link adds reach but no privileges. Each service is a different way to move information over the same amateur bands.',
  wrongFeedback: {
    ui: 'Think about which frame does not wait for a reply from the far station.',
    internet: 'Privileges come from the license and the band rules, not from how a message is carried.',
    kinds: 'Match by what each service carries: positions, voice, email or relayed data.',
  },
};

export const s09Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 109,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: "Riley's shack", description: 'Radio, interface and laptop on the shack desk', position: { xKm: 0, yKm: 0, heightM: 10 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 10 },
  devices: [
    { id: 'laptop', kind: 'laptop', label: 'Laptop with packet software', location: 'bench', powered: true },
    {
      id: 'mobile',
      kind: 'mobile',
      label: 'Dual-band FM mobile',
      location: 'bench',
      profileId: 'dual-band-mobile',
      powered: true,
      radio: { vfoMHz: S09_CHANNEL_MHZ, mode: 'FM', txPowerW: 5 },
    },
    { id: 'psu', kind: 'power-supply', label: '13.8 V supply', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'mob-coax', kind: 'coax', label: 'RG-8X feedline', location: 'bench', coax: { type: 'rg8x', length: 5, unit: 'm' } },
    { id: 'mob-ant', kind: 'antenna', label: 'Roof vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
    { id: 'iface', kind: 'audio-interface', label: 'USB audio and PTT interface', location: 'bench', powered: true },
  ],
  connections: [
    conn('mob-ant-jack', 'mobile', 'ant', 'mob-coax', 'a'),
    conn('mob-feed', 'mob-coax', 'b', 'mob-ant', 'in'),
    conn('iface-radio', 'mobile', 'data', 'iface', 'radio'),
    conn('iface-usb', 'iface', 'usb', 'laptop', 'usb1'),
  ],
  faults: [],
  emitters: [],
  packet: {
    radioId: 'mobile',
    node: {
      id: 'riley-node',
      callsign: 'KD0RLY',
      freqMHz: S09_CHANNEL_MHZ,
      position: { xKm: 6, yKm: 2, heightM: 15 },
      erpDbm: 40,
      replyDelayS: 1,
      banner: 'KD0RLY training node',
      beacon: { text: 'KD0RLY training node, reply with a connect request', periodS: 30 },
    },
    audio: { inputDevice: 'laptop-mic', outputDevice: 'laptop-speakers', rxLevel: 5, txLevel: 9, ptt: 'rts', systemSoundsToInterface: true },
    station: { mycall: 'N0CALL', destination: 'APRS', path: [] },
  },
  worksheets: [traceSheet, networksSheet],
  cards: [
    { id: 's09-message-card', title: 'Exercise card', body: `Message to send: "${S09_MESSAGE}". Send it exactly as written, to KD0RLY on 145.570 MHz FM, path WIDE1-1.` },
    {
      id: 's09-interface',
      title: 'Interface settings',
      body: 'Input device: the interface. Output device: the interface. Transmit level: 4 to 6 (3 to 7 still decodes). Notification sounds: keep them on the laptop speakers. A programming cable is not an audio interface.',
    },
  ],
  hints: {
    'trace-connections':
      'Trace one direction at a time: receive audio goes radio to interface to computer, transmit audio goes the other way, and the keying line starts the transmitter.',
    'fix-receive-input': 'The radio is hearing the node. Open the packet audio settings and check which sound input the software is listening to.',
    'set-transmit-audio': 'Send a short unconnected test frame. If a chime goes out or the level is far from the middle, the frame is spoiled before it leaves the radio.',
    'enter-identity': 'The node only answers frames addressed to it. Check your call sign, the destination and the path against the exercise card.',
    'connect-and-send': 'A connection request comes first. Then send the message and wait for the far station to acknowledge it.',
    'recover-lost-frame': 'When a frame is lost the software retries after a timeout. Wait for the retry rather than sending again.',
    'compare-networks': 'Unconnected frames get no reply, and Internet links add no privileges. Use the reference page.',
  },
};
