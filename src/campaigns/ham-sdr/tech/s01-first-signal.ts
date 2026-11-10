import { connectionSeated, eventHappened, faultCleared, heard, radioSetting, signalVisible, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { s01Station } from './s01-station';

/**
 * C3 Technician Scenario 1 - "The First Signal" (receive-only)
 *
 * Fixtures (see s01-station.ts and the S1 mission brief):
 * - USB SDR -> SMA adapter -> 3 m RG-58 -> simple vertical, laptop on USB.
 * - The SMA plug at the SDR is only finger-loose (fault `loose-sma`, about 12 dB of extra loss). It
 *   can only be seated with the SDR powered down. The USB cable starts unplugged.
 * - The SDR boots on 146.200 MHz, 25 kHz filter, squelch 10, volume 5.
 * - Training transmission: 146.550 MHz FM, about 6.9 dB SNR with the plug loose and 18.6 dB seated.
 *   Squelch 10 (about -70 dBm) stays closed on it either way, which is the "audio path" lesson.
 * - Filter lesson: the 15 kHz preset is correct; below 12 kHz the FM voice clips (filter-too-narrow).
 *
 * Evidence: rx:sdr:squelch-closed and rx:sdr:filter-too-narrow are transition events logged by the
 * receive loop the first time those impairments appear on the training signal. The player is told
 * to leave the squelch alone until the audio-path objective.
 */
const SQUELCH_CLOSED = 'rx:sdr:squelch-closed';
const NARROW = 'rx:sdr:filter-too-narrow';

export const hamTechS01Data: ScenarioData = {
  id: 'ham-tech-s01',
  url: 'ham-sdr/scenarios/ham-tech-s01',
  imageUrl: 'home-sdr/1/card.png',
  number: 1,
  title: 'The First Signal',
  subtitle: 'Trace a receive chain and hear your first signal',
  duration: '20-25 min',
  difficulty: 'beginner',
  missionType: 'Station Session',
  description:
    '<p>Riley has put a USB receiver, a laptop and a short antenna cable on the bench. Follow the signal from the antenna to the laptop, fix what is loose, then tune in a fictional club training transmission and write down its message.</p><p>This session is receive-only. Nothing here lets you transmit.</p>',
  equipment: ['USB SDR receiver', 'Laptop', 'Short coax jumper and SMA adapter', 'Simple vertical antenna'],
  settings: techSettings(1, s01Station),
  objectives: [
    briefObjective('Open the mission brief. It shows the bench layout and the training signal card.'),
    ...chain('review-mission-brief', [
      {
        id: 'trace-receive-path',
        title: 'Trace the Receive Path',
        description: 'Match each part of the bench to its job, then plug the receiver into the laptop so the whole chain from antenna to laptop is connected.',
        points: 10,
        conditions: [
          worksheetCorrect('s01-trace', 'Receive path matched'),
          connectionSeated('sdr.usb~laptop.usb1', 'Receiver connected to the laptop'),
          quiz('S01-Q1'),
          quiz('S01-Q2'),
        ],
      },
      {
        id: 'inspect-antenna-plug',
        title: 'Inspect the Antenna Plug',
        description: 'Inspect the antenna plug at the receiver. Power the receiver down, seat the connector fully, then power it back on.',
        points: 10,
        conditions: [
          eventHappened('inspect:sdr-sma', {}, 'Plug inspected'),
          eventHappened('seat:sdr-sma', { afterEvent: 'inspect:sdr-sma' }, 'Plug seated after inspection'),
          faultCleared('loose-sma', 'Loose connector corrected'),
        ],
      },
      {
        id: 'find-training-signal',
        title: 'Find the Training Signal',
        description: 'Tune to 146.550 MHz in FM and pick the 15 kHz filter. Leave the squelch alone for now. The signal should show up in the waterfall.',
        points: 10,
        conditions: [
          signalVisible('training', 'sdr', 10, 'Training signal in the waterfall'),
          radioSetting('sdr', (s) => Math.abs(s.vfoMHz - 146.55) < 0.002 && s.mode === 'FM' && s.filterHz === 15000, '146.550 MHz, FM, 15 kHz filter'),
        ],
      },
      {
        id: 'open-audio-path',
        title: 'Open the Audio Path',
        description: 'You can see the signal but hear nothing. Turn the volume up first and watch what happens, then work out which control is holding the audio back and open it.',
        points: 15,
        conditions: [
          eventHappened(SQUELCH_CLOSED, {}, 'Squelch held the audio closed'),
          heard('training', 0.5, { deviceId: 'sdr', afterEvent: SQUELCH_CLOSED }, 'Audio reaches the speaker'),
          quiz('S01-Q3'),
          quiz('S01-Q4'),
          quiz('S01-A1'),
        ],
      },
      {
        id: 'compare-filter-settings',
        title: 'Compare the Filter Settings',
        description:
          'Select a filter narrower than the signal and listen to the distortion. Then restore a filter that suits an FM voice signal and confirm the audio is clear again.',
        points: 15,
        conditions: [
          eventHappened(NARROW, {}, 'Too-narrow filter heard'),
          heard('training', 0.8, { deviceId: 'sdr', afterEvent: NARROW }, 'Clear audio after the filter change'),
          radioSetting('sdr', (s) => s.filterHz >= 12000 && s.filterHz <= 30000, 'Filter suited to FM voice'),
          quiz('S01-Q5'),
          quiz('S01-Q6'),
          quiz('S01-A2'),
        ],
      },
      {
        id: 'recover-message',
        title: 'Recover the Message',
        description: 'Hold a stable, clear reception and select the message the training transmission actually sent.',
        points: 20,
        conditions: [
          heard('training', 0.8, { deviceId: 'sdr' }, 'Stable, intelligible reception'),
          worksheetCorrect('s01-message', 'Message recorded'),
          quiz('S01-Q7'),
          quiz('S01-Q8'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("I've put the receiver and cables on the bench. Let's follow the signal from the antenna to the laptop before we turn anything on.", Emotion.HAPPY),
    objectives: {
      'review-mission-brief': riley("Good, you've seen the bench. Next, match each part to its job, because you can't fix a path you haven't traced.", Emotion.NEUTRAL),
      'trace-receive-path': riley(
        "That's the whole chain: antenna, cable, adapter, receiver, laptop. Now look closely at the plug on the receiver, because one connector here isn't quite finished.",
        Emotion.CONFIDENT
      ),
      'inspect-antenna-plug': riley(
        "It's seated properly, and the receiver was off while you did it. Fun fact: a loose connector can cost more signal than a long cable run. Now go find the training signal.",
        Emotion.HAPPY
      ),
      'find-training-signal': riley("There it is on the waterfall! A signal you can see isn't always one you can hear, though, so let's find out why it's quiet.", Emotion.EXCITED),
      'open-audio-path': riley(
        "Volume only makes sound louder once it exists. The squelch is the gate in front of it, so you opened the right control. Next we'll see what the filter does.",
        Emotion.CONFIDENT
      ),
      'compare-filter-settings': riley(
        "Too narrow and the voice gets clipped, wide enough and it sounds natural. You've heard the difference yourself, so you won't be guessing later.",
        Emotion.CONFIDENT
      ),
      'recover-message': riley(
        'You followed the signal through every connection, and now you can hear the message. Keep that approach when the station gets bigger.',
        Emotion.HAPPY
      ),
    },
  },
};
