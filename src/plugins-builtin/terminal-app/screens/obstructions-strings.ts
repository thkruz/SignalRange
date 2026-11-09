/**
 * @file obstructions-strings - Strings of the SkyLink Obstructions screen (phase 40, WP5)
 * @description Keyed, short sentences, no idioms; translated with the rest of the app. `{name}`
 * marks a value filled in by `trObstructions()`. The wording never names a cause (D5): it says
 * which part of the sky is blocked, not what blocks it.
 */

export const OBSTRUCTIONS_STRINGS = {
  'obstructions.title': 'Obstructions',
  'obstructions.intro': 'The map shows the sky your SkyLink can see. It fills in over time as the SkyLink follows satellites.',
  'obstructions.unavailable': 'This SkyLink does not make a sky map.',
  'obstructions.offline': 'You see the last data the SkyLink sent.',
  'obstructions.mapLabel': 'Sky map. North is at the top.',
  'obstructions.legend.served': 'Clear sky',
  'obstructions.legend.blocked': 'Blocked sky',
  'obstructions.legend.unseen': 'Not seen yet',
  'obstructions.north': 'N',
  'obstructions.east': 'E',
  'obstructions.south': 'S',
  'obstructions.west': 'W',
  'obstructions.stat.blocked': 'Blocked',
  'obstructions.stat.seen': 'Sky seen',
  'obstructions.stat.value': '{value}%',
  'obstructions.empty': 'The map is empty. It needs time to fill.',
  'obstructions.check': 'Check for obstructions',
  'obstructions.check.running': 'Checking. The map needs about {minutes} min of time to fill. Let time run. {left} min left.',
  'obstructions.check.done': 'Check finished. {blocked}% of the sky seen is blocked. {seen}% of the sky has been seen.',
  'obstructions.check.doneNone': 'Check finished. The SkyLink could not see the sky during this time.',
  'obstructions.check.stop': 'Stop check',
  'obstructions.reset': 'Reset map',
  'obstructions.reset.confirm': 'Delete the sky map? The SkyLink starts a new map.',
  'obstructions.reset.label': 'Reset',
  'obstructions.cell': 'Azimuth {az} to {az2} degrees, elevation {el} to {el2} degrees: {state}',
} as const;

export type ObstructionsStringKey = keyof typeof OBSTRUCTIONS_STRINGS;

/** Look up a string and fill `{name}` markers */
export function trObstructions(key: ObstructionsStringKey, vars: Record<string, string | number> = {}): string {
  return OBSTRUCTIONS_STRINGS[key].replace(/\{(\w+)\}/gu, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
