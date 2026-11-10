import { eventHappened, faultCleared, measured, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { s02Station } from './s02-station';

/**
 * C3 Technician Scenario 2 - "Power on the Bench"
 *
 * Fixtures (see s02-station.ts and the S2 mission brief): 12.0 V current-limited practice board,
 * R1 120 ohm 2 W, one open contact inside SW1 (fault `sw1-contact`).
 *
 * Design: the board starts powered with the SW1 lever off. With the lever on, the LED branch (driven
 * by Q1) lights, but the R1 branch carries nothing, so a series meter at r1-branch reads 0 A
 * against the predicted 0.10 A. The mismatch sends the student to the continuity test. With the
 * board powered down and the lever on, tp-sw1-in to tp-sw1-out reads about 2.7 kOhm (through the
 * LED branch) and does not beep. After the repair the same series meter reads about 0.10 A and the
 * led-branch meter about 0.021 A. The meter only records a reading when it shows a value, so an
 * open "OL" result is not logged.
 */
const DCV = 'voltage';
const DCA = 'current';
const BOARD = 'board';

export const hamTechS02Data: ScenarioData = {
  id: 'ham-tech-s02',
  url: 'ham-sdr/scenarios/ham-tech-s02',
  imageUrl: 'home-sdr/2/card.png',
  number: 2,
  title: 'Power on the Bench',
  subtitle: 'Read a circuit and use a meter safely',
  duration: '30-40 min',
  difficulty: 'beginner',
  missionType: 'Station Session',
  description:
    '<p>Before you open a radio, practise on a covered low-voltage training board. Match the drawing to the parts, measure the supply, predict a current and find out why one branch is dead.</p><p>The supply is isolated and current-limited. There is no mains wiring in this session.</p>',
  equipment: ['Covered 12 V practice board', 'Digital multimeter', 'Official circuit figure cards'],
  settings: techSettings(2, s02Station, '14:00:00'),
  objectives: [
    briefObjective('Open the mission brief. It shows the board diagram and its test points.'),
    ...chain('review-mission-brief', [
      {
        id: 'match-circuit-symbols',
        title: 'Match the Circuit Symbols',
        description: 'Match each symbol on the drawing to the part it stands for on the board.',
        points: 10,
        conditions: [worksheetCorrect('s02-symbols', 'Symbols matched to parts'), quiz('S02-Q1'), quiz('S02-Q2')],
      },
      {
        id: 'select-meter-function',
        title: 'Select the Meter Function',
        description: 'Choose the meter setting and red-lead socket you need to check the supply voltage, then set the meter to DC voltage.',
        points: 10,
        conditions: [worksheetCorrect('s02-select', 'Meter setup chosen'), eventHappened('meter:mode:DCV', {}, 'Meter set to DC voltage')],
      },
      {
        id: 'measure-test-supply',
        title: 'Measure the Test Supply',
        description: 'Put the probes across the supply and read 12.0 V. Then swap the probes once to see what a negative reading means.',
        points: 15,
        conditions: [
          measured({ instrument: 'multimeter', quantity: DCV, placement: { target: BOARD, red: 'tp-supply+', black: 'tp-supply-' }, min: 11.8, max: 12.2 }, 'Supply reads 12.0 V'),
          measured(
            { instrument: 'multimeter', quantity: DCV, placement: { target: BOARD, red: 'tp-supply-', black: 'tp-supply+' }, min: -12.2, max: -11.8, current: false },
            'Reversed probes read negative'
          ),
        ],
      },
      {
        id: 'predict-branch-current',
        title: 'Predict the Branch Current',
        description: 'Calculate the current and power in the R1 branch. Then close SW1 and measure that branch current with the meter in series at the R1 branch break point.',
        points: 20,
        conditions: [
          worksheetCorrect('s02-predict', 'Current and power calculated'),
          measured({ instrument: 'multimeter', quantity: DCA, placement: { target: BOARD, series: 'r1-branch' } }, 'Series current measured at the R1 branch'),
          quiz('S02-Q3'),
          quiz('S02-Q4'),
          quiz('S02-A1'),
        ],
      },
      {
        id: 'find-open-branch',
        title: 'Find the Open Branch',
        description:
          'Switch the board off and prove with the meter that its supply reads zero. Leave SW1 on, then use continuity across the SW1 contact to find where the R1 branch is broken.',
        points: 20,
        conditions: [
          measured(
            { instrument: 'multimeter', quantity: DCV, placement: { target: BOARD, red: 'tp-supply+', black: 'tp-supply-' }, min: -0.05, max: 0.05, afterEvent: 'power:board' },
            'Board verified off (0 V)'
          ),
          measured(
            { instrument: 'multimeter', quantity: 'continuity', placement: { target: BOARD, red: 'tp-sw1-in', black: 'tp-sw1-out' }, min: 1000, afterEvent: 'power:board' },
            'No continuity across the SW1 contact'
          ),
        ],
      },
      {
        id: 'restore-indicator-circuit',
        title: 'Restore the Indicator Circuit',
        description: 'With the board off, repair the open SW1 contact. Then power the board back on and confirm both branches carry their normal current.',
        points: 25,
        conditions: [
          faultCleared('sw1-contact', 'Open contact repaired'),
          measured(
            { instrument: 'multimeter', quantity: DCA, placement: { target: BOARD, series: 'r1-branch' }, min: 0.09, max: 0.12, afterEvent: 'repair:sw1-contact' },
            'R1 branch reads about 0.10 A after the repair'
          ),
          measured(
            { instrument: 'multimeter', quantity: DCA, placement: { target: BOARD, series: 'led-branch' }, min: 0.015, max: 0.03, afterEvent: 'repair:sw1-contact' },
            'LED branch carries its normal current'
          ),
          quiz('S02-Q5'),
          quiz('S02-Q6'),
          quiz('S02-A2'),
        ],
      },
      {
        id: 'compare-circuit-families',
        title: 'Compare the Circuit Families',
        description: 'Use the board diagram to tell series from parallel, electric from magnetic energy storage, and rectification from regulation.',
        points: 15,
        conditions: [worksheetCorrect('s02-families', 'Circuit families compared'), quiz('S02-Q7'), quiz('S02-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley('This board lets us measure the circuit without opening a radio. Start with the drawing, then find the same parts on the bench.', Emotion.HAPPY),
    objectives: {
      'review-mission-brief': riley("Good. Now match the symbols to the parts, because every schematic you'll ever read uses the same little pictures.", Emotion.NEUTRAL),
      'match-circuit-symbols': riley(
        "Those symbols are the same on every board and every exam drawing. Next we'll set up the meter, because the wrong setting can do real damage.",
        Emotion.CONFIDENT
      ),
      'select-meter-function': riley(
        "Voltage setting, red lead in the voltage socket. That's the safe way to look at a supply. Now measure it, and swap the probes once to see what a minus sign means.",
        Emotion.CONFIDENT
      ),
      'measure-test-supply': riley(
        "Twelve volts, and the swapped probes just flipped the sign. The supply didn't change, only which probe sits where. Now predict a current before you measure it.",
        Emotion.HAPPY
      ),
      'predict-branch-current': riley(
        "You predicted a tenth of an amp, but the meter says nothing is flowing. That's a clue, not a mistake. Something in that branch is open, so let's find it.",
        Emotion.SKEPTICAL
      ),
      'find-open-branch': riley(
        "Power off first, then continuity. That's the order that keeps you safe, and the meter just told you the SW1 contact isn't passing current. Fun fact: continuity testing only works on a dead circuit.",
        Emotion.CONFIDENT
      ),
      'restore-indicator-circuit': riley('The branch is back, and the reading matches your calculation. Last job is sorting the circuit families on the diagram.', Emotion.HAPPY),
      'compare-circuit-families': riley("The meter reading agrees with your calculation. Now you've got a way to check a power problem instead of guessing.", Emotion.HAPPY),
    },
  },
};
