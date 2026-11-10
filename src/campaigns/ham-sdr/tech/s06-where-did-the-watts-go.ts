import { contactComplete, eventHappened, faultCleared, keyReleased, measured, swrReading, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S06_FAULT_ID, s06Station } from './s06-station';

/**
 * C3 Technician Scenario 6 - "Where Did the Watts Go?" (troubleshooting a high-SWR feed line)
 *
 * Fixtures (see s06-station.ts and the S6 mission brief):
 * - Mobile radio at 25 W on 146.550 FM, reaching the SWR meter through a 1 m reference lead.
 * - The 15 m outdoor feed line is crushed: SWR about 3 on the antenna, and the same with a dummy
 *   load at its far end. A centre-to-shield DC test (powered off, both ends disconnected) reads about 40 ohms.
 * - Into a dummy load directly from the meter, SWR is about 1.0, which clears the radio.
 * - Installing the spare coax clears the fault; the player reconnects the meter and antenna to it.
 * - Short test keys only (holdS 2 to 4 s), never a sustained transmission into the fault.
 */
export const hamTechS06Data: ScenarioData = {
  id: 'ham-tech-s06',
  url: 'ham-sdr/scenarios/ham-tech-s06',
  imageUrl: 'home-sdr/6/card.png',
  number: 6,
  title: 'Where Did the Watts Go?',
  subtitle: 'Split the path, test each section, then replace the part that failed',
  duration: '30-40 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    '<p>The station worked before someone moved a cable. Now the SWR is high and the signal is weak. Test the radio on its own, then test the long feed line, find the damage, replace the cable and prove the repair with the same two tests.</p>',
  equipment: ['25 W mobile radio', 'Directional wattmeter and SWR meter', '100 W dummy load', 'Outdoor vertical antenna', 'Long coax feed line and a spare', 'Multimeter'],
  prerequisiteScenarioIds: ['ham-tech-s05'],
  isDisabled: false,
  settings: techSettings(6, s06Station),
  objectives: [
    briefObjective('Open the mission brief. It covers the split-the-path method, the dummy load rating and the coax DC test.'),
    ...chain('review-mission-brief', [
      {
        id: 'fault-baseline',
        title: 'Record the Fault Baseline',
        description: 'With the antenna connected, key the radio briefly for a test and read the SWR meter while keyed. Release the key right after the reading.',
        points: 10,
        conditions: [
          swrReading({ min: 2, termination: 'antenna', current: false }, 'High SWR recorded on the antenna'),
          keyReleased('Key released'),
          quiz('S06-Q1'),
          quiz('S06-Q2'),
        ],
      },
      {
        id: 'test-radio-locally',
        title: 'Test the Radio Locally',
        description: 'Power the radio off, move the meter output to the dummy load, power on and take a short reading. A good load reading clears the radio.',
        points: 15,
        conditions: [
          eventHappened('power:mobile', {}, 'Radio powered before the load test'),
          swrReading({ max: 1.3, termination: 'dummy-load', current: false, afterEvent: 'power:mobile' }, 'Radio into the dummy load reads a low SWR'),
        ],
      },
      {
        id: 'test-feed-line',
        title: 'Test the Long Feed Line',
        description:
          'Put the meter back on the long coax and move the dummy load to the far end of that cable using the barrel adapter. Take a short reading with the load in place of the antenna.',
        points: 15,
        conditions: [
          swrReading({ min: 1.8, termination: 'dummy-load', current: false }, 'Long coax with a load at its far end still reads poorly'),
          keyReleased('Key released'),
          quiz('S06-Q3'),
          quiz('S06-Q4'),
          quiz('S06-A1'),
        ],
      },
      {
        id: 'inspect-route',
        title: 'Inspect the Cable Route',
        description: 'Inspect the long coax and find the damage. Then power the radio off, disconnect both ends of the cable and run the centre-to-shield DC test.',
        points: 20,
        conditions: [
          eventHappened('inspect:long-coax', {}, 'Cable route inspected'),
          measured(
            { instrument: 'multimeter', quantity: 'centre-shield-ohm', placement: { coax: 'long-coax' }, max: 100, current: false },
            'Centre-to-shield reading is low on the disconnected cable'
          ),
        ],
      },
      {
        id: 'replace-cable',
        title: 'Replace and Protect the Cable',
        description: 'Install the spare coax in place of the crushed one, then reconnect the meter and the antenna to it. Choose how to protect the new outdoor connection.',
        points: 20,
        conditions: [
          eventHappened('install:spare-coax', {}, 'Spare coax installed'),
          faultCleared(S06_FAULT_ID, 'Crushed cable replaced'),
          worksheetCorrect('s06-weatherproof', 'Weatherproofing chosen'),
          quiz('S06-Q5'),
          quiz('S06-Q6'),
          quiz('S06-A2'),
        ],
      },
      {
        id: 'repeat-tests',
        title: 'Repeat Both Radio Tests',
        description:
          'Repeat the dummy-load test, then the antenna test, using the new coax. When both read well, call Riley on 146.550 and finish a short exchange with your call sign.',
        points: 20,
        conditions: [
          swrReading({ max: 1.3, termination: 'dummy-load', afterEvent: 'install:spare-coax', current: false }, 'New coax into the dummy load reads low'),
          swrReading({ max: 1.5, termination: 'antenna', afterEvent: 'install:spare-coax', current: false }, 'New coax into the antenna reads low'),
          contactComplete('riley', { items: ['report'], identified: true }, 'Two-way report exchanged with Riley'),
          keyReleased('Key released'),
          quiz('S06-Q7'),
          quiz('S06-Q8'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("The station worked before we moved that cable. Let's test one section at a time so we replace the part that's actually failed.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley('Good. The brief shows the method: split the path, test each section, and only then touch a part.', Emotion.NEUTRAL),
      'fault-baseline': riley(
        "That's a high reading with the antenna on, and now we know the problem is real. Next we'll check whether the radio itself is the cause.",
        Emotion.CONCERNED
      ),
      'test-radio-locally': riley(
        "Into the dummy load the radio reads clean, so it's not the radio. Let's move the load out along the cable to see where the trouble starts.",
        Emotion.CONFIDENT
      ),
      'test-feed-line': riley(
        "The load at the far end still reads poorly, so the trouble is in that cable and not the antenna. Let's go look at where it runs.",
        Emotion.CONFIDENT
      ),
      'inspect-route': riley(
        "The cable's flattened where the window closes on it, and the low DC reading agrees. That's two pieces of evidence for the same part.",
        Emotion.SURPRISED
      ),
      'replace-cable': riley("The new cable is in and the connection is sealed. Now let's repeat both tests, because a repair isn't finished until we measure it.", Emotion.HAPPY),
      'repeat-tests': riley("The radio passed its own test, and the replacement cable restored the antenna test. You've got evidence for the repair.", Emotion.HAPPY),
    },
  },
};
