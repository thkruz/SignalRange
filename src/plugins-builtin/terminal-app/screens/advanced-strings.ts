/**
 * @file advanced-strings - Strings of the SkyLink Advanced screen (phase 40, WP6)
 * @description Keyed, short sentences, no idioms; translated with the rest of the app. `{name}`
 * marks a value filled in by `trAdvanced()`. The wording never names a cause (D5): it says
 * "Location: not valid", never why.
 */

export const ADVANCED_STRINGS = {
  'advanced.title': 'Advanced',
  'advanced.intro': 'Debug data for support. These values are read only.',
  'advanced.offline': 'You see the last data the SkyLink sent.',
  'advanced.noData': 'No data yet.',
  'advanced.field.softwareVersion': 'Software version',
  'advanced.field.uptime': 'Uptime',
  'advanced.field.bootCount': 'Boot count',
  'advanced.field.location': 'Location',
  'advanced.field.gnssSatellites': 'GNSS satellites',
  'advanced.field.alerts': 'Active alerts',
  'advanced.field.tilt': 'Tilt / boresight',
  'advanced.field.obstruction': 'Obstruction',
  'advanced.value.locationValid': 'Valid',
  'advanced.value.locationNotValid': 'Not valid',
  'advanced.value.noAlerts': 'None',
  'advanced.value.notAvailable': 'Not available',
  'advanced.value.degrees': '{value} degrees',
  'advanced.value.percent': '{value} percent',
  'advanced.copy.button': 'Copy debug data',
  'advanced.copy.done': 'Debug data copied.',
  'advanced.copy.failed': 'Copy is not available here.',
  'advanced.copy.header': 'SkyLink debug data',
} as const;

export type AdvancedStringKey = keyof typeof ADVANCED_STRINGS;

/** Looks a string up and fills `{name}` values */
export function trAdvanced(key: AdvancedStringKey, vars: Record<string, string | number> = {}): string {
  return ADVANCED_STRINGS[key].replace(/\{(\w+)\}/gu, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
