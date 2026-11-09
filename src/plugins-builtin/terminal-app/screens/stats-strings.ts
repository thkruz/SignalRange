/**
 * @file stats-strings - User-facing strings of the Statistics and Speed test screens (phase 40, WP4)
 * @description Same style as `../strings.ts`: short sentences, no idioms, `{name}` marks a value
 * filled in by `ts()`. Cause words in the outage list come from `../terminal-labels.ts`.
 */

export const STATS_STRINGS = {
  // Statistics
  'stats.window.label': 'Time range',
  'stats.window.15m': '15 minutes',
  'stats.window.6h': '6 hours',
  'stats.window.12h': '12 hours',
  'stats.throughput': 'Throughput',
  'stats.download': 'Download',
  'stats.upload': 'Upload',
  'stats.latency': 'Latency',
  'stats.pingDrop': 'Ping drop',
  'stats.unitMbps': '{value} Mbps',
  'stats.unitMs': '{value} ms',
  'stats.unitPct': '{value}%',
  'stats.noData': 'No data in this time range yet.',
  'stats.axisStart': '{age} ago',
  'stats.axisEnd': 'Now',
  'stats.outages': 'Outages',
  'stats.outages.none': 'No outages in this time range.',
  'stats.outages.start': 'Started',
  'stats.outages.duration': 'Duration',
  'stats.outages.cause': 'Cause',
  'stats.outages.ago': '{age} ago',
  'stats.outages.ongoing': 'Ongoing',
  'stats.stale': 'Showing the last data your SkyLink sent.',

  // Speed test
  'speed.title': 'Speed test',
  'speed.body': 'Measures the speed between your SkyLink and the internet. The test takes about {seconds} seconds.',
  'speed.start': 'Start speed test',
  'speed.running': 'Testing...',
  'speed.disabled': 'The speed test is not available. Your SkyLink cannot be reached.',
  'speed.unavailable': 'The speed test is not available on this connection.',
  'speed.result': 'Last result',
  'speed.download': 'Download',
  'speed.upload': 'Upload',
  'speed.latency': 'Latency',
  'speed.unitMbps': '{value} Mbps',
  'speed.unitMs': '{value} ms',
  'speed.limit.title': 'Limited by',
  'speed.limit.skylink': 'SkyLink',
  'speed.limit.local-network': 'Local network',
  'speed.failed': 'The test did not finish. Check your connection and try again.',
  'speed.noResult': 'No test has been run yet.',
  'speed.history': 'Earlier tests',
  'speed.ago': '{age} ago',
} as const;

export type StatsStringKey = keyof typeof STATS_STRINGS;

/** Looks a string up and fills `{name}` values */
export function ts(key: StatsStringKey, vars: Record<string, string | number> = {}): string {
  return STATS_STRINGS[key].replace(/\{(\w+)\}/gu, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
