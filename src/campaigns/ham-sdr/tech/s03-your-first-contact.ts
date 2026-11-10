import {
  contactComplete,
  contactItems,
  eventHappened,
  faultCleared,
  heard,
  keyReleased,
  listenedBeforeFirstCall,
  monitoredChannelClear,
  radioSetting,
  worksheetCorrect,
} from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S03_CHANNEL_MHZ, S03_CHAT_A, S03_CHAT_B, s03Station } from './s03-station';

/**
 * C3 Technician Scenario 3 - "Your First Contact"
 *
 * Fixtures (see s03-station.ts and the S3 mission brief):
 * - 5 W dual-band handheld, supplied rubber-duck antenna, license technician (KF0SRT).
 * - The battery pack starts unseated (fault ht-battery); the radio boots on 146.520 MHz at 5 W.
 * - Contact channel 146.550 MHz FM simplex with W0SRC "Sam" (replies 3 s after a decoded call).
 * - Two operators (N0DLE, W0PAT) hold a scripted conversation on the channel for 35 s after the player tunes
 *   to it. A call during it is a collision (note 'channel-busy', no reply, never a contact).
 * - The HT mic gain starts at 9. Sam flags distorted audio; setting the gain to 4-6 earns 'mic-adjusted'.
 *
 * Evidence: monitoredChannel counts simulated seconds with a powered radio on the channel (paused
 * quizzes do not advance it). listenedBeforeFirstCall is true once the first call has gone out
 * after at least 10 s of monitoring. contactItems and contactComplete read the contact record.
 */
const CH = S03_CHANNEL_MHZ;
const onChannel = (s: { vfoMHz: number; mode: string; offset: string }): boolean => Math.abs(s.vfoMHz - CH) < 0.002 && s.mode === 'FM' && s.offset === 'simplex';

export const hamTechS03Data: ScenarioData = {
  id: 'ham-tech-s03',
  url: 'ham-sdr/scenarios/ham-tech-s03',
  imageUrl: 'home-sdr/3/card.png',
  number: 3,
  title: 'Your First Contact',
  subtitle: 'Check the station, listen first, then make a simple contact',
  duration: '25-35 min',
  difficulty: 'beginner',
  missionType: 'Station Session',
  description:
    '<p>Your call sign is in the license database and Riley has handed you a 5 W handheld. Confirm your privileges, check the battery and antenna, listen to the channel and then work a fictional club operator on simplex.</p><p>The call signs in this session are fictional training stations. Completing the session earns an in-game badge, not a license.</p>',
  equipment: ['5 W dual-band handheld', 'Battery pack', 'Supplied rubber-duck antenna', 'Privilege and contact reference cards'],
  settings: techSettings(3, s03Station),
  objectives: [
    briefObjective('Open the mission brief. It shows the privilege chart and the contact script.'),
    ...chain('review-mission-brief', [
      {
        id: 'confirm-station-privileges',
        title: 'Confirm the Station Privileges',
        description: 'Check the privilege card and answer the worksheet: where you may transmit, how much power to use, and when to give your call sign.',
        points: 10,
        conditions: [worksheetCorrect('s03-privileges', 'Privileges confirmed'), quiz('S03-Q1'), quiz('S03-Q2')],
      },
      {
        id: 'check-power-connection',
        title: 'Check the Power Connection',
        description: 'Inspect the handheld and its antenna. Reseat the battery pack so the radio has power, then confirm the antenna is attached.',
        points: 10,
        conditions: [
          eventHappened('inspect:ht', {}, 'Handheld inspected'),
          eventHappened('inspect:ht-ant', {}, 'Antenna inspected'),
          faultCleared('ht-battery', 'Battery pack seated'),
        ],
      },
      {
        id: 'review-antenna-clearance',
        title: 'Review the Antenna Clearance',
        description: 'Answer the exposure worksheet about how to hold the radio and which choice lowers your exposure.',
        points: 10,
        conditions: [worksheetCorrect('s03-exposure', 'Exposure worksheet complete'), quiz('S03-Q3'), quiz('S03-Q4'), quiz('S03-A1')],
      },
      {
        id: 'listen-before-calling',
        title: 'Listen Before Calling',
        description:
          'Tune to 146.550 MHz FM simplex and choose a low transmit power. Listen. If two operators are talking, wait until they are done, then keep listening for 10 more seconds with the channel clear before you call.',
        points: 15,
        conditions: [
          radioSetting('ht', (s) => onChannel(s) && s.txPowerW <= 2.5, '146.550 MHz FM simplex, low power'),
          heard(S03_CHAT_A, 0.3, { deviceId: 'ht' }, 'You heard the ongoing conversation'),
          heard(S03_CHAT_B, 0.3, { deviceId: 'ht' }, 'You heard both operators'),
          monitoredChannelClear(CH, 10, 'Channel clear for 10 seconds'),
        ],
      },
      {
        id: 'make-first-call',
        title: 'Make the First Call',
        description:
          'Once the channel is clear, key the radio, call W0SRC with your call sign, and release the key. Then listen for the answer. A call over another conversation is a collision and nobody will answer.',
        points: 15,
        conditions: [listenedBeforeFirstCall(10, 'Called on a clear channel after listening first'), heard('sam', 0.5, { deviceId: 'ht' }, 'W0SRC answers your call')],
      },
      {
        id: 'exchange-signal-report',
        title: 'Exchange a Signal Report',
        description:
          'Send your name, your location and a signal report one at a time, releasing the key between transmissions. Wait for Sam to answer each one. If Sam says your audio is distorted, lower the microphone gain to between 4 and 6 and send again until he says it is clean.',
        points: 15,
        conditions: [
          contactItems('sam', ['name', 'location', 'report', 'mic-adjusted'], 'Name, location and report exchanged, audio clean'),
          keyReleased('Key released'),
          quiz('S03-Q5'),
          quiz('S03-Q6'),
          quiz('S03-A2'),
        ],
      },
      {
        id: 'close-the-contact',
        title: 'Close the Contact',
        description: 'Finish with your call sign and release the key. The contact only counts when you identify at the end.',
        points: 25,
        conditions: [contactComplete('sam', { identified: true }, 'Contact closed with your call sign'), keyReleased('Key released'), quiz('S03-Q7'), quiz('S03-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("Your call sign's in the license database. Before your first call, we'll check the station and make sure the channel's free.", Emotion.HAPPY),
    objectives: {
      'review-mission-brief': riley(
        "Good. Before anything gets keyed, let's confirm what your license lets you do, because the radio will transmit wherever you tell it to.",
        Emotion.NEUTRAL
      ),
      'confirm-station-privileges': riley(
        "That's your starting point: the whole two meter band, the minimum power you need, and your call sign at the end. Now let's see if this radio even has power.",
        Emotion.CONFIDENT
      ),
      'check-power-connection': riley(
        "The battery wasn't clicked in, so the radio never had a chance. Fun fact: a loose battery is one of the most common reasons a handheld looks dead.",
        Emotion.HAPPY
      ),
      'review-antenna-clearance': riley(
        "Antenna away from your head and the power as low as you can get away with. That's a good habit to start with. Now we'll listen before we talk.",
        Emotion.CONFIDENT
      ),
      'listen-before-calling': riley(
        "They finished, and then you gave the channel ten quiet seconds. Now it's fine to call. Skipping this step is how new operators talk over a conversation.",
        Emotion.CONFIDENT
      ),
      'make-first-call': riley(
        'W0SRC heard you and answered. A call only counts when the other station decodes it, so that reply is the proof. Now give Sam your details.',
        Emotion.EXCITED
      ),
      'exchange-signal-report': riley(
        'Name, location and a report, one transmission at a time. Your audio was too hot at first, and backing off the mic is what made it clean. Letting go of the key between them leaves room for Sam to answer.',
        Emotion.HAPPY
      ),
      'close-the-contact': riley("They heard you clearly, and you left room for the reply. That's your first complete contact on this station.", Emotion.HAPPY),
    },
  },
};
