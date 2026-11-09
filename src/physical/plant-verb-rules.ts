/**
 * @file plant-verb-rules - Which verb applies to which kind of target (C6 physical plant)
 * @description One data table. The Core rejects a verb that does not apply (zero
 * time, not an ineffective action) and the close-up offers only the verbs that
 * do. A verb's location is its target's location (see `TargetTraits.location`).
 * No DOM and no engine imports.
 */

import type { PlantVerb } from './physical-plant-types';

/** What a part is, finer than `PlantPartKind` (two plant kinds hide several roles) */
export type PartClass = 'power-station' | 'generator' | 'router' | 'modem' | 'laptop' | 'panel' | 'reflector' | 'lnb' | 'strip';

/** Where the target is worked on. `either`: a cable run or a lead, worked wherever the player stands. */
export type TargetLocation = 'indoor' | 'outdoor' | 'either';

export interface TargetTraits {
  type: 'part' | 'connector' | 'cable';
  location: TargetLocation;
  /** Parts only */
  partClass?: PartClass;
  /** Connectors only: power rides this connector (supply cable, or LNB DC on the coax) */
  carriesPower?: boolean;
  /** Connectors only: a threaded (F-type) connector with a nut */
  threaded?: boolean;
  /** Connectors only: a mains or DC plug or socket that feeds a part (no signal path to test) */
  feed?: boolean;
}

export type RuleVerb = Exclude<PlantVerb, 'returnInside' | 'goOutside' | 'spotted'>;

interface VerbRule {
  /** Part classes the verb applies to */
  parts?: readonly PartClass[];
  /** Connectors: all, only power-bearing ones, only threaded ones, only outdoor ones */
  connectors?: 'all' | 'power' | 'threaded' | 'outdoor' | 'signal';
  /** Cable runs */
  cables?: boolean;
}

const WARM: readonly PartClass[] = ['strip', 'power-station', 'generator', 'router', 'modem', 'laptop', 'panel'];
const POWERED: readonly PartClass[] = ['power-station', 'generator', 'router', 'modem', 'laptop', 'panel'];
const ALL_PARTS: readonly PartClass[] = ['power-station', 'generator', 'router', 'modem', 'laptop', 'panel', 'reflector', 'lnb'];

/** The applicability table, as shipped */
export const VERB_RULES: Readonly<Record<RuleVerb, VerbRule>> = {
  inspect: { parts: [...ALL_PARTS, 'strip'], connectors: 'all', cables: true },
  feel: { parts: WARM, connectors: 'all' },
  wiggle: { connectors: 'all', cables: true },
  // Only points that carry power. The SpaceY panel itself is read at its cable connectors.
  multimeter: { parts: ['strip', 'power-station', 'generator', 'router', 'modem'], connectors: 'power' },
  'cable-tester': { connectors: 'signal', cables: true },
  reseat: { connectors: 'all' },
  tighten: { connectors: 'threaded' },
  seal: { connectors: 'outdoor' },
  // Everything that has a spare type; the generator has none
  swap: { parts: ALL_PARTS.filter((c) => c !== 'generator'), connectors: 'all', cables: true },
  // Powered devices; the generator restarts (clears a sag)
  powerCycle: { parts: POWERED },
  refuel: { parts: ['generator'] },
  clearSnow: { parts: ['panel', 'reflector'] },
  removeNet: { parts: ['panel', 'reflector'] },
  reroute: { cables: true },
};

/** True when the verb makes sense for a target with these traits */
export function verbApplies(verb: PlantVerb, traits: TargetTraits): boolean {
  const rule = (VERB_RULES as Partial<Record<PlantVerb, VerbRule>>)[verb];
  if (!rule) {
    return false;
  }
  if (traits.type === 'cable') {
    return rule.cables === true;
  }
  if (traits.type === 'part') {
    return traits.partClass !== undefined && (rule.parts?.includes(traits.partClass) ?? false);
  }
  switch (rule.connectors) {
    case 'all':
      return true;
    case 'power':
      return traits.carriesPower === true;
    case 'threaded':
      return traits.threaded === true;
    case 'outdoor':
      return traits.location === 'outdoor' && traits.feed !== true;
    case 'signal':
      return traits.feed !== true;
    default:
      return false;
  }
}

/** Verbs the close-up can offer, in button order */
export const OFFERED_VERBS: readonly RuleVerb[] = ['inspect', 'wiggle', 'feel', 'reseat', 'tighten', 'seal', 'swap', 'powerCycle', 'refuel', 'clearSnow', 'removeNet', 'reroute'];

/**
 * Seconds each verb takes on the clock, for the close-up's cost labels. A read-only
 * mirror of the manager's cost table (test/physical/closeup-tools.test.ts checks it
 * against real results); the manager stays the authority.
 */
export const VERB_COSTS_S: Readonly<Record<RuleVerb, number>> = {
  inspect: 20,
  wiggle: 15,
  feel: 10,
  multimeter: 30,
  'cable-tester': 45,
  reseat: 60,
  tighten: 30,
  seal: 120,
  swap: 240,
  powerCycle: 20,
  clearSnow: 180,
  removeNet: 240,
  reroute: 300,
  refuel: 180,
};

/** Swap time by what is swapped */
export const SWAP_COSTS_S = { connector: 180, cable: 420, part: 240 } as const;

/** Verbs that interrupt the working plant; the close-up styles them below the observation actions */
export const DISRUPTIVE_ACTIONS: ReadonlySet<string> = new Set(['reseat', 'swap', 'powerCycle']);
