/**
 * @file terminal-labels - Cause-to-label table for the terminal app (phase 40, D5)
 * @description One module holds every string the model can emit, so WP8 can localise them.
 * The label is chosen from what the terminal could observe, never from the injected cause:
 * a cable fault and a power sag both look like the dish restarting, so both read "Booting".
 */

/** What the terminal itself could observe about an outage while it happened */
export type OutageObservation =
  | 'obstructed' // dish reports a blocked field of view (snow, net, tree line)
  | 'handover' // beam handover / coverage gap seen through the phased array
  | 'searching' // dish up but not yet locked to a satellite
  | 'booting' // dish restarting (cable cut, supply sag, user reboot)
  | 'power-loss' // dish went dark; all it knows afterwards is that it restarted
  | 'thermal-shutdown' // dish shut itself down hot
  | 'no-location' // no GNSS fix: the dish cannot say where it is, so it keeps searching
  | 'registration' // dish up, link not registering with the network
  | 'network'; // network refuses the terminal (account / provider)

export type CauseLabelKey = 'obstructed' | 'searching' | 'booting' | 'thermal-shutdown' | 'offline';

/** Observation to label key. Several observations deliberately share a label. */
export const OUTAGE_LABEL_KEY: Record<OutageObservation, CauseLabelKey> = {
  obstructed: 'obstructed',
  handover: 'searching',
  searching: 'searching',
  booting: 'booting',
  'power-loss': 'booting',
  'thermal-shutdown': 'thermal-shutdown',
  'no-location': 'searching',
  registration: 'searching',
  network: 'offline',
};

/** Label key to display text (short sentences, no idioms; localise here) */
export const CAUSE_LABEL_TEXT: Record<CauseLabelKey, string> = {
  obstructed: 'Obstructed',
  searching: 'Searching',
  booting: 'Booting',
  'thermal-shutdown': 'Thermal shutdown',
  offline: 'Offline',
};

export type TerminalAlertId = 'obstructed' | 'thermal-throttle' | 'thermal-shutdown' | 'heating';

export const ALERT_TEXT: Record<TerminalAlertId, string> = {
  obstructed: 'Obstructed',
  'thermal-throttle': 'Thermal throttle',
  'thermal-shutdown': 'Thermal shutdown',
  heating: 'Heating',
};

export type TerminalHero = 'online' | 'searching' | 'booting' | 'offline' | 'sleeping';

export const HERO_TEXT: Record<TerminalHero, string> = {
  online: 'Online',
  searching: 'Searching',
  booting: 'Booting',
  offline: 'Offline',
  sleeping: 'Sleeping',
};

/** Generic message shown with an "Offline" caused by the network refusing the terminal */
export const NETWORK_MESSAGE = 'Network unavailable';

export const LINK_MESSAGE = {
  'dish-unreachable': "Can't reach your SkyLink",
  'no-router': 'No connection to the router',
} as const;

export function causeLabelFor(observation: OutageObservation): { key: CauseLabelKey; text: string } {
  const key = OUTAGE_LABEL_KEY[observation];

  return { key, text: CAUSE_LABEL_TEXT[key] };
}
