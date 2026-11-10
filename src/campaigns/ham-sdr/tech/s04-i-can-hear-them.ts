import {
  contactComplete,
  dmrFailureSeen,
  dmrResponse,
  eventHappened,
  keyReleased,
  radioSetting,
  relayHeard,
  repeaterAccess,
  repeaterLogged,
  worksheetCorrect,
} from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S04_ACCESS_TONE_HZ, S04_DMR_GOOD_INDEX, S04_REPEATER_OUT_MHZ, s04Station } from './s04-station';

/**
 * C3 Technician Scenario 4 - "I Can Hear Them"
 *
 * Fixtures (see s04-station.ts and the S4 mission brief):
 * - Repeater W0SRC: out 146.940 MHz, in 146.340 MHz (-600 kHz), access tone 100.0 Hz.
 * - The handheld boots on 146.940 MHz, simplex, transmit tone 123.0 Hz: it hears the repeater but is
 *   not accepted (repeater:wrong-frequency, then repeater:wrong-tone once the offset is fixed).
 * - DMR loaner: card says color code 1, slot 2, talkgroup 31337. Channel 1 has the wrong color code
 *   (no-talk-permit), channel 2 the wrong slot (tg-not-on-slot), channel 3 is correct.
 *
 * Evidence: repeater:<code> events are logged by the repeater model when a transmission is
 * rejected or relayed; radio:store:ht and radio:recall:ht are logged by the manager.
 */
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const onRepeater = (s: { vfoMHz: number; mode: string; offset: string; offsetKHz: number }): boolean =>
  near(s.vfoMHz, S04_REPEATER_OUT_MHZ, 0.002) && s.mode === 'FM' && s.offset === 'minus' && s.offsetKHz === 600;

export const hamTechS04Data: ScenarioData = {
  id: 'ham-tech-s04',
  url: 'ham-sdr/scenarios/ham-tech-s04',
  imageUrl: 'home-sdr/4/card.png',
  number: 4,
  title: 'I Can Hear Them',
  subtitle: 'Receiving a repeater is only half of using it',
  duration: '30-35 min',
  difficulty: 'beginner',
  missionType: 'Station Session',
  description:
    '<p>The club repeater is loud and clear in your handheld, but it will not answer you. Read the repeater entry, work out which of your transmit settings is wrong, fix them, save the channel and make a contact. Then try a club loaner digital radio and learn why it fails in two different ways.</p><p>The stations in this session are fictional.</p>',
  equipment: ['5 W dual-band handheld', 'Supplied rubber-duck antenna', 'Club loaner DMR handheld', 'Repeater directory and digital cards'],
  settings: techSettings(4, s04Station),
  objectives: [
    briefObjective('Open the mission brief. It lists the club repeater entry and the digital card.'),
    ...chain('review-mission-brief', [
      {
        id: 'read-repeater-entry',
        title: 'Read the Repeater Entry',
        description: 'Use the directory card to copy the repeater output frequency, the offset and the access tone into the worksheet.',
        points: 10,
        conditions: [worksheetCorrect('s04-directory', 'Repeater entry copied'), quiz('S04-Q1'), quiz('S04-Q2')],
      },
      {
        id: 'check-transmit-frequency',
        title: 'Check the Transmit Frequency',
        description:
          'Key the radio briefly and read the repeater response. Then set the offset so your radio transmits on the repeater input, 600 kHz below its output, without changing the receive frequency.',
        points: 15,
        conditions: [repeaterLogged('wrong-frequency', 'Repeater did not hear the wrong frequency'), radioSetting('ht', onRepeater, '146.940 MHz FM, minus 600 kHz offset')],
      },
      {
        id: 'correct-access-tone',
        title: 'Correct the Access Tone',
        description:
          'Key the radio again and read the response. Set the transmit tone to the access tone from the entry, keep the receive frequency and offset, then key up and hear yourself relayed.',
        points: 20,
        conditions: [
          eventHappened('repeater:wrong-tone', {}, 'Repeater rejected the wrong tone'),
          radioSetting('ht', (s) => onRepeater(s) && s.txToneHz !== null && near(s.txToneHz, S04_ACCESS_TONE_HZ, 0.5), '100.0 Hz transmit tone, frequency and offset kept'),
          repeaterAccess('relayed', { afterEvent: 'repeater:wrong-tone' }, 'Repeater relays your transmission'),
          relayHeard(0.5, 'You hear your own relay'),
          keyReleased('Key released'),
          quiz('S04-Q3'),
          quiz('S04-Q4'),
          quiz('S04-A1'),
        ],
      },
      {
        id: 'save-and-recall-channel',
        title: 'Save and Recall the Channel',
        description: 'Store the working settings in a named memory, switch away from the channel, then recall the memory and key up to prove it still works.',
        points: 15,
        conditions: [
          radioSetting(
            'ht',
            (s) =>
              s.memories.some(
                (m) =>
                  m.name.trim().length > 0 &&
                  near(m.rxMHz, S04_REPEATER_OUT_MHZ, 0.002) &&
                  m.offset === 'minus' &&
                  m.offsetKHz === 600 &&
                  m.txToneHz !== null &&
                  near(m.txToneHz, S04_ACCESS_TONE_HZ, 0.5)
              ),
            'Named memory holds the repeater settings'
          ),
          eventHappened('radio:recall:ht', { afterEvent: 'radio:store:ht' }, 'Memory recalled after saving'),
          radioSetting(
            'ht',
            (s) => s.activeMemory !== null && onRepeater(s) && s.txToneHz !== null && near(s.txToneHz, S04_ACCESS_TONE_HZ, 0.5),
            'Memory channel active with the right settings'
          ),
          repeaterAccess('relayed', { afterEvent: 'radio:recall:ht' }, 'Recalled channel is relayed'),
        ],
      },
      {
        id: 'complete-repeater-contact',
        title: 'Complete the Repeater Contact',
        description:
          'Call the club operator through the repeater with your call sign, trade a name or location, then end with your call sign. A courtesy tone alone is not an answer, so wait for a real reply each time.',
        points: 20,
        conditions: [contactComplete('repeater', { identified: true }, 'Contact through the repeater closed with your call sign'), quiz('S04-Q5'), quiz('S04-Q6'), quiz('S04-A2')],
      },
      {
        id: 'explore-digital-memory',
        title: 'Explore a Digital Memory',
        description:
          'Copy the color code, time slot and talkgroup from the digital card. Then try the loaner radio channels one at a time, read why each failure happens, and load the channel that matches the card to get a reply.',
        points: 20,
        conditions: [
          worksheetCorrect('s04-dmr', 'Digital card copied'),
          dmrFailureSeen('no-talk-permit', 'Wrong color code seen'),
          dmrFailureSeen('tg-not-on-slot', 'Wrong time slot seen'),
          radioSetting('dmr-ht', (s) => s.activeDmrChannel === S04_DMR_GOOD_INDEX, 'Matching channel loaded'),
          dmrResponse('Talkgroup answers your call'),
          keyReleased('Key released'),
          quiz('S04-Q7'),
          quiz('S04-Q8'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("The repeater sounds clear, but it isn't answering us. Receiving it only proves half the path, so let's check what we're sending.", Emotion.CONCERNED),
    objectives: {
      'review-mission-brief': riley('Good. The entry card is the whole answer key, so read it closely before you touch the radio.', Emotion.NEUTRAL),
      'read-repeater-entry': riley(
        "You've got the output, the offset and the tone. Your radio hears the output, but it has to talk on the input, so that's where we start.",
        Emotion.CONFIDENT
      ),
      'check-transmit-frequency': riley(
        'The repeater listens 600 kilohertz below where it talks. Your radio was sending on the wrong frequency, so nobody ever heard you. Fun fact: that split keeps the repeater from hearing itself.',
        Emotion.CONFIDENT
      ),
      'correct-access-tone': riley(
        "The tone is like a key that opens the repeater. You changed only the tone and kept the frequency, which is exactly the right fix. Let's save it so you don't have to retype it.",
        Emotion.HAPPY
      ),
      'save-and-recall-channel': riley(
        "A memory that you've recalled and tested is worth trusting. Saving it alone proves nothing, because you only know it works once the repeater answers.",
        Emotion.CONFIDENT
      ),
      'complete-repeater-contact': riley(
        "That's a real contact. The courtesy tone is just the repeater, but the operator's reply came from a person. Now let's see what digital does differently.",
        Emotion.EXCITED
      ),
      'explore-digital-memory': riley("The antenna was working all along. You matched the repeater's settings and got a reply without replacing anything.", Emotion.HAPPY),
    },
  },
};
