import { heard, hfContact, radioSetting, txOkWithin, txRefused, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s09-12-helpers';
import { s10Station } from './s10-station';

/**
 * C3 Technician Scenario 10 - "Beyond the Local Horizon" (ten-meter SSB, propagation, band edges)
 *
 * Fixtures (see s10-station.ts and the S10 mission brief):
 * - Technician phone segment 28.300 to 28.500 MHz, operating frequency 28.400 MHz USB, low power.
 * - The borrowed rig starts on 28.250 MHz LSB with a wide filter.
 * - K0LCL (local net) is on 28.380 MHz; W0OFF is on 28.420 MHz, 700 Hz high, and is only readable with RIT.
 * - W0SRC (Sam), the distant station, is on 28.400 MHz; the daytime path is open at scenario time.
 * - CW example 28.060 MHz (W0XQT) and FT8 example 28.074 MHz (N0FTX) come from the HF module.
 * - A USB signal occupies 2.8 kHz above the dial, so 28.498 MHz crosses the upper edge (28.4972 MHz is the highest dial).
 */
export const hamTechS10Data: ScenarioData = {
  id: 'ham-tech-s10',
  url: 'ham-sdr/scenarios/ham-tech-s10',
  imageUrl: 'home-sdr/8/card.png',
  number: 10,
  title: 'Beyond the Local Horizon',
  subtitle: 'Operate within the Technician ten-meter phone segment, choose mode and filter, read propagation evidence and make a short HF contact',
  duration: '30-40 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    '<p>The club has lent Riley an HF transceiver and a ten-meter dipole. Check your privileges, set the radio for voice, fine tune with RIT, and make a short contact with a distant station while the band is open.</p><p>The stations and band conditions are simulation fixtures. Real conditions change from day to day.</p>',
  equipment: ['Borrowed multimode HF transceiver', 'Ten-meter dipole', 'Band and privilege card'],
  settings: techSettings(10, s10Station, { date: '2027-03-13', wallTime: '11:00:00' }),
  objectives: [
    briefObjective('Open the mission brief. It lists the ten-meter privileges, the operating frequency and the checklist.'),
    ...chain('review-mission-brief', [
      {
        id: 'check-segment',
        nice: ['K0645'],
        title: 'Check the Segment',
        description:
          'Read the privilege card and answer the worksheet: the phone segment limits, the highest USB dial frequency that keeps the whole signal inside it, and whether voice is allowed on 28.250 MHz.',
        points: 10,
        conditions: [worksheetCorrect('s10-segment', 'Segment limits worked out'), quiz('S10-Q1'), quiz('S10-Q2')],
      },
      {
        id: 'set-mode-and-filter',
        nice: ['K0645'],
        title: 'Set the Mode and Filter',
        description: 'Tune to the local net on 28.380 MHz, select upper sideband and a receive filter between 2.4 and 3 kHz, and listen until you copy the local net station.',
        points: 15,
        conditions: [
          heard('s10-local-net', 0.6, { deviceId: 'hf' }, 'Local net station copied'),
          radioSetting('hf', (s) => s.mode === 'USB' && s.filterHz >= 2400 && s.filterHz <= 3000, 'usb-2400-3000', 'USB with a 2.4 to 3 kHz filter'),
          quiz('S10-Q3'),
          quiz('S10-Q4'),
          quiz('S10-A1'),
        ],
      },
      {
        id: 'tune-with-rit',
        nice: ['K0645'],
        title: 'Fine Tune with RIT',
        description:
          'A station on 28.420 MHz is a few hundred hertz off your dial and sounds distorted. Tune there, turn on RIT and use it to copy that station, then transmit briefly to confirm that your transmit frequency stayed on 28.420 MHz.',
        points: 15,
        conditions: [
          heard('s10-offset-voice', 0.6, { deviceId: 'hf' }, 'Off-frequency station copied'),
          radioSetting('hf', (s) => s.ritOn, 'rit-on', 'RIT is on'),
          txOkWithin('hf', 28.4199, 28.4201, {}, 'Transmitted on the dial frequency with RIT on'),
        ],
      },
      {
        id: 'read-propagation',
        nice: ['K0645'],
        title: 'Read the Propagation Evidence',
        description: 'Use the propagation examples to match line of sight, an ionospheric path, sporadic E, ducting and the radio horizon to what each one shows.',
        points: 10,
        conditions: [worksheetCorrect('s10-propagation', 'Propagation examples matched'), quiz('S10-Q5'), quiz('S10-Q6'), quiz('S10-A2')],
      },
      {
        id: 'make-hf-contact',
        nice: ['K0645'],
        title: 'Make the HF Contact',
        description: 'Listen on 28.400 MHz, then call CQ at low power. When W0SRC answers, give a signal report and identify with KF0SRT at the end.',
        points: 25,
        conditions: [hfContact({ identified: true }, 'Contact completed with W0SRC')],
      },
      {
        id: 'compare-modes',
        nice: ['K0645'],
        title: 'Compare CW and FT8',
        description: 'Tune the CW example on 28.060 MHz and the FT8 example on 28.074 MHz, compare how narrow they are, and place them on the band chart.',
        points: 15,
        conditions: [
          heard('hf-bg-cw', 0.3, { deviceId: 'hf' }, 'CW example copied'),
          heard('hf-bg-ft8', 0.3, { deviceId: 'hf' }, 'FT8 example inspected'),
          worksheetCorrect('s10-allowed', 'Examples placed on the band chart'),
          quiz('S10-Q7'),
          quiz('S10-Q8'),
        ],
      },
      {
        id: 'reject-band-edge',
        nice: ['K0645'],
        title: 'Reject the Band Edge',
        description:
          'Set USB on 28.498 MHz and try a short test transmission. The radio should refuse it. Then choose a dial frequency that keeps the whole signal inside the segment and transmit briefly.',
        points: 10,
        conditions: [
          txRefused('band-edge', {}, 'The band-edge setting was refused'),
          txOkWithin('hf', 28.3, 28.4972, { afterEvent: 'txRefused:band-edge' }, 'A valid setting transmitted'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley(
      "This borrowed radio opens up ten meters. We'll check your frequency privileges first, because the whole band isn't available for Technician voice operation.",
      Emotion.NEUTRAL
    ),
    objectives: {
      'review-mission-brief': riley("You've got the privilege card. Start with the limits, because the band is split into a CW and data part and a voice part."),
      'check-segment': riley('Voice starts at 28.300 MHz, and a USB signal reaches 2.8 kHz above the dial. That is why the top of the dial range is below 28.500 MHz.'),
      'set-mode-and-filter': riley("There's the local net, loud and clear. Upper sideband and a narrow voice filter keep out the noise you don't need."),
      'tune-with-rit': riley('That fixed the pitch without moving your transmitter. RIT only changes what you hear, so your transmitter is still on 28.420 MHz.', Emotion.HAPPY),
      'read-propagation': riley("Now you can tell what's carrying a signal. A direct path ends at the horizon, but the ionosphere can bend a signal back down far away."),
      'make-hf-contact': riley('You called, Sam answered, and you identified. The band was open, but you still had to set up the station.', Emotion.HAPPY),
      'compare-modes': riley('CW and FT8 take up much less room than voice, and both live below the voice segment.'),
      'reject-band-edge': riley(
        'You checked the band segment, chose the right mode and got a clear reply. The propagation helped, but you still had to set up the station.',
        Emotion.HAPPY
      ),
    },
  },
};
