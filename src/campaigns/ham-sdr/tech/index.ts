/**
 * @file index - Campaign 3 (ham-sdr) Technician scenarios S1-S12, in play order
 */
import type { ScenarioData } from '@app/ScenarioData';
import { hamTechS01Data } from './s01-first-signal';
import { hamTechS02Data } from './s02-power-on-the-bench';
import { hamTechS03Data } from './s03-your-first-contact';
import { hamTechS04Data } from './s04-i-can-hear-them';
import { hamTechS05Data } from './s05-build-better-antenna';
import { hamTechS06Data } from './s06-where-did-the-watts-go';
import { hamTechS07Data } from './s07-it-only-fails-on-transmit';
import { hamTechS08Data } from './s08-noise-in-the-shack';
import { hamTechS09Data } from './s09-send-the-message';
import { hamTechS10Data } from './s10-beyond-the-local-horizon';
import { hamTechS11Data } from './s11-a-contact-through-space';
import { hamTechS12Data } from './s12-your-station-your-call';

const ORDER: ScenarioData[] = [
  hamTechS01Data,
  hamTechS02Data,
  hamTechS03Data,
  hamTechS04Data,
  hamTechS05Data,
  hamTechS06Data,
  hamTechS07Data,
  hamTechS08Data,
  hamTechS09Data,
  hamTechS10Data,
  hamTechS11Data,
  hamTechS12Data,
];

/** Play order with each scenario unlocked by the one before it */
export const hamTechScenarios: ScenarioData[] = ORDER.map((s, i) => ({
  ...s,
  isDisabled: false,
  prerequisiteScenarioIds: i === 0 ? [] : [ORDER[i - 1].id],
}));
