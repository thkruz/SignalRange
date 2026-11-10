/**
 * @file s12-station - Station fixture for C3 Technician S12 "Your Station, Your Call"
 * @description Portable mast, dual-band mobile radio, 120 Wh battery with a fused DC lead, meter, dummy
 * load, spare lead and the club net card. Fixtures (match the S12 brief):
 * - exercise: 90 minutes, 30 Wh reserve; radio draws 12 W receiving and 60 W transmitting, 20 percent
 *   planned transmit duty: 21.6 W average, 32.4 Wh used, 87.6 Wh left
 * - the DC lead has a poor connection (0.30 ohm): fine at 5 W, but the radio resets when keyed at 50 W
 * - club repeater W0CLB: output 146.940 MHz, input 146.340 MHz (-600 kHz), access tone 100.0 Hz
 * - net control W0SRC (Sam) opens the net, takes the check-in, announces the planned repeater outage and
 *   assigns a message for N0RCV (Bel); fallback simplex channel 147.525 MHz FM
 * - the radio starts on the repeater at 5 W; the club check source W0CHK is on 146.580 MHz
 * - all stations and the net are fictional training fixtures
 */

import { HAM_STATION_SCHEMA, type HamStationConfig, type Worksheet } from '@app/ham/ham-station-config';
import { wordCount } from '@app/ham/ops/net-control';
import { makeClubRepeaterConfig } from '@app/ham/ops/repeater';

export const S12_FAULT_ID = 'poor-dc-lead';
export const S12_RESET_V = 11.5;
export const S12_FALLBACK_MHZ = 147.525;
export const S12_REPEATER_OUT_MHZ = 146.94;
export const S12_CHECK_MHZ = 146.58;
export const S12_RESERVE_WH = 30;
export const S12_MESSAGE = 'Zebra team requests nine quarts of water at Quincy Pavilion by noon Thursday';
export const S12_MESSAGE_WORDS = wordCount(S12_MESSAGE);

const siteSheet: Worksheet = {
  id: 's12-site',
  title: 'Site and safety plan',
  prompt: 'Choose the site, cable route, public clearance and weather plan for the portable mast.',
  fields: [
    {
      id: 'site',
      label: 'Where does the mast go?',
      kind: 'choice',
      options: ['Open ground, well away from power lines and trees', 'Under the nearest power line for a good signal', 'Beside the picnic tables for convenience'],
      answer: 'Open ground, well away from power lines and trees',
    },
    {
      id: 'route',
      label: 'How does the cable run?',
      kind: 'choice',
      options: ['Along the edge, covered where people walk, away from the guy lines', 'Straight across the walkway', 'Draped over the fence'],
      answer: 'Along the edge, covered where people walk, away from the guy lines',
    },
    {
      id: 'public',
      label: 'How do you keep the public clear?',
      kind: 'choice',
      options: ['Mark a clear zone around the mast and keep a helper watching it', 'Leave the area open', 'Ask visitors to hold the mast'],
      answer: 'Mark a clear zone around the mast and keep a helper watching it',
    },
    {
      id: 'weather',
      label: 'What is the weather plan?',
      kind: 'choice',
      options: [
        'Stop and lower the mast at the first sign of a storm, then resume at a safe site and time',
        'Keep operating until the rain starts',
        'Leave the mast up and shelter in the car',
      ],
      answer: 'Stop and lower the mast at the first sign of a storm, then resume at a safe site and time',
    },
  ],
  explanation:
    'A portable mast belongs in the open, far from power lines, with the cable out of the way of people and a clear zone around the base. Weather decides first: stop, lower the mast and resume only at an offered safe site and time.',
  wrongFeedback: {
    site: 'Power lines and trees are the first hazards to rule out.',
    route: 'People walk where cables lie. Keep the run out of their way.',
    public: 'Someone must be able to see and keep people away from the mast.',
    weather: 'A storm ends the exercise at once. Plan the stop before you plan the operating.',
  },
};

const energySheet: Worksheet = {
  id: 's12-energy',
  title: 'Energy plan',
  prompt:
    'The radio draws 12 W receiving and 60 W transmitting. You plan to transmit 20 percent of the time for 90 minutes, with a 120 Wh battery and a 30 Wh reserve. Work out the average power, the energy used, the energy left and whether the reserve holds.',
  fields: [
    { id: 'avg', label: 'Average power (W)', kind: 'number', answer: 21.6, tolerance: 0.2 },
    { id: 'used', label: 'Energy used in 90 minutes (Wh)', kind: 'number', answer: 32.4, tolerance: 0.3 },
    { id: 'left', label: 'Energy left (Wh)', kind: 'number', answer: 87.6, tolerance: 0.5 },
    {
      id: 'reserve',
      label: 'Does the plan keep the 30 Wh reserve?',
      kind: 'choice',
      options: ['Yes, 87.6 Wh is well above the 30 Wh reserve', 'No, the battery runs below the reserve'],
      answer: 'Yes, 87.6 Wh is well above the 30 Wh reserve',
    },
  ],
  explanation:
    'Average power is 0.2 times 60 W plus 0.8 times 12 W, which is 21.6 W. Over 1.5 hours that is 32.4 Wh. The battery then holds 120 minus 32.4, or 87.6 Wh, well above the 30 Wh reserve. Add any accessory load explicitly if you bring one.',
  wrongFeedback: {
    avg: 'Weight each power by the share of time spent in that state, then add them.',
    used: 'Multiply the average power by the 1.5 hours of operation.',
    left: 'Subtract the energy used from the 120 Wh at the start.',
    reserve: 'Compare what is left with the reserve you must keep.',
  },
};

const radiogramSheet: Worksheet = {
  id: 's12-radiogram',
  title: 'Radiogram header check',
  prompt: `Net control gave you this text to relay: "${S12_MESSAGE}". Fill in the check for the radiogram header and choose the precedence for a routine supply request.`,
  fields: [
    { id: 'check', label: 'Check (number of words in the text)', kind: 'number', answer: S12_MESSAGE_WORDS, tolerance: 0 },
    { id: 'precedence', label: 'Precedence of a routine supply request', kind: 'choice', options: ['Routine', 'Emergency', 'Priority'], answer: 'Routine' },
    {
      id: 'count',
      label: 'What does the check count?',
      kind: 'choice',
      options: ['Only the words of the text', 'Every word of the header and the text', 'The letters in the text'],
      answer: 'Only the words of the text',
    },
  ],
  explanation:
    'The check in a radiogram header is the number of words in the text alone. The receiving station counts the words it wrote down and compares them with the check, which catches dropped or added words.',
  wrongFeedback: {
    check: 'Count the words of the text only, one by one.',
    precedence: 'A supply request for a club exercise is routine traffic.',
    count: 'The header is not part of the count.',
  },
};

const defectSheet: Worksheet = {
  id: 's12-defect',
  title: 'Close-out report',
  prompt: 'You replaced the DC lead. Write the close-out report: what happened to the old lead and what is left to report.',
  fields: [
    {
      id: 'old-lead',
      label: 'What do you do with the old lead?',
      kind: 'choice',
      options: ['Tag it as defective and set it aside so it is not used again', 'Pack it with the spares as good', 'Throw it in the trash without telling anyone'],
      answer: 'Tag it as defective and set it aside so it is not used again',
    },
    {
      id: 'report',
      label: 'What do you report?',
      kind: 'choice',
      options: [
        'The poor lead connection, the readings that showed it, and that the spare lead is now used',
        'Nothing, the station works now',
        'Only that the radio was fine all along',
      ],
      answer: 'The poor lead connection, the readings that showed it, and that the spare lead is now used',
    },
  ],
  explanation: 'Keep the readings with the kit and say which spare was used, so the next setup starts with what you learned and a replacement lead is on the list.',
  wrongFeedback: {
    'old-lead': 'A known-bad part must not return to the spares.',
    report: 'The next operator needs the fault, the evidence and the missing spare.',
  },
};

const { hears: _hears, playerCallsign: _playerCallsign, clubOperator: _clubOperator, ...repeater } = makeClubRepeaterConfig(() => ({ snrDb: 0, decoded: false }), 'KF0SRT');

export const s12Station: HamStationConfig = {
  schema: HAM_STATION_SCHEMA,
  pauseOnQuiz: true,
  seed: 112,
  operator: { license: 'technician', callsign: 'KF0SRT', name: 'You' },
  locations: [{ id: 'bench', label: 'Portable site', description: 'Open ground with the mast, radio and battery on a folding table', position: { xKm: 0, yKm: 0, heightM: 6 } }],
  startLocation: 'bench',
  stationPosition: { xKm: 0, yKm: 0, heightM: 6 },
  devices: [
    {
      id: 'mobile',
      kind: 'mobile',
      label: 'Dual-band FM mobile',
      location: 'bench',
      profileId: 'dual-band-mobile',
      powered: true,
      radio: { vfoMHz: S12_REPEATER_OUT_MHZ, mode: 'FM', txPowerW: 5, offset: 'minus', offsetKHz: 600, txToneHz: 100 },
    },
    {
      id: 'batt',
      kind: 'battery',
      label: '120 Wh battery and fused DC lead',
      location: 'bench',
      powered: true,
      dcSystem: { radioId: 'mobile', source: 'battery', batteryUsableWh: 120, batterySoc: 1, txScalesWithPower: true },
    },
    { id: 'dummy', kind: 'dummy-load', label: '100 W dummy load', location: 'bench', dummyLoad: { ratedW: 100, ratedSeconds: 300 } },
    { id: 'feed', kind: 'coax', label: 'Mast feed line (10 m)', location: 'bench', coax: { type: 'rg8x', length: 10, unit: 'm' } },
    { id: 'mast-ant', kind: 'antenna', label: 'Portable mast vertical', location: 'bench', antenna: { kind: 'quarter-wave-vertical' } },
  ],
  connections: [{ id: 'feed-ant', a: { deviceId: 'feed', portId: 'b' }, b: { deviceId: 'mast-ant', portId: 'in' }, seated: true }],
  faults: [
    {
      id: S12_FAULT_ID,
      target: 'batt',
      kind: 'high-resistance-lead',
      inspectClue: 'The DC lead has a poor connection: one crimp at the battery clamp is dull and green and the lead is warm after keying. The fuse holder is fine.',
      clearedBy: { action: 'repair' },
      deenergizeToRepair: true,
    },
  ],
  emitters: [
    {
      id: 'club-check',
      label: 'Club check source W0CHK',
      freqMHz: S12_CHECK_MHZ,
      mode: 'FM',
      erpDbm: -13,
      position: { xKm: 8, yKm: 0, heightM: 20 },
      polarization: 'V',
      payload: { kind: 'voice', text: 'This is W0CHK, the club check source. Radio check, one two three.', callsign: 'W0CHK' },
    },
  ],
  remoteStations: {
    stations: [
      {
        id: 'bel',
        callsign: 'N0BEL',
        name: 'Bel',
        location: 'the club tent',
        grid: 'EN34',
        position: { xKm: 4, yKm: 1, heightM: 10 },
        freqMHz: S12_FALLBACK_MHZ,
        mode: 'FM',
        erpDbm: 37,
        replyDelayS: 3,
        personality: ['Bel here at the club tent, go ahead.'],
      },
    ],
  },
  repeater,
  net: {
    freqMHz: S12_REPEATER_OUT_MHZ,
    ncs: { id: 'ncs', callsign: 'W0SRC', name: 'Sam', position: { xKm: 2, yKm: 2, heightM: 10 }, erpDbm: 40 },
    receiver: { id: 'rcv', callsign: 'N0RCV', name: 'Bel', position: { xKm: 4, yKm: 1, heightM: 10 }, erpDbm: 40 },
    openingS: 30,
    // The outage follows the player's progress: it starts 30 s after the first repeater relay
    // that follows the lead repair, so a slow repair never meets a dead repeater first.
    outage: {
      startsAtS: 60,
      fallbackMHz: S12_FALLBACK_MHZ,
      afterEvent: { event: 'repeater:relayed', since: `repair:${S12_FAULT_ID}`, delayS: 30 },
    },
    message: S12_MESSAGE,
  },
  energyPlan: {
    dcDeviceId: 'batt',
    reserveWh: S12_RESERVE_WH,
    card: { usableWh: 120, receiveW: 12, transmitW: 60, dutyPercent: 20, minutes: 90, reserveWh: S12_RESERVE_WH },
  },
  worksheets: [siteSheet, energySheet, radiogramSheet, defectSheet],
  cards: [
    {
      id: 's12-kit-card',
      title: 'Kit list',
      body: 'Portable mast and antenna, dual-band mobile radio with fused DC lead, 120 Wh battery, multimeter, 100 W dummy load, spare coax and spare DC lead, club net card.',
    },
    {
      id: 's12-net-card',
      title: 'Club net card',
      body: `Net control W0SRC. Repeater W0CLB output 146.940 MHz, input 146.340 MHz (-600 kHz), tone 100.0 Hz. Check in with your call sign. Net control announces a planned repeater outage: move to simplex on ${S12_FALLBACK_MHZ.toFixed(3)} MHz FM. Relay the assigned message word for word to N0RCV, use phonetics for unusual words, ask for fills and listen to the readback. The club check source W0CHK is on ${S12_CHECK_MHZ.toFixed(3)} MHz. Club net practice: ordinary FCC rules still apply.`,
    },
    {
      id: 's12-energy-card',
      title: 'Energy plan card',
      body: 'Usable energy 120 Wh. Radio draws 12 W receiving and 60 W transmitting. Planned transmit duty 20 percent for 90 minutes. Required reserve 30 Wh. Add any accessory load explicitly.',
    },
    {
      id: 's12-measure-card',
      title: 'Measure under load',
      body: 'A battery can read well with nothing drawn from it. Compare the voltage at the battery terminals with the voltage at the radio terminals while the radio transmits, because the difference is lost in the lead.',
    },
  ],
  hints: {
    'plan-portable-station': 'Rule out hazards first (power lines, the public, the weather), then work the energy plan as an average power over the 90 minutes.',
    'assemble-and-test': 'Test into the dummy load at low power first, then connect the mast feed line and listen for the club check source.',
    'check-into-net': 'Wait for net control to call for check-ins. Give your call sign when you key.',
    'diagnose-fault': 'The radio resets only at higher power. Take one reading at the battery terminals and one at the radio terminals while transmitting.',
    'replace-lead': 'Switch the battery off before touching the lead, replace the lead and keep the fuse, then switch back on.',
    'verify-repair': 'Repeat what exposed the fault: transmit at 50 W and read the radio terminals, then check the repeater answers.',
    'move-to-fallback': 'When the repeater is off the air, set 147.525 MHz FM with no offset or tone, and call the station at the club tent.',
    'relay-exact-message': 'Send the assigned text word for word. Ask for a fill if you missed a word and listen to the readback.',
    'check-radiogram': 'The check is the number of words in the text alone.',
    'close-station': 'Identify with your call sign at the end of the net.',
    'pack-down': 'Power down first, then read the battery gauge and compare it with the 30 Wh reserve.',
  },
};
