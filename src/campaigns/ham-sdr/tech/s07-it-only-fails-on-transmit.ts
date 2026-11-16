import { brownoutSeen, contactComplete, dummyLoadUsed, eventHappened, faultCleared, keyReleased, measured, noResetDuringTx, worksheetCorrect } from '@app/ham/ham-conditions';
import { Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import { briefObjective, chain, quiz, riley, techSettings } from './s01-04-helpers';
import { S07_FAULT_ID, S07_RESET_V, s07Station } from './s07-station';

/**
 * C3 Technician Scenario 7 - "It Only Fails When I Transmit" (voltage drop under load)
 *
 * Fixtures (see s07-station.ts and the S7 mission brief):
 * - 13.8 V supply, worn lead of 0.30 ohm, radio at 50 W: about 1 A receiving, about 8 A transmitting.
 * - Supply terminals stay near 13.8 V; the radio terminals read about 13.5 V receiving and about 11.4 V
 *   transmitting, below the 11.5 V reset point, so the radio resets after keying.
 * - Repairing the lead (supply off first) restores about 13.56 V at the radio under 8 A.
 * - Readings are taken with the meter on test points psu+/psu- (supply) and radio+/radio- (radio).
 */
const FAULT_REPAIRED = `repair:${S07_FAULT_ID}`;

export const hamTechS07Data: ScenarioData = {
  id: 'ham-tech-s07',
  url: 'ham-sdr/scenarios/ham-tech-s07',
  imageUrl: 'home-sdr/7/card.png',
  number: 7,
  title: 'It Only Fails When I Transmit',
  subtitle: 'Measure the voltage under load, repair the lead and verify',
  duration: '30-35 min',
  difficulty: 'intermediate',
  missionType: 'Station Session',
  description:
    '<p>The radio display stays on until you transmit, then it restarts. Reproduce the reset safely into a dummy load, compare the voltage at the supply and at the radio, work out where it goes, repair the lead and prove the fix under load.</p>',
  equipment: ['50 W mobile radio', '13.8 V supply with fused lead', 'Multimeter', '100 W dummy load', 'Outdoor vertical antenna'],
  prerequisiteScenarioIds: ['ham-tech-s06'],
  isDisabled: false,
  settings: techSettings(7, s07Station),
  objectives: [
    briefObjective('Open the mission brief. It covers measuring under load, the radio reset point and the lead repair steps.'),
    ...chain('review-mission-brief', [
      {
        id: 'reproduce-reset',
        title: 'Reproduce the Reset Safely',
        description:
          'With the dummy load connected, key the radio for a short test and watch it reset. The station log records the supply and radio voltages at the moment of the reset.',
        points: 15,
        conditions: [
          dummyLoadUsed({ radioId: 'mobile' }, 'Short test transmitted into the dummy load'),
          brownoutSeen('psu', { maxRadioV: S07_RESET_V }, 'Reset logged with the radio voltage below the reset point'),
          keyReleased('Key released'),
          quiz('S07-Q1'),
          quiz('S07-Q2'),
        ],
      },
      {
        id: 'compare-probe-points',
        title: 'Compare the Two Probe Points',
        description:
          'Read the voltage at the supply terminals and at the radio terminals while the radio is receiving. Then compare both with the voltages the log recorded at the reset.',
        points: 20,
        conditions: [
          measured(
            { instrument: 'multimeter', quantity: 'voltage', placement: { target: 'psu', red: 'psu+', black: 'psu-' }, min: 13.7, current: false },
            'Supply terminals read 13.8 V'
          ),
          measured(
            { instrument: 'multimeter', quantity: 'voltage', placement: { target: 'psu', red: 'radio+', black: 'radio-' }, min: 13.2, max: 13.7, current: false },
            'Radio terminals read a little lower while receiving'
          ),
          brownoutSeen('psu', { maxRadioV: S07_RESET_V, minSourceV: 13.0 }, 'Log shows the supply fine while the radio voltage collapsed'),
          keyReleased('Key released'),
          quiz('S07-Q3'),
          quiz('S07-Q4'),
          quiz('S07-A1'),
        ],
      },
      {
        id: 'explain-missing-voltage',
        title: 'Explain the Missing Voltage',
        description: 'Use the current drawn while transmitting and the resistance of the lead to work out how much voltage the lead is using up.',
        points: 10,
        conditions: [worksheetCorrect('s07-drop', 'Voltage drop in the lead worked out')],
      },
      {
        id: 'repair-lead',
        title: 'Repair the Isolated Lead',
        description: 'Inspect the lead, power the supply off, replace the lead and keep the fuse. Then power the supply and the radio back on.',
        points: 20,
        conditions: [
          eventHappened('inspect:psu', {}, 'Lead inspected'),
          faultCleared(S07_FAULT_ID, 'Worn lead replaced'),
          eventHappened('power:mobile', { afterEvent: FAULT_REPAIRED }, 'Radio powered back on after the repair'),
          quiz('S07-Q5'),
          quiz('S07-Q6'),
          quiz('S07-A2'),
        ],
      },
      {
        id: 'verify-transmit-load',
        title: 'Verify the Transmit Load',
        description:
          'Key the radio and read the radio terminals while it transmits. Then connect the feed line to the radio, call Riley on 146.550, hold a transmission without a reset and finish a short exchange.',
        points: 20,
        conditions: [
          measured(
            {
              instrument: 'multimeter',
              quantity: 'voltage',
              placement: { target: 'psu', red: 'radio+', black: 'radio-' },
              underLoad: true,
              min: 13.2,
              afterEvent: FAULT_REPAIRED,
              current: false,
            },
            'Radio terminals hold the voltage while transmitting'
          ),
          noResetDuringTx(FAULT_REPAIRED, 3, { radioId: 'mobile' }, 'A 3 s transmission ends without a reset'),
          contactComplete('riley', { items: ['report'], identified: true }, 'Two-way report exchanged with Riley'),
        ],
      },
      {
        id: 'estimate-endurance',
        title: 'Estimate Portable Endurance',
        description:
          'A portable battery is rated 10 Ah. Work out the average current from the receive and transmit currents, the battery life, and why DC power exceeds RF output.',
        points: 15,
        conditions: [worksheetCorrect('s07-endurance', 'Endurance estimate worked out'), quiz('S07-Q7'), quiz('S07-Q8')],
      },
    ]),
  ],
  dialogClips: {
    intro: riley("The display stays on until we transmit. Let's measure the voltage at the radio while it's drawing the extra current.", Emotion.CONCERNED),
    objectives: {
      'review-mission-brief': riley("Good. The brief explains why we measure while the radio is working, because that's when the problem shows up.", Emotion.NEUTRAL),
      'reproduce-reset': riley(
        "You caught the voltage dropping below the reset point, and a dummy load kept the signal off the air while you did it. Now let's see where the voltage goes.",
        Emotion.CONFIDENT
      ),
      'compare-probe-points': riley("The supply is fine and the radio isn't, so the voltage is going missing between them. That points at the lead.", Emotion.SURPRISED),
      'explain-missing-voltage': riley(
        "Eight amps through that lead takes 2.4 volts. That's the missing voltage, and it only appears when the radio draws that current.",
        Emotion.CONFIDENT
      ),
      'repair-lead': riley("The lead is replaced and the fuse stays. Next we measure again, because a repair isn't proven until we test it under load.", Emotion.HAPPY),
      'verify-transmit-load': riley("The voltage holds up while you're transmitting now. An unloaded battery or supply reading couldn't have told us that.", Emotion.HAPPY),
      'estimate-endurance': riley(
        "That's about four hours at that duty cycle. Good number to plan with, because the transmitter takes more from the battery than it sends out.",
        Emotion.NEUTRAL
      ),
    },
  },
};
