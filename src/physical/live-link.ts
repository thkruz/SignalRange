/**
 * @file live-link - Optional live link adapter (Campaign 6, package H)
 * @description Backs `LinkQualitySource` and `LinkImpairmentSource` with physics inputs instead of an authored
 * profile. Nothing here computes RF physics: a `LivePhysicsReader` supplies the carrier-to-noise (from the
 * existing Friis budget, `LinkBudgetManager.computeCNRDb`) and an outage flag for a service, and this module only
 * maps them onto the service profile.
 *
 * Units and clock: C/N in dB, times in scenario seconds (`SimClock.scenarioElapsedMs() / 1000`), rates in Mbps.
 *
 * Mapping (per service, `LiveLinkMapping`): the authored profile is the clear-sky service at `nominalCnDb`. The
 * rate scales linearly in dB from 0 at `thresholdCnDb` to the full profile at `nominalCnDb` (above nominal does not
 * go faster). At or below threshold, or in outage, the path carries nothing. Loss rises `lossPctPerDb` for each dB
 * the margin falls under `lowMarginDb`. RTT is the profile RTT plus any `extraRttMs` the reader reports. Jitter is
 * not reported (absent, never zero).
 *
 * Ownership: this module scales the rate by the account and provider capacity factors exactly once (the same
 * `policyCapacityFactor` the authored source uses); the reader must return unscaled physical values. Availability
 * is read upstream of the layers (`LiveLinkImpairment`), the rate downstream, so there is no feedback cycle.
 *
 * Missing physical link: a service whose reader returns null has no physical link and carries nothing (registration
 * reads `link-lost`); it never falls back to the authored profile.
 *
 * Checkpoint: the adapter holds no state. It is a function of the reader's inputs at the sample time, and the
 * physics behind the reader is checkpointed by its own owner. `edges` cannot reconstruct an outage that opened and
 * closed inside a clock jump (the physics was not observed), so history records only the states seen at update.
 */

import { type LinkBudgetInputs, LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import { type AuthoredLinkContext, policyCapacityFactor, TRAFFIC_LAYERS } from './authored-link-source';
import type { LinkImpairment, LinkImpairmentSource, LinkImpairmentState, LinkQualitySource, LinkSample, LiveLinkConfig } from './service-types';

/** Physical inputs for one service at one instant, before any policy scaling */
export interface LivePathInputs {
  /** True while the path cannot carry anything (for example a phased-array scan outage) */
  outage: boolean;
  /** Carrier-to-noise, dB; null when it cannot be computed */
  cnDb: number | null;
  /** Delay the physics adds to the profile RTT, ms */
  extraRttMs?: number;
}

/** Supplies physical inputs by service; null = this service has no physical link */
export interface LivePhysicsReader {
  read(serviceId: string, tS: number): LivePathInputs | null;
}

const MAX_EXTRA_LOSS_PCT = 25;

export class LiveLinkSource implements LinkQualitySource {
  private readonly ctx_: AuthoredLinkContext;
  private readonly reader_: LivePhysicsReader;
  private readonly cfg_: LiveLinkConfig;

  constructor(ctx: AuthoredLinkContext, reader: LivePhysicsReader, cfg: LiveLinkConfig) {
    this.ctx_ = ctx;
    this.reader_ = reader;
    this.cfg_ = cfg;
  }

  sample(serviceId: string, tS: number): LinkSample | null {
    const path = this.ctx_.path(serviceId);
    const map = this.cfg_.mapping[serviceId];
    if (!path || !map) {
      return null;
    }
    if (this.ctx_.layers(serviceId).some((l) => TRAFFIC_LAYERS.has(l.layer) && l.status === 'down')) {
      return null;
    }
    const inputs = this.reader_.read(serviceId, tS);
    if (!inputs || inputs.outage || inputs.cnDb === null || !Number.isFinite(inputs.cnDb)) {
      return null;
    }
    const margin = inputs.cnDb - map.thresholdCnDb;
    if (margin <= 0) {
      return null;
    }
    const span = Math.max(map.nominalCnDb - map.thresholdCnDb, 1e-6);
    const factor = policyCapacityFactor(this.ctx_, path) * Math.min(1, margin / span);
    const extraLoss = Math.min(MAX_EXTRA_LOSS_PCT, Math.max(0, (map.lowMarginDb ?? 3) - margin) * (map.lossPctPerDb ?? 1.5));

    return {
      downMbps: path.profile.downMbps * factor,
      upMbps: path.profile.upMbps * factor,
      rttMs: path.profile.rttMs + (inputs.extraRttMs ?? 0),
      lossPct: path.profile.lossPct + extraLoss,
      provenance: 'sdk',
    };
  }
}

/** Availability from the same physics: unavailable on outage, at or below threshold, or with no physical link */
export class LiveLinkImpairment implements LinkImpairmentSource {
  private readonly reader_: LivePhysicsReader;
  private readonly cfg_: LiveLinkConfig;

  constructor(reader: LivePhysicsReader, cfg: LiveLinkConfig) {
    this.reader_ = reader;
    this.cfg_ = cfg;
  }

  at(serviceId: string, tS: number): LinkImpairment | null {
    const map = this.cfg_.mapping[serviceId];
    const inputs = map ? this.reader_.read(serviceId, tS) : null;
    const clear = !!map && !!inputs && !inputs.outage && inputs.cnDb !== null && Number.isFinite(inputs.cnDb) && inputs.cnDb > map.thresholdCnDb;

    return clear ? null : { unavailable: true };
  }

  edges(): Array<{ tS: number; impaired: boolean }> {
    return [];
  }

  /** Live availability is not armed by scenario events */
  start(): void {
    // no-op
  }

  stop(): void {
    // no-op
  }

  getState(): LinkImpairmentState {
    return { episodes: [] };
  }

  restoreState(): void {
    // no state
  }
}

/** The terminal-side physical figures the Friis budget needs besides the antenna gain */
export type LiveBudgetTerms = Omit<LinkBudgetInputs, 'rxGainDbi'>;

/** The slice of the phased array read model the reader uses */
export interface LivePhasedArraySlice {
  inOutage: boolean;
  gainDbi: number;
}

/**
 * Reader over a phased array: its outage flag, and its scanned gain (scan loss included) in the existing Friis
 * budget. Every service in `serviceIds` shares the array; others have no physical link.
 */
export function phasedArrayReader(slice: () => LivePhasedArraySlice | null, terms: LiveBudgetTerms, serviceIds: readonly string[]): LivePhysicsReader {
  return {
    read(serviceId) {
      const s = serviceIds.includes(serviceId) ? slice() : null;

      return s ? { outage: s.inOutage, cnDb: LinkBudgetManager.computeCNRDb({ ...terms, rxGainDbi: s.gainDbi }) } : null;
    },
  };
}
