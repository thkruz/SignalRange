import { bearingFound, contactComplete, eventHappened, faultCleared, measured, measuredContrast, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S08_FAULT_ID, S08_SOURCE_BEARING_DEG, s08Station } from './s08-station';

/**
 * C3 Technician Scenario 8 - "Noise in the Shack" (isolating a noise source)
 *
 * Fixtures (see s08-station.ts and the S8 mission brief):
 * - SDR on 146.550 MHz FM, 15 kHz filter, on a direction-finding Yagi; the noise rise is read with the player's own recordings.
 * - The suspect supply adds about 23 dB of noise with the Yagi at its starting heading and about 30 dB when pointed at it (55 degrees).
 *   A reflection lobe appears about 110 degrees away, 8 dB weaker. Powered off, or replaced by the spare, the rise is 0 dB.
 * - Every comparison holds frequency, bandwidth, gain and mode (and heading) unchanged between the two readings.
 * - The mobile radio starts with its microphone gain at 9; Riley reports distorted audio until it is set between 4 and 6.
 */
const SAME = ['vfoMHz', 'filterHz', 'rfGainDb', 'mode', 'azDeg'];
const SUSPECT = 'on:suspect-supply';
const CHARGER = 'on:laptop-charger';
const SPARE_INSTALLED = 'install:spare-supply';

export const hamTechS08Data: ScenarioData = {
  id: 'ham-tech-s08',
  url: 'ham-sdr/scenarios/ham-tech-s08',
  imageUrl: 'home-sdr/8/card.png',
  number: 8,
  title: 'Noise in the Shack',
  subtitle: 'Measure your own equipment before you blame the neighbours',
  duration: '30-35 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    '<p>The receive noise jumps whenever you sit down at the desk. Record the pattern, switch things off one at a time, find the direction the noise comes from, swap in a clean supply and check the sound of your own transmitted audio.</p>',
  equipment: ['USB SDR and laptop', 'Direction-finding Yagi', 'Switching supply and laptop charger', 'Spare supply', 'Mobile radio on a 13.8 V supply'],
  prerequisiteScenarioIds: ['ham-tech-s07'],
  isDisabled: false,
  settings: techSettings(8, s08Station),
  objectives: [
    briefObjective('Open the mission brief. It covers comparing noise readings under the same settings and finding a noise source with a directional antenna.'),
    ...chain('review-mission-brief', [
      {
        id: 'record-pattern',
        title: 'Record the Noise Pattern',
        description: 'Leave the tuning, gain and bandwidth alone and record the receiver noise. Every later reading is compared with this one.',
        points: 10,
        conditions: [measured({ instrument: 'receiver', quantity: 'noise-rise', min: 10, current: false }, 'Baseline noise recorded'), quiz('S08-Q1'), quiz('S08-Q2')],
      },
      {
        id: 'battery-baseline',
        title: 'Try the Battery Baseline',
        description: 'Power off the suspect supply and the laptop charger, then record again with the same settings. Compare the two readings.',
        points: 15,
        conditions: [
          measuredContrast(
            { quantity: 'noise-rise', better: { [SUSPECT]: false, [CHARGER]: false }, worse: { [SUSPECT]: true, [CHARGER]: true }, same: SAME, minDelta: 8, improvesBy: 'lower' },
            'Noise drops with the suspect supply and the charger off'
          ),
        ],
      },
      {
        id: 'isolate-source',
        title: 'Isolate the Source',
        description: 'Turn things back on one at a time and record after each. Find which one brings the noise back.',
        points: 20,
        conditions: [
          measuredContrast(
            { quantity: 'noise-rise', better: { [SUSPECT]: false, [CHARGER]: true }, worse: { [SUSPECT]: true, [CHARGER]: true }, same: SAME, minDelta: 8, improvesBy: 'lower' },
            'The charger alone is quiet'
          ),
          measuredContrast(
            { quantity: 'noise-rise', better: { [SUSPECT]: true, [CHARGER]: false }, worse: { [SUSPECT]: false, [CHARGER]: false }, same: SAME, minDelta: 8 },
            'The noise returns with the suspect supply alone'
          ),
          quiz('S08-Q3'),
          quiz('S08-Q4'),
          quiz('S08-A1'),
        ],
      },
      {
        id: 'locate-direction',
        title: 'Locate the Strongest Direction',
        description: 'Power the suspect supply back on. Turn the Yagi in steps and record the noise at four or more headings. Then explain the weaker second peak.',
        points: 20,
        conditions: [
          bearingFound(S08_SOURCE_BEARING_DEG, 25, { minReadings: 4, require: { [SUSPECT]: true } }, 'Strongest reading points at the supply'),
          worksheetCorrect('s08-reflection', 'Reflections explained'),
        ],
      },
      {
        id: 'substitute-supply',
        title: 'Substitute the Noisy Supply',
        description: 'Swap in the spare supply, leave every receiver setting alone and record again. The noise should drop without any change to the gain.',
        points: 20,
        conditions: [
          eventHappened(SPARE_INSTALLED, {}, 'Spare supply installed'),
          faultCleared(S08_FAULT_ID, 'Noisy supply replaced'),
          measured({ instrument: 'receiver', quantity: 'noise-rise', max: 3, afterEvent: SPARE_INSTALLED, current: false }, 'Noise stays near the floor with the spare'),
          quiz('S08-Q5'),
          quiz('S08-Q6'),
          quiz('S08-A2'),
        ],
      },
      {
        id: 'check-audio',
        title: 'Check the Outgoing Audio',
        description:
          'Call Riley on 146.550 and ask how you sound. If the audio is distorted, set the microphone gain between 4 and 6 and answer, then finish the exchange with your call sign.',
        points: 10,
        conditions: [contactComplete('riley', { items: ['mic-adjusted'], identified: true }, 'Riley confirms clean audio after the fix')],
      },
      {
        id: 'name-the-symptom',
        title: 'Name the Symptom',
        description: 'Decide which problem causes distorted transmit audio and which one raises the receive noise.',
        points: 5,
        conditions: [worksheetCorrect('s08-symptoms', 'Symptom matched to cause'), quiz('S08-Q7'), quiz('S08-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("I thought this was coming from the neighbor's lights. Let's check our own equipment before we ask anyone else to change theirs.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley('Good. The brief shows the method: record first, change one thing, then record again with the same settings.', Emotion.NEUTRAL),
      'record-pattern': riley("That's our baseline. Now every change we make has something to be compared against.", Emotion.CONFIDENT),
      'battery-baseline': riley("The noise dropped when those two were off, so it's coming from our desk. Let's work out which one.", Emotion.SURPRISED),
      'isolate-source': riley("The charger is quiet and the supply brings the noise back. We've got the culprit, and nobody had to go next door.", Emotion.CONFIDENT),
      'locate-direction': riley('The strongest reading points straight at the shelf. The weaker peak is a reflection, so we trust the strong one.', Emotion.NEUTRAL),
      'substitute-supply': riley('Same settings and the noise is gone, so the fix worked without turning anything up.', Emotion.HAPPY),
      'check-audio': riley("That sounds much cleaner now. Too much microphone gain squashes the audio, and it's an easy fix.", Emotion.HAPPY),
      'name-the-symptom': riley("It was our power supply. I'm glad we measured it before I went next door with my theory.", Emotion.HAPPY),
    },
  },
};
