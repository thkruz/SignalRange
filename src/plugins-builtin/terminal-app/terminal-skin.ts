/**
 * @file terminal-skin - Vendor skin description for the terminal app (phase 40, D4)
 * @description Data only: which screens a vendor's app has, boot and acquisition timing, which
 * debug fields it exposes. SkyLink is the full set; EuroSat (later) is a smaller one.
 */

export type TerminalScreenId = 'home' | 'obstructions' | 'statistics' | 'speed-test' | 'settings' | 'advanced';

export type TerminalDebugFieldId = 'software-version' | 'uptime' | 'boot-count' | 'location-valid' | 'gnss-satellites' | 'alert-flags' | 'tilt-boresight' | 'obstruction-fraction';

export interface TerminalSkin {
  /** Stable id, e.g. 'skylink' */
  readonly id: string;
  /** Product name shown in the UI (D11) */
  readonly productName: string;
  readonly screens: readonly TerminalScreenId[];
  /** Realistic boot plus beam acquisition time, seconds (D13). The plant part's bootS stays authoritative for the sim. */
  readonly bootAcquisitionS: { readonly minS: number; readonly maxS: number };
  /** Fields on the Advanced screen; empty, or no 'advanced' screen, means no debug data */
  readonly debugFields: readonly TerminalDebugFieldId[];
  /** Sim seconds between statistics samples */
  readonly sampleIntervalS: number;
  /** How long a normal beam handover drop is recorded as lasting, seconds */
  readonly handoverDropS: number;
}

export const SKYLINK_SKIN: TerminalSkin = {
  id: 'skylink',
  productName: 'SkyLink',
  screens: ['home', 'obstructions', 'statistics', 'speed-test', 'settings', 'advanced'],
  bootAcquisitionS: { minS: 120, maxS: 300 },
  debugFields: ['software-version', 'uptime', 'boot-count', 'location-valid', 'gnss-satellites', 'alert-flags', 'tilt-boresight', 'obstruction-fraction'],
  sampleIntervalS: 30,
  handoverDropS: 2,
};

/** Boot plus acquisition time for this skin; `rand01` in [0, 1] picks within the range */
export function bootAcquisitionSeconds(skin: TerminalSkin, rand01: number): number {
  const { minS, maxS } = skin.bootAcquisitionS;

  return Math.round(minS + (maxS - minS) * Math.min(Math.max(rand01, 0), 1));
}

export function skinHasScreen(skin: TerminalSkin, screen: TerminalScreenId): boolean {
  return skin.screens.includes(screen);
}
