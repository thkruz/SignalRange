/**
 * @file authored-link-source - Scenario-authored stand-in for the KeepTrack SDK link (Campaign 6, M04)
 * @description Returns a path's authored profile, with the rates scaled by the account and
 * provider capacity factors, or null when the terminal cannot carry traffic. The SDK work
 * replaces this class behind `LinkQualitySource`; nothing else in the model changes.
 */

import type { AccountState, LayerReading, LinkQualitySource, LinkSample, ProviderState, ServicePathConfig } from './service-types';

/** What the source reads from the model (kept narrow so tests can fake it) */
export interface AuthoredLinkContext {
  path(serviceId: string): ServicePathConfig | undefined;
  layers(serviceId: string): LayerReading[];
  account(id: string): AccountState | undefined;
  provider(id: string): ProviderState | undefined;
}

/** Layers whose failure leaves the terminal unable to carry traffic */
const TRAFFIC_LAYERS = new Set(['power', 'local', 'registration', 'account', 'provider']);

export class AuthoredLinkSource implements LinkQualitySource {
  private readonly ctx_: AuthoredLinkContext;

  constructor(ctx: AuthoredLinkContext) {
    this.ctx_ = ctx;
  }

  sample(serviceId: string, _tS: number): LinkSample | null {
    const path = this.ctx_.path(serviceId);
    if (!path) {
      return null;
    }
    if (this.ctx_.layers(serviceId).some((l) => TRAFFIC_LAYERS.has(l.layer) && l.status === 'down')) {
      return null;
    }
    const factor = (this.ctx_.account(path.accountId)?.capacityFactor ?? 1) * (this.ctx_.provider(path.providerId)?.capacityFactor ?? 1);

    return {
      downMbps: path.profile.downMbps * factor,
      upMbps: path.profile.upMbps * factor,
      rttMs: path.profile.rttMs,
      lossPct: path.profile.lossPct,
      provenance: 'authored',
    };
  }
}
