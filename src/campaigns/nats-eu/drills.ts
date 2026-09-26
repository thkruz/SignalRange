import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * Shared setup for the nats-eu drills (S25-S28, phase 18 G).
 *
 * A drill is a short single-purpose scenario at Galway in the days after the
 * Gray Zone arc: no pass to fly, no voice clips, no timers. Each one closes a
 * curriculum topic the arc left untaught - the threat model as a whole, a
 * configuration baseline check, a removable-media event, a vendor session -
 * and each is graded the way the arc is: audit-log entries the operator has
 * to read, a decision graded on live facts, and a Working Document line.
 *
 * The MERIDIAN pair is loaded so the board, the timeline and the tracker
 * behave as they do in every other nats-eu scenario; the element sets are
 * the S17 sets (epoch 12 April), two to three weeks stale by the drill
 * dates, which is fine for a scenario that never flies them.
 */

const SAR1_DRILL_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27102.08333333  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61701  97.2000 228.0000 0010000  90.0000 226.2500 15.61320000123457' as TleLine2,
};

const SAR2_DRILL_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27102.08333333  .00001000  00000-0  10000-3 0  9994' as TleLine1,
  tle2: '2 61702  98.0000 253.7500 0010000  90.0000 152.0000 15.58070000123456' as TleLine2,
};

/** Fresh MERIDIAN-SAR-1/SAR-2 instances for one drill (never share satellite objects between scenarios) */
export function drillSatellites() {
  return [createMeridianSar1(SAR1_DRILL_TLE), createMeridianSar2(SAR2_DRILL_TLE)];
}

/** GW-01 as the daybook has it: deep clone, so a drill may stage a drifted setting without touching the shared config */
export function drillGalway(): GroundStationConfig {
  return structuredClone(galwayGroundStation);
}

export const DRILL_EQUIPMENT = [
  'GW-01 Galway: 4m Ku-Band LEO Tracker',
  'Ku-Band RF Front End (13100 MHz LNB LO)',
  'Security Console (audit log + access control)',
  'QPSK 3/4 RX Modem',
];

export const DRILL_BRIEF = (n: number): string => `https://docs.signalrange.space/campaign-2/scenario-${n}?content-only=true&dark=true`;
