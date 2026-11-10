/**
 * @file s06-station - Station fixture for C3 Technician S6 "Where Did the Watts Go?"
 * @description Mobile radio on a bench supply with a fused lead, an SWR meter and a 15 m outdoor feed line.
 * Fixtures (match the S6 brief):
 * - test channel 146.550 FM; dummy load rated 100 W for 5 min; the radio runs 25 W
 * - the radio reaches the SWR meter through a 1 m reference lead; the meter feeds the long coax and the antenna
 * - the long coax is crushed where it passes the window: high SWR on the antenna and with a load at the far end,
 *   and a centre-to-shield DC reading of about 40 ohms with both ends disconnected
 * - a spare 15 m coax sits on the shelf; installing it clears the fault
 * - the remote station is Riley (KD0RLY), simplex on the test channel
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';

export const S06_FAULT_ID = 'crushed-window-coax';

const weatherSheet: Worksheet = {
  id: 's06-weatherproof',
  title: 'Protect the new cable',
  prompt: 'The new coax runs through a window to an outdoor antenna. Choose the best way to protect the outdoor connection and the cable.',
  fields: [
    {
      id: 'method',
      label: 'Protection plan',
      kind: 'choice',
      options: [
        'Seal the outdoor connector with self-amalgamating tape and leave a drip loop below it',
        'Leave the connector bare so it can dry out',
        'Wrap the connector in kitchen foil',
        'Pinch the cable in the window frame so it stays put',
      ],
      answer: 'Seal the outdoor connector with self-amalgamating tape and leave a drip loop below it',
    },
  ],
  explanation:
    'Water in a coax connector raises loss and SWR over time. Sealing the connector and leaving a drip loop sends rain away from it, and the cable should never be pinched, because crushing it is what failed the first one.',
  wrongFeedback: { method: 'Think about where rain runs and what damaged the old cable.' },
};

export const s06Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 606,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Bench', description: 'Bench with the mobile radio, SWR meter and cable run', position: { xKm: 0, yKm: 0, heightM: 4 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 4 },
  devices: [
    { id: 'mobile', kind: 'mobile', label: 'Mobile radio', location: 'bench', profileId: 'dual-band-mobile', powered: true, radio: { vfoMHz: 146.55, mode: 'FM', txPowerW: 25 } },
    { id: 'psu', kind: 'power-supply', label: '13.8 V bench supply', location: 'bench', powered: true, dcSystem: { radioId: 'mobile', source: 'supply' } },
    { id: 'ref-lead', kind: 'coax', label: 'Short reference lead', location: 'bench', coax: { type: 'rg8x', length: 1, unit: 'm' } },
    { id: 'swr', kind: 'swr-meter', label: 'Directional wattmeter and SWR meter', location: 'bench' },
    {
      id: 'long-coax',
      kind: 'coax',
      label: 'Long feed line (15 m)',
      location: 'bench',
      coax: { type: 'rg8x', length: 15, unit: 'm', fault: { kind: 'crushed-coax', gammaMag: 0.55, extraLossDb: 1.5, dcShortOhm: 40 } },
      inspectNote: 'The jacket is intact for most of its length.',
    },
    { id: 'outdoor-ant', kind: 'antenna', label: 'Outdoor vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
    {
      id: 'barrel',
      kind: 'adapter',
      label: 'Jack-to-jack barrel adapter',
      location: 'bench',
      adapter: { a: { family: 'UHF', gender: 'jack' }, b: { family: 'UHF', gender: 'jack' } },
    },
    { id: 'spare-coax', kind: 'coax', label: 'Spare 15 m coax', location: 'bench', coax: { type: 'rg8x', length: 15, unit: 'm' }, spare: true },
  ],
  connections: [
    { id: 'mob-ref', a: { deviceId: 'mobile', portId: 'ant' }, b: { deviceId: 'ref-lead', portId: 'a' }, seated: true },
    { id: 'ref-swr', a: { deviceId: 'ref-lead', portId: 'b' }, b: { deviceId: 'swr', portId: 'tx' }, seated: true },
    { id: 'swr-long', a: { deviceId: 'swr', portId: 'ant' }, b: { deviceId: 'long-coax', portId: 'a' }, seated: true },
    { id: 'long-ant', a: { deviceId: 'long-coax', portId: 'b' }, b: { deviceId: 'outdoor-ant', portId: 'in' }, seated: true },
  ],
  faults: [
    {
      id: S06_FAULT_ID,
      target: 'long-coax',
      kind: 'crushed-coax',
      inspectClue: 'About 4 m along the run the cable is flattened where the window frame closes on it. The jacket is creased and the cable has a permanent kink.',
      clearedBy: { action: 'install', spareKind: 'coax' },
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
  worksheets: [weatherSheet],
  cards: [
    {
      id: 's06-split-the-path',
      title: 'Split the path',
      body: 'Test the radio into a dummy load first. Then put the load at the far end of the suspect cable. A bad result moves with the part that failed, so test one section at a time.',
    },
    {
      id: 's06-coax-dc',
      title: 'Coax DC test',
      body: 'Power the radio off and disconnect both ends. A good coax reads open between centre and shield. A low reading means the cable is shorted inside.',
    },
  ],
  hints: {
    'fault-baseline': 'Key the radio briefly into the antenna, read the SWR meter while keyed, then release.',
    'test-radio-locally': 'Power the radio off, move the meter output to the dummy load, power on, and take a short reading.',
    'test-feed-line': 'Reconnect the meter to the long coax. At its far end, use the barrel adapter to put the dummy load in place of the antenna.',
    'inspect-route': 'Inspect the long coax. For the DC test, power off and disconnect both ends of that cable first.',
  },
};
