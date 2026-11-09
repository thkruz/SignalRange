/**
 * @file terminal-labels - Cause-to-label table for the terminal app (phase 40, D5)
 * @description One module holds every string the model can emit, (texts live in the locale bundle, `skylink.label.*`).
 * The label is chosen from what the terminal could observe, never from the injected cause:
 * a cable fault and a power sag both look like the dish restarting, so both read "Booting".
 */
import { tr } from './strings';

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

/** Display text of a cause label, in the active language */
export function causeLabelText(key: CauseLabelKey): string {
  return tr(`label.cause.${key}`);
}

export type TerminalAlertId = 'obstructed' | 'thermal-throttle' | 'thermal-shutdown' | 'heating';

export function alertText(id: TerminalAlertId): string {
  return tr(`label.alert.${id}`);
}

export type TerminalHero = 'online' | 'searching' | 'booting' | 'offline' | 'sleeping';

export function heroText(hero: TerminalHero): string {
  return tr(`label.hero.${hero}`);
}

/** Generic message shown with an "Offline" caused by the network refusing the terminal */
export function networkMessage(): string {
  return tr('label.network');
}

export function causeLabelFor(observation: OutageObservation): { key: CauseLabelKey; text: string } {
  const key = OUTAGE_LABEL_KEY[observation];

  return { key, text: causeLabelText(key) };
}
