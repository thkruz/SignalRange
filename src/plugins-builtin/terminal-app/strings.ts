/**
 * @file strings - Every user-facing string of the terminal app, in one keyed table (phase 40, WP3)
 * @description WP8 localises this file. Short sentences, no idioms. `{name}` marks a value filled in
 * by `tr()`. Status, alert and cause words (Online, Obstructed, Booting ...) live in
 * `terminal-labels.ts`, which WP8 localises the same way.
 */

export const TERMINAL_STRINGS = {
  // Shell
  'shell.title': 'SkyLink',
  'shell.nav.label': 'SkyLink menu',
  'nav.home': 'Home',
  'nav.obstructions': 'Obstructions',
  'nav.statistics': 'Statistics',
  'nav.speed-test': 'Speed test',
  'nav.settings': 'Settings',
  'nav.advanced': 'Advanced',
  'shell.noRouter.title': 'Cannot connect',
  'shell.noRouter.body': 'The app cannot connect. Check that the router is on and that your laptop is connected to it.',
  'shell.unreachable.title': "Can't reach your SkyLink",
  'shell.unreachable.body': 'You see the last data it sent.',
  'shell.updatedAgo': 'Last updated {age} ago',
  'shell.updatedNow': 'Last updated just now',
  'shell.noData': 'No data yet.',

  // Confirm dialog
  'confirm.cancel': 'Cancel',

  // Home
  'home.status': 'Status',
  'home.alerts': 'Alerts',
  'home.noAlerts': 'No active alerts.',
  'home.download': 'Download',
  'home.upload': 'Upload',
  'home.latency': 'Latency',
  'home.uptime': 'Uptime',
  'home.unitMbps': '{value} Mbps',
  'home.unitMs': '{value} ms',
  'home.noValue': '-',

  // Settings
  'settings.title': 'Settings',
  'settings.reboot.title': 'Restart',
  'settings.reboot.body': 'Restart your SkyLink. It has no service while it starts. This can take several minutes.',
  'settings.reboot.button': 'Restart SkyLink',
  'settings.reboot.confirm': 'Restart your SkyLink now? You will lose service until it has started again.',
  'settings.reboot.confirmButton': 'Restart',
  'settings.reboot.done': 'Restart started.',
  'settings.snow.title': 'Snow melt',
  'settings.snow.body': 'The heater melts snow on the dish. It uses extra power.',
  'settings.snow.automatic': 'Automatic',
  'settings.snow.automaticHint': 'Heat only when snow is on the dish.',
  'settings.snow.preheat': 'Pre-heat',
  'settings.snow.preheatHint': 'Also heat when it is cold.',
  'settings.snow.off': 'Off',
  'settings.snow.offHint': 'Never heat.',
  'settings.snow.saved': 'Snow melt saved.',
  'settings.sleep.title': 'Power save',
  'settings.sleep.body': 'Your SkyLink sleeps between these times. It has no service while it sleeps.',
  'settings.sleep.enable': 'Use a sleep schedule',
  'settings.sleep.start': 'Sleep from',
  'settings.sleep.end': 'Wake at',
  'settings.sleep.save': 'Save schedule',
  'settings.sleep.confirm': 'Save this sleep schedule? Your SkyLink will have no service between {start} and {end}.',
  'settings.sleep.confirmOff': 'Turn off the sleep schedule?',
  'settings.sleep.confirmButton': 'Save',
  'settings.sleep.saved': 'Sleep schedule saved.',
  'settings.sleep.invalid': 'Choose a start time and an end time.',
  'settings.sleep.current': 'Now: {value}',
  'settings.sleep.currentOff': 'Now: off',
  'settings.wifi.title': 'Wi-Fi',
  'settings.wifi.body': 'The name and password of your router Wi-Fi.',
  'settings.wifi.name': 'Network name',
  'settings.wifi.password': 'Password',
  'settings.wifi.save': 'Save Wi-Fi',
  'settings.wifi.saved': 'Wi-Fi saved.',
  'settings.wifi.invalid': 'Enter a name and a password of at least 8 characters.',
  'settings.offline': 'Settings are not available while the SkyLink cannot be reached.',
} as const;

export type TerminalStringKey = keyof typeof TERMINAL_STRINGS;

/** Looks a string up and fills `{name}` values */
export function tr(key: TerminalStringKey, vars: Record<string, string | number> = {}): string {
  return TERMINAL_STRINGS[key].replace(/\{(\w+)\}/gu, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** "20 s", "5 min" or "1 h 5 min" for an age or duration in seconds */
export function formatAge(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total} s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
