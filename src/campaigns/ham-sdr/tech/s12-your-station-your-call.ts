import {
  brownoutSeen,
  contactComplete,
  devicePoweredOff,
  dummyLoadUsed,
  eventHappened,
  faultCleared,
  heard,
  keyReleased,
  measured,
  netCheckedIn,
  netClosed,
  netMessageExact,
  noResetDuringTx,
  radioSetting,
  repeaterAccess,
  repeaterOutageStarted,
  worksheetCorrect,
} from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s09-12-helpers';
import { S12_FAULT_ID, S12_RESERVE_WH, S12_RESET_V, s12Station } from './s12-station';

/**
 * C3 Technician Scenario 12 - "Your Station, Your Call" (portable station capstone)
 *
 * Fixtures (see s12-station.ts and the S12 mission brief):
 * - 90 minutes of operation, 120 Wh battery, 30 Wh reserve; 12 W receive, 60 W transmit, 20 percent transmit
 *   duty: 21.6 W average, 32.4 Wh used, 87.6 Wh left.
 * - The DC lead has a poor connection: harmless at 5 W, the radio resets when keyed at 50 W.
 * - Club repeater 146.940 MHz (-600 kHz, 100.0 Hz); net control W0SRC announces a planned repeater outage and
 *   the 147.525 MHz FM simplex fallback; the message is relayed to N0RCV word for word.
 *
 * Quiz placement: the plan puts Q3-Q4/A1 after check-in/repair, Q5-Q6/A2 after relay/fallback and Q7-Q8 after
 * pack-down. Those steps all involve a transmission, so the non-transmitting parts were split into their own
 * objectives (replace-lead, check-radiogram, pack-down) and carry the quiz rows.
 */
const FAULT_REPAIRED = `repair:${S12_FAULT_ID}`;
const FIFTY_W = (w: number): boolean => w >= 50;

export const hamTechS12Data: ScenarioData = {
  id: 'ham-tech-s12',
  url: 'ham-sdr/scenarios/ham-tech-s12',
  imageUrl: 'home-sdr/8/card.png',
  number: 12,
  title: 'Your Station, Your Call',
  subtitle: 'Plan, set up, repair and operate a portable station for a club net, then pack down and report',
  duration: '45-55 min',
  difficulty: 'advanced',
  missionType: 'Station Session',
  description:
    '<p>The club net is practicing from a portable site. Plan the setup and the energy budget, build the station, check into the net, find and fix a power fault, handle the planned repeater outage and relay a message exactly. The decisions are yours.</p><p>The stations and the net are simulation fixtures. Ordinary FCC rules still apply.</p>',
  equipment: ['Portable mast and antenna', 'Dual-band FM mobile with fused DC lead', '120 Wh battery', 'Multimeter and dummy load', 'Spare coax and DC lead', 'Club net card'],
  settings: techSettings(12, s12Station, { date: '2027-03-13', wallTime: '14:00:00' }),
  objectives: [
    briefObjective('Open the mission brief. It lists the kit, the exercise numbers, the net card and the operations checklist.'),
    ...chain('review-mission-brief', [
      {
        id: 'plan-portable-station',
        nice: ['K0645'],
        title: 'Plan the Portable Station',
        description:
          'Choose a safe site, cable route, public clearance and weather plan. Then work out the energy plan from the kit: average power, energy used, energy left and whether the reserve holds.',
        points: 15,
        conditions: [worksheetCorrect('s12-site', 'Site and safety plan chosen'), worksheetCorrect('s12-energy', 'Energy plan worked out'), quiz('S12-Q1'), quiz('S12-Q2')],
      },
      {
        id: 'assemble-and-test',
        nice: ['K0645'],
        title: 'Assemble and Test the Equipment',
        description:
          'Inspect the mast feed line, test the radio into the dummy load at low power, then connect the mast and listen for the club check source on 146.580 MHz to confirm the receiver is healthy.',
        points: 15,
        conditions: [
          eventHappened('inspect:feed', {}, 'Mast feed line inspected'),
          dummyLoadUsed({ radioId: 'mobile' }, 'Low-power test transmitted into the dummy load'),
          heard('club-check', 0.6, { deviceId: 'mobile' }, 'Club check source copied through the mast'),
        ],
      },
      {
        id: 'check-into-net',
        nice: ['K0645'],
        title: 'Check into the Club Net',
        description: 'Set the radio for the club repeater from the net card, wait for net control to call for check-ins, and check in with your call sign.',
        points: 10,
        conditions: [netCheckedIn('Checked in with your call sign')],
      },
      {
        id: 'diagnose-fault',
        nice: ['K0645'],
        title: 'Diagnose the Station Fault',
        description:
          'Net control asks for full power. Set 50 W and key briefly: the radio resets and the log records both voltages. Then key a short test at 5 W and read the battery terminals and the radio terminals while it transmits, and compare them.',
        points: 20,
        conditions: [
          brownoutSeen('batt', { maxRadioV: S12_RESET_V, minSourceV: 12.5 }, 'Reset logged with the radio below the reset point and the battery still high'),
          measured(
            { instrument: 'multimeter', quantity: 'voltage', placement: { target: 'batt', red: 'psu+', black: 'psu-' }, underLoad: true, min: 13, current: false },
            'Battery terminals read high while transmitting at low power'
          ),
          measured(
            { instrument: 'multimeter', quantity: 'voltage', placement: { target: 'batt', red: 'radio+', black: 'radio-' }, underLoad: true, max: 12.9, current: false },
            'Radio terminals read lower than the battery while transmitting'
          ),
        ],
      },
      {
        id: 'replace-lead',
        nice: ['K0645'],
        title: 'Replace the Lead',
        description: 'Inspect the lead, switch the battery off, replace the lead and keep the fuse. Then switch the battery and the radio back on.',
        points: 15,
        conditions: [
          eventHappened('inspect:batt', {}, 'Lead inspected'),
          faultCleared(S12_FAULT_ID, 'Poor lead replaced'),
          eventHappened('power:mobile', { afterEvent: FAULT_REPAIRED }, 'Radio powered back on after the repair'),
          quiz('S12-Q3'),
          quiz('S12-Q4'),
          quiz('S12-A1'),
        ],
      },
      {
        id: 'verify-repair',
        nice: ['K0645'],
        title: 'Verify the Repair Under Load',
        description:
          'Repeat what exposed the fault: transmit at 50 W through the repeater and read the radio terminals while you transmit. The repeater must answer and the radio must not reset.',
        points: 15,
        conditions: [
          radioSetting('mobile', (s) => FIFTY_W(s.txPowerW), 'fifty-watts', 'Radio set to 50 W'),
          measured(
            {
              instrument: 'multimeter',
              quantity: 'voltage',
              placement: { target: 'batt', red: 'radio+', black: 'radio-' },
              underLoad: true,
              min: 12.7,
              afterEvent: FAULT_REPAIRED,
              current: false,
            },
            'Radio terminals hold the voltage while transmitting'
          ),
          noResetDuringTx(FAULT_REPAIRED, 3, { radioId: 'mobile' }, 'A 3 s transmission ends without a reset'),
          repeaterAccess('relayed', { afterEvent: FAULT_REPAIRED }, 'The repeater relayed the transmission'),
        ],
      },
      {
        id: 'move-to-fallback',
        nice: ['K0645'],
        title: 'Move to the Fallback Channel',
        description:
          'When net control announces the planned repeater outage and the repeater goes off the air, move to the 147.525 MHz simplex channel and confirm that the station at the club tent can be reached.',
        points: 15,
        conditions: [
          repeaterOutageStarted('The planned repeater outage has started'),
          radioSetting('mobile', (s) => Math.abs(s.vfoMHz - 147.525) < 0.0005 && s.offset === 'simplex', 'fallback-simplex', 'Radio on 147.525 MHz simplex'),
          contactComplete('bel', { items: ['report'], identified: true }, 'Reachability confirmed with N0BEL on the fallback channel'),
        ],
      },
      {
        id: 'relay-exact-message',
        nice: ['K0645'],
        title: 'Relay the Exact Message',
        description:
          'Send the assigned message to N0RCV on the fallback channel exactly as written. Use phonetics for the unusual words, ask for a fill only if you need one, and listen to the readback.',
        points: 25,
        conditions: [netMessageExact('Message relayed word for word on the fallback channel', { onFallback: true })],
      },
      {
        id: 'check-radiogram',
        nice: ['K0645'],
        title: 'Check the Radiogram Header',
        description: 'Fill in the check for the message you relayed and the precedence of the request.',
        points: 10,
        conditions: [worksheetCorrect('s12-radiogram', 'Radiogram header checked'), quiz('S12-Q5'), quiz('S12-Q6'), quiz('S12-A2')],
      },
      {
        id: 'close-station',
        nice: ['K0645'],
        title: 'Close the Net',
        description: 'Identify with your call sign to close the net.',
        points: 5,
        conditions: [netClosed('Net closed with your call sign'), keyReleased('Key released')],
      },
      {
        id: 'pack-down',
        nice: ['K0645'],
        title: 'Power Down and Pack',
        description: `Power the radio down, then read the battery gauge to record the reserve. It must be at least ${S12_RESERVE_WH} Wh. Then write the close-out report for the old lead.`,
        points: 15,
        conditions: [
          devicePoweredOff('mobile', 'Radio powered down'),
          measured(
            { instrument: 'battery-monitor', quantity: 'battery-energy', placement: { target: 'batt' }, min: S12_RESERVE_WH, current: false },
            'Battery gauge read and the 30 Wh reserve is still there'
          ),
          worksheetCorrect('s12-defect', 'Close-out report written'),
          quiz('S12-Q7'),
          quiz('S12-Q8'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("You've got the kit list and the net instructions. I'll be here if you need a hint, but the setup and the decisions are yours.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley('Read the checklist once, then make your plan. Safety and the energy budget come before any radio work.'),
      'plan-portable-station': riley("That plan keeps people clear and leaves most of the battery. That's what a reserve is for."),
      'assemble-and-test': riley('The dummy load took the test and the mast heard the check source. Now the receiver is known good.'),
      'check-into-net': riley("You're on the net list. Net control will have the announcements next.", Emotion.HAPPY),
      'diagnose-fault': riley('The battery is fine and the radio is starved. The missing volts are going into the lead.'),
      'replace-lead': riley("Good, you powered it down first and kept the fuse. Don't trust it until it carries a load."),
      'verify-repair': riley('Same test, same power, and the radio stays up. Now you can believe the repair.', Emotion.HAPPY),
      'move-to-fallback': riley('The repeater is off the air, but the simplex channel works fine. Bel can hear you.'),
      'relay-exact-message': riley('The readback matched word for word. That is the whole point of a relay.', Emotion.HAPPY),
      'check-radiogram': riley('The check counts the text only. It tells the receiving station if a word went missing.'),
      'close-station': riley('Closed with your call sign. Now we can pack up.'),
      'pack-down': riley(
        'You built the station, found the fault and got the message through. Keep the readings with the kit so the next setup starts with what you learned.',
        Emotion.HAPPY
      ),
    },
  },
};
