/**
 * @file s03-station - Station fixture for C3 Technician S3 "Your First Contact"
 * @description A 5 W dual-band handheld with a supplied rubber-duck antenna, license technician,
 * and one simplex partner on 146.550 MHz FM (W0SRC, "Sam").
 * Fixtures (match the S3 mission brief):
 * - the HT boots on 146.520 MHz at 5 W; the contact channel is 146.550 MHz simplex
 * - the battery pack is not seated at the start (fault `ht-battery`), so the radio is dead until
 *   the player inspects it and reseats the pack; the antenna is the supplied rubber duck
 * - Sam answers a call that he decodes, then trades name, location and report, then closes when
 *   the player identifies with KF0SRT
 * - two other operators are mid-conversation on 146.550 for the first 35 s after the player tunes there;
 *   a call over them is a collision and nobody answers
 * - the HT starts with its mic gain at 9: Sam's first report says the audio is distorted, and the
 *   player must set the gain to 4-6 for his next report to confirm clean audio ('mic-adjusted')
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import type { HamConnection } from '@app/ham/ham-types';

export const S03_CHANNEL_MHZ = 146.55;
/** Seconds the scripted conversation occupies the channel, counted from the player's first tune-in */
export const S03_BUSY_S = 35;
/** Emitter ids of the two operators in the scripted conversation */
export const S03_CHAT_A = 's03-chat-a';
export const S03_CHAT_B = 's03-chat-b';

const privilegesSheet: Worksheet = {
  id: 's03-privileges',
  title: 'Confirm your station privileges',
  prompt: 'Your call sign, KF0SRT, is in the license database as a Technician. Answer from the privilege chart on your reference card.',
  fields: [
    {
      id: 'band',
      label: '146.550 MHz FM is in the 2 meter band. A Technician may transmit there:',
      kind: 'choice',
      options: ['Yes, it is inside Technician privileges', 'No, it needs a General license'],
      answer: 'Yes, it is inside Technician privileges',
    },
    {
      id: 'power',
      label: 'How much transmitter power should you use?',
      kind: 'choice',
      options: ['The minimum needed to communicate', 'Always the maximum the radio allows'],
      answer: 'The minimum needed to communicate',
    },
    {
      id: 'ident',
      label: 'You must give your call sign:',
      kind: 'choice',
      options: ['At the end of the contact and at least every 10 minutes during it', 'Only when the other station asks'],
      answer: 'At the end of the contact and at least every 10 minutes during it',
    },
  ],
  explanation:
    'Privileges come from your license class, not from the radio. Use only the power you need, and identify at the end of a contact and every 10 minutes during a long one.',
  wrongFeedback: {
    band: 'Check the privilege chart: the whole 2 meter band is open to Technicians.',
    power: 'The rules ask for the minimum power that gets the job done.',
    ident: 'Identification is required at the end and at least every 10 minutes.',
  },
};

const exposureSheet: Worksheet = {
  id: 's03-exposure',
  title: 'Review the antenna clearance',
  prompt: 'Your handheld puts its antenna close to your head and body. Answer the exposure questions before you transmit.',
  fields: [
    {
      id: 'hold',
      label: 'While transmitting, which way do you hold the radio?',
      kind: 'choice',
      options: ['Upright, with the antenna kept away from your head and body', 'With the antenna pressed against your cheek'],
      answer: 'Upright, with the antenna kept away from your head and body',
    },
    {
      id: 'power',
      label: 'Which choice lowers your exposure and still reaches a nearby station?',
      kind: 'choice',
      options: ['A lower transmit power', 'A longer key-down time'],
      answer: 'A lower transmit power',
    },
  ],
  explanation:
    'Exposure depends on power, distance from the antenna and how long you transmit. Hold the antenna away from you, use the power you need and keep transmissions short.',
  wrongFeedback: { hold: 'Keep the antenna away from your head and body while you transmit.', power: 'Lower power and shorter transmissions both reduce exposure.' },
};

const conn = (id: string, a: [string, string], b: [string, string]): HamConnection => ({
  id,
  a: { deviceId: a[0], portId: a[1] },
  b: { deviceId: b[0], portId: b[1] },
  seated: true,
});

export const s03Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 103,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Shack', description: 'Desk with a handheld radio', position: { xKm: 0, yKm: 0, heightM: 6 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 6 },
  devices: [
    {
      id: 'ht',
      kind: 'handheld',
      label: 'Dual-band handheld',
      location: 'bench',
      profileId: 'dual-band-ht',
      powered: true,
      radio: { vfoMHz: 146.52, mode: 'FM', txPowerW: 5, squelch: 3, volume: 6, micGain: 9 },
    },
    { id: 'ht-ant', kind: 'antenna', label: 'Supplied rubber-duck antenna', location: 'bench', antenna: { kind: 'rubber-duck' } },
  ],
  connections: [conn('ht-ant-jack', ['ht', 'ant'], ['ht-ant', 'in'])],
  faults: [
    {
      id: 'ht-battery',
      target: 'ht',
      kind: 'battery-unseated',
      inspectClue: 'The battery pack is not clicked into the radio. The contacts are not touching, so the radio has no power.',
      clearedBy: { action: 'repair' },
    },
  ],
  emitters: [],
  remoteStations: {
    busy: [
      {
        freqMHz: S03_CHANNEL_MHZ,
        fromS: 0,
        toS: S03_BUSY_S,
        relativeToMonitor: true,
        traffic: {
          gapS: 7,
          erpDbm: 37,
          mode: 'FM',
          lines: [
            { sourceId: S03_CHAT_A, callsign: 'N0DLE', text: 'Dale here. Pat, are you still going to the club swap meet on Saturday?', position: { xKm: 3, yKm: -2, heightM: 10 } },
            {
              sourceId: S03_CHAT_B,
              callsign: 'W0PAT',
              text: 'Pat here. Yes, I am bringing the spare antenna mast. Over to you, Dale.',
              position: { xKm: -2, yKm: 3, heightM: 10 },
            },
            {
              sourceId: S03_CHAT_A,
              callsign: 'N0DLE',
              text: 'Good, I will meet you at the door at nine. Anything you need me to carry?',
              position: { xKm: 3, yKm: -2, heightM: 10 },
            },
            { sourceId: S03_CHAT_B, callsign: 'W0PAT', text: 'Just the coax box. Nine is fine. We are about done on this channel.', position: { xKm: -2, yKm: 3, heightM: 10 } },
            { sourceId: S03_CHAT_A, callsign: 'N0DLE', text: 'Agreed. N0DLE clear, see you Saturday.', position: { xKm: 3, yKm: -2, heightM: 10 } },
          ],
        },
      },
    ],
    stations: [
      {
        id: 'sam',
        callsign: 'W0SRC',
        name: 'Sam',
        location: 'across town',
        grid: 'EN34',
        position: { xKm: 4, yKm: 1, heightM: 12 },
        freqMHz: S03_CHANNEL_MHZ,
        mode: 'FM',
        erpDbm: 37,
        replyDelayS: 3,
        personality: ['Thanks for the call. Go ahead whenever you are ready.'],
      },
    ],
  },
  worksheets: [privilegesSheet, exposureSheet],
  hints: {
    'confirm-station-privileges': [
      'Open the Technician privilege card on the bench, then the privileges worksheet in Notebook. The card has what you need.',
      'Read each line of the card against the worksheet question. Frequency range, power and identification each have their own line.',
    ],
    'check-power-connection': [
      'Click the handheld and use Look closely. Then do the same for the antenna.',
      'The clue says the battery pack is not seated. Open Connections & repairs on the handheld and reseat it, then check the antenna is on.',
    ],
    'review-antenna-clearance': [
      'Open the exposure worksheet in Notebook. The questions are about how you hold the radio and where its antenna sits.',
      'Think about the distance between the antenna and your head, and which choice puts the antenna farther from you.',
    ],
    'listen-before-calling': [
      'Click the handheld. Set 146.550 MHz FM simplex and a low transmit power, then listen without keying.',
      'Two operators are talking. Wait for them to finish, then keep listening until the channel has been clear for ten more seconds.',
    ],
    'make-first-call': [
      'Only call once the channel has been quiet for a while. On the card beside the mic, choose Call a station, pick W0SRC, and press PTT.',
      'Release the key and wait. Sam answers a few seconds later.',
    ],
    'exchange-signal-report': [
      'Send your name, your location and a signal report as three separate transmissions. Release the key between each one and wait for Sam.',
      'If Sam says your audio is distorted, lower the microphone gain on the handheld to the middle of its range, then send the item again.',
    ],
    'close-the-contact': ['End with a short transmission that gives your call sign, then release the key.'],
  },
  cards: [
    {
      id: 's03-privileges-card',
      title: 'Technician privilege card',
      body: 'Technician: all amateur VHF/UHF bands, including 144 to 148 MHz. Use the minimum power needed. Identify at the end of a contact and at least every 10 minutes. This card is a training aid, not a license.',
    },
    {
      id: 's03-contact-card',
      title: 'Contact script',
      body: 'Listen first. Call: "W0SRC, this is KF0SRT." Then exchange your name, your location and a signal report. Finish with: "W0SRC, this is KF0SRT, clear." Release the key between transmissions.',
    },
  ],
};
