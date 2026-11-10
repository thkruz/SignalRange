import { connectionSeated, eventHappened, measured, measuredContrast, sweepMinSwrNear, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S05_REF_ID, s05Station } from './s05-station';

/**
 * C3 Technician Scenario 5 - "Build the Better Antenna" (receive-only)
 *
 * Fixtures (see s05-station.ts and the S5 mission brief):
 * - Adjustable dipole, f0 = 143 / total element length (m). Starts at 0.500 m per side (143 MHz) and
 *   horizontal; target 146.550 MHz, so each side ends near 0.488 m (0.976 m total).
 * - The reference signal is a vertical club beacon at 146.550 MHz FM. `rx.record` logs the signal-to-noise
 *   with the dipole orientation, whether the dipole is in band (within 1.5 MHz) and the radio settings.
 *   Baseline (horizontal, out of band) is about 3 dB; tuned and vertical is about 23 dB.
 * - The analyzer shares the coax with the SDR: disconnect the adapter, connect the analyzer, calibrate, sweep.
 */
const FEED = 'dipole-coax.b~dipole.in';
const SAME = ['vfoMHz', 'filterHz', 'rfGainDb', 'mode'];

export const hamTechS05Data: ScenarioData = {
  id: 'ham-tech-s05',
  url: 'ham-sdr/scenarios/ham-tech-s05',
  imageUrl: 'home-sdr/5/card.png',
  number: 5,
  title: 'Build the Better Antenna',
  subtitle: 'Cut, tune and orient a dipole, then measure the improvement',
  duration: '35-40 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    '<p>Riley has enough wire for a simple dipole. Work out its length, pick a safe place for it, assemble it slightly long, then trim it with an antenna analyzer and compare reception before and after.</p><p>This session is receive-only, but you will still do the exposure math you would need before any transmitting.</p>',
  equipment: ['Adjustable dipole kit', 'RG-58 feed line', 'Antenna analyzer', 'USB SDR receiver and laptop', 'Reference signal source'],
  prerequisiteScenarioIds: ['ham-tech-s04'],
  isDisabled: false,
  settings: techSettings(5, s05Station),
  objectives: [
    briefObjective('Open the mission brief. It covers the dipole length rule, safe antenna sites and the reference signal.'),
    ...chain('review-mission-brief', [
      {
        id: 'calculate-length',
        title: 'Calculate a Starting Length',
        description: 'Use the dipole rule to work out the total starting length for 146.550 MHz, and the length of each element.',
        points: 10,
        conditions: [worksheetCorrect('s05-length', 'Starting length worked out'), quiz('S05-Q1'), quiz('S05-Q2')],
      },
      {
        id: 'select-site',
        title: 'Select the Installation Site',
        description: 'Decide which candidate sites to reject and which one to use. Think about wires, stability and space already in use.',
        points: 10,
        conditions: [worksheetCorrect('s05-site', 'Safe site chosen')],
      },
      {
        id: 'assemble-antenna',
        title: 'Assemble the Antenna',
        description:
          'Inspect the dipole, then connect the feed line to it. The elements are cut slightly long, so leave them alone for now. With the receiver on the dipole, record a baseline reading of the reference signal.',
        points: 15,
        conditions: [
          eventHappened('inspect:dipole', {}, 'Dipole inspected'),
          connectionSeated(FEED, 'Feed line connected to the dipole'),
          measured({ instrument: 'receiver', quantity: 'signal-snr', placement: { emitter: S05_REF_ID }, current: false }, 'Baseline reading recorded'),
        ],
      },
      {
        id: 'resonant-region',
        title: 'Find the Resonant Region',
        description:
          'Replace the receiver with the analyzer at the coax, calibrate it and sweep 120 to 160 MHz. Shorten both elements by the same amount, sweep again, and stop when the dip sits on 146.550 MHz.',
        points: 20,
        conditions: [
          eventHappened('calibrate:analyzer', {}, 'Analyzer calibrated'),
          measured({ instrument: 'analyzer', quantity: 'sweep', max: 145, current: false }, 'First sweep shows resonance below the target'),
          sweepMinSwrNear(146.55, 1.0, { afterEvent: 'adjust:dipole', maxSwr: 2 }, 'Dip within 1 MHz of 146.550 MHz'),
          quiz('S05-Q3'),
          quiz('S05-Q4'),
          quiz('S05-A1'),
        ],
      },
      {
        id: 'match-polarization',
        title: 'Match the Polarization',
        description:
          'Put the receiver back on the coax. Record the reference signal with the dipole horizontal, then turn it vertical and record again. End with the orientation that hears the vertical reference better.',
        points: 20,
        conditions: [
          measuredContrast(
            {
              quantity: 'signal-snr',
              better: { orientation: 'vertical', inBand: true },
              worse: { orientation: 'horizontal', inBand: true },
              same: SAME,
              minDelta: 6,
              endsOn: true,
            },
            'Vertical reading beats horizontal under the same settings'
          ),
          quiz('S05-Q5'),
          quiz('S05-Q6'),
          quiz('S05-A2'),
        ],
      },
      {
        id: 'check-exposure',
        title: 'Check the Exposure Plan',
        description: 'Before anyone transmits on this antenna, estimate the power density at 1 m from 5 W, the antenna gain, the duty cycle and the public limit.',
        points: 10,
        conditions: [worksheetCorrect('s05-exposure', 'Exposure estimate within limit')],
      },
      {
        id: 'compare-reports',
        title: 'Compare the Signal Reports',
        description: 'Compare your first baseline reading with the finished antenna, taken under the same receiver settings, and confirm the improvement.',
        points: 15,
        conditions: [
          measuredContrast(
            {
              quantity: 'signal-snr',
              better: { orientation: 'vertical', inBand: true },
              worse: { orientation: 'horizontal', inBand: false },
              same: SAME,
              minDelta: 10,
              endsOn: true,
            },
            'Finished antenna beats the baseline by 10 dB or more'
          ),
          quiz('S05-Q7'),
          quiz('S05-Q8'),
        ],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("We've got enough material for a simple dipole. Let's work out its length and choose a safe place before we start building.", Emotion.NEUTRAL),
    objectives: {
      'review-mission-brief': riley(
        "Good. The brief has the length rule on it, and we'll use it first, because you should always do the math before you cut anything.",
        Emotion.NEUTRAL
      ),
      'calculate-length': riley(
        "That's 0.976 meters in total, so about 0.488 for each side. Now let's pick where it goes, because a good antenna in a bad spot is still a bad idea.",
        Emotion.CONFIDENT
      ),
      'select-site': riley(
        "Clear of the wires and on something solid, that's the right call. Let's build it, and we'll leave the elements a little long so we can trim them.",
        Emotion.HAPPY
      ),
      'assemble-antenna': riley(
        "Built, and you've saved a baseline. That reading is what we'll compare against later, so don't lose it. Next the analyzer tells us where the antenna actually resonates.",
        Emotion.CONFIDENT
      ),
      'resonant-region': riley(
        "The dip is right on 146.550, so you trimmed it evenly and stopped at the right place. Now let's see how the antenna's direction matters, because the reference signal is vertical.",
        Emotion.EXCITED
      ),
      'match-polarization': riley(
        "Same antenna and the same settings, but vertical hears the vertical signal much better. Matching polarization is free signal. Before we ever transmit, let's check the exposure numbers.",
        Emotion.CONFIDENT
      ),
      'check-exposure': riley(
        "Well under the limit at one meter, and it's good to know that before you key up. Last step is putting the before and after side by side.",
        Emotion.NEUTRAL
      ),
      'compare-reports': riley("You changed the antenna and measured what happened. Save those readings so you've got something useful to compare with later.", Emotion.HAPPY),
    },
  },
};
