/**
 * @file link-impairment - Authored external link impairment (Campaign 6 package D)
 * @description Seeded loss windows on one service's radio path, driven by scenario time. Windows are a pure
 * function of (config, episode start), so the pattern survives restore and a large clock jump without any
 * stored random state. Nothing here knows about the terminal: a reboot, reseat or mode change cannot clear it.
 */

import type { LinkImpairment, LinkImpairmentConfig, LinkImpairmentEpisode, LinkImpairmentSource, LinkImpairmentState } from './service-types';

interface Window {
  startS: number;
  endS: number;
}

/** mulberry32 step on a 32-bit key: a deterministic value in [0, 1) */
function unit(seed: number, k: number, salt: number): number {
  let a = (seed ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class AuthoredLinkImpairment implements LinkImpairmentSource {
  private readonly configs_ = new Map<string, LinkImpairmentConfig>();
  private episodes_: LinkImpairmentEpisode[] = [];

  constructor(configs: LinkImpairmentConfig[]) {
    for (const c of configs) {
      this.configs_.set(c.id, { ...c });
    }
  }

  at(serviceId: string, tS: number): LinkImpairment | null {
    for (const w of this.windows_(serviceId)) {
      if (tS >= w.startS && tS < w.endS) {
        return { unavailable: true };
      }
    }

    return null;
  }

  edges(serviceId: string, fromS: number, toS: number): Array<{ tS: number; impaired: boolean }> {
    const out: Array<{ tS: number; impaired: boolean }> = [];
    for (const w of this.windows_(serviceId)) {
      if (w.startS > fromS && w.startS < toS) out.push({ tS: w.startS, impaired: true });
      if (w.endS > fromS && w.endS < toS) out.push({ tS: w.endS, impaired: false });
    }

    return out.sort((a, b) => a.tS - b.tS);
  }

  start(id: string, atS: number, durationS: number): void {
    if (!this.configs_.has(id)) {
      return;
    }
    const open = [...this.episodes_].reverse().find((e) => e.id === id && atS < e.endS);
    if (open) {
      open.endS = Math.max(open.endS, atS + durationS);

      return;
    }
    this.episodes_.push({ id, startS: atS, endS: atS + durationS });
  }

  stop(id: string, atS: number): void {
    for (const e of this.episodes_) {
      if (e.id === id && atS < e.endS) {
        e.endS = Math.max(e.startS, atS);
      }
    }
  }

  getState(): LinkImpairmentState {
    return { episodes: this.episodes_.map((e) => ({ ...e })) };
  }

  restoreState(state: LinkImpairmentState | undefined): void {
    this.episodes_ = Array.isArray(state?.episodes)
      ? state.episodes.filter((e) => this.configs_.has(e.id) && Number.isFinite(e.startS) && Number.isFinite(e.endS)).map((e) => ({ ...e }))
      : [];
  }

  /** Every window of every episode of every impairment on the service, each clipped to its episode */
  private windows_(serviceId: string): Window[] {
    const out: Window[] = [];
    for (const e of this.episodes_) {
      const c = this.configs_.get(e.id);
      if (!c || c.serviceId !== serviceId) {
        continue;
      }
      for (let k = 0; e.startS + k * c.periodS < e.endS; k++) {
        const startS = e.startS + k * c.periodS + (k === 0 ? 0 : unit(c.seed, k, 1) * c.jitterS);
        const lenS = c.downMinS + unit(c.seed, k, 2) * (c.downMaxS - c.downMinS);
        const endS = Math.min(startS + lenS, e.endS);
        if (startS < e.endS) {
          out.push({ startS, endS });
        }
      }
    }

    return out;
  }
}
