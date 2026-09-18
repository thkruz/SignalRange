/**
 * @file Evidence facts - the vocabulary a decision is graded in
 * @description Ten pure reads over live simulation state. A decision option's
 * `correctWhen` rule is composed from these, so the same option set can have
 * a different right answer in a scenario with a different interference
 * schedule or a different injected fault. Authors never write evaluators.
 *
 * Every fact is read through a hold (EvidenceFactRegistry): the raw value has
 * to be stable for `holdSeconds` before the held value flips. The 1 Hz LEO
 * position step already forced the same discipline onto C/N reads
 * (cnHoldSeconds) and the observation dwell; without it a decision's right
 * answer could change under the player's cursor.
 */

import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { CommandingManager } from '@app/commanding/commanding-manager';
import { CryptoModule } from '@app/equipment/crypto';
import { FaultInjector } from '@app/faults';
import { GnssThreatManager } from '@app/gnss-threat/gnss-threat-manager';
import { InterferenceManager } from '@app/interference/interference-manager';
import { SecurityConsoleCore } from '@app/security-console/security-console-core';
import { WeatherManager } from '@app/weather/weather-manager';
import { DecisionFactRule, EVIDENCE_FACT_IDS, EvidenceFactId, OBSERVATION_DWELL_GRACE_SECONDS } from './objective-types';

export interface EvidenceContext {
  /** The deciding objective's ground station, when it has one */
  gs: GroundStation | null;
}

export type EvidenceFactResolver = (ctx: EvidenceContext) => boolean;

/** Weather has to be degrading the link by at least this much to be called the cause */
export const WEATHER_DOMINANT_DB = 3;

const anyGpsdo = (ctx: EvidenceContext, check: (state: GroundStation['rfFrontEnds'][number]['gpsdoModule']['state']) => boolean): boolean =>
  ctx.gs?.rfFrontEnds.some((fe) => check(fe.gpsdoModule.state)) ?? false;

const interferenceActive = (): boolean => InterferenceManager.isInitialized() && InterferenceManager.getInstance().isAnyEventActive();

const faultActive = (ctx: EvidenceContext): boolean => ctx.gs !== null && FaultInjector.getInstance().hasFaults(ctx.gs.state.id);

/**
 * The resolvers, keyed by fact id. Each is safe to call before the subsystem
 * it reads exists: an absent subsystem reads as "nothing wrong".
 */
export const EVIDENCE_FACTS: Record<EvidenceFactId, EvidenceFactResolver> = {
  'interference-active': () => interferenceActive(),

  'equipment-fault-active': (ctx) => faultActive(ctx),

  'crypto-intact': () => {
    if (!CryptoModule.hasInstance()) return true;
    const rx = CryptoModule.getInstance().getRxState();
    if (rx.decryptionMode !== 'ACTIVE') return rx.decryptionKeyStatus === 'Valid';
    return rx.decryptionKeyStatus === 'Valid' && rx.decryptionAuthTagVerified;
  },

  'gnss-constellation-healthy': (ctx) => anyGpsdo(ctx, (s) => s.isPowered && s.gnssSignalPresent && s.satelliteCount >= 4),

  'timing-drifting': () => GnssThreatManager.isInitialized() && GnssThreatManager.getInstance().isExposedToSpoof,

  'reference-in-holdover': (ctx) => anyGpsdo(ctx, (s) => s.isPowered && s.isInHoldover),

  'weather-attenuation-dominant': (ctx) => {
    if (!ctx.gs || !WeatherManager.hasInstance()) return false;
    if (interferenceActive() || faultActive(ctx)) return false;
    return WeatherManager.getInstance()
      .getActiveWeatherEvents(ctx.gs.state.id)
      .some((e) => e.linkMarginDegradation >= WEATHER_DOMINANT_DB);
  },

  'audit-anomaly-present': () => SecurityConsoleCore.isInitialized() && SecurityConsoleCore.getInstance().hasUnacknowledgedAnomaly(),

  'config-drifted': () => {
    if (!SecurityConsoleCore.isInitialized()) return false;
    const core = SecurityConsoleCore.getInstance();
    return core.getVisibleLog().some((e) => e.category === 'config' && e.isAnomaly === true && !core.isEventAcknowledged(e.id));
  },

  'command-window-open': () => CommandingManager.isInitialized() && CommandingManager.getInstance().isWindowOpen(),
};

/** Evaluate a rule against a fact reader (held reads in production, stubs in tests) */
export function evaluateFactRule(rule: DecisionFactRule, read: (id: EvidenceFactId) => boolean): boolean {
  if ('fact' in rule) return read(rule.fact) === rule.is;
  if ('all' in rule) return rule.all.every((r) => evaluateFactRule(r, read));
  return rule.any.some((r) => evaluateFactRule(r, read));
}

interface HeldFact {
  /** The value consumers see */
  value: boolean;
  /** The raw value the hold is currently waiting on */
  pendingValue: boolean;
  /** How long the raw value has disagreed with `value` */
  pendingSeconds: number;
}

/**
 * Holds every fact so a transient frame cannot flip a decision's right
 * answer. The first tick adopts the raw value without a hold, so a scenario
 * that opens under interference reads true from its first frame.
 */
export class EvidenceFactRegistry {
  private readonly held_ = new Map<EvidenceFactId, HeldFact>();

  constructor(
    private readonly holdSeconds_: number = OBSERVATION_DWELL_GRACE_SECONDS,
    private readonly resolvers_: Record<EvidenceFactId, EvidenceFactResolver> = EVIDENCE_FACTS
  ) {}

  /** Advance every hold by dtSeconds against the current state */
  tick(dtSeconds: number, ctx: EvidenceContext): void {
    for (const id of EVIDENCE_FACT_IDS) {
      const raw = this.resolvers_[id](ctx);
      const held = this.held_.get(id);

      if (!held) {
        this.held_.set(id, { value: raw, pendingValue: raw, pendingSeconds: 0 });
        continue;
      }
      if (raw === held.value) {
        held.pendingValue = raw;
        held.pendingSeconds = 0;
        continue;
      }
      if (raw !== held.pendingValue) {
        held.pendingValue = raw;
        held.pendingSeconds = 0;
      }
      held.pendingSeconds += dtSeconds;
      if (held.pendingSeconds >= this.holdSeconds_) {
        held.value = raw;
        held.pendingSeconds = 0;
      }
    }
  }

  /** Held value; false until the first tick */
  read(id: EvidenceFactId): boolean {
    return this.held_.get(id)?.value ?? false;
  }

  evaluate(rule: DecisionFactRule): boolean {
    return evaluateFactRule(rule, (id) => this.read(id));
  }

  snapshot(): Record<EvidenceFactId, boolean> {
    const out = {} as Record<EvidenceFactId, boolean>;
    for (const id of EVIDENCE_FACT_IDS) out[id] = this.read(id);
    return out;
  }

  reset(): void {
    this.held_.clear();
  }
}
