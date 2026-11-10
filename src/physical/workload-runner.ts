/**
 * @file workload-runner - Workload runs against link services (Campaign 6, M10)
 * @description Requirement cards (versioned), bounded runs on the scenario clock, shared
 * capacity with priority weights, suitability without a run (`assess`), profile comparison
 * including the remote leg. A run observes its service every update for `windowS` seconds,
 * keeps the worst suitability it saw, and ends by taking `workload-run` samples at the
 * application layer. A config or event epoch change (or a card revision) invalidates runs.
 * Core stays DOM-free: it talks to the service model and a clock.
 */

import type { WorkloadReader, WorkloadRunReading } from './field-hooks';
import type { ServiceModel } from './service-model';
import type {
  EffectiveProfile,
  RequirementCard,
  StartResult,
  WorkloadAssessment,
  WorkloadConfig,
  WorkloadPriority,
  WorkloadRun,
  WorkloadRunnerState,
  WorkloadStatus,
} from './workload-types';

export type { RequirementCard, StartResult, WorkloadAssessment, WorkloadConfig, WorkloadRun, WorkloadRunnerState } from './workload-types';

export interface WorkloadRunnerDeps {
  now(): number;
  /** Advance scenario time (used by `waitForRun`) */
  skip?(seconds: number): void;
}

const DEFAULT_TOLERANCE = 0.2;
const RUN_CAP = 60;
const DEFAULT_WEIGHT: Record<WorkloadPriority, number> = { mission: 4, routine: 2, background: 1 };
type Suitability = 'supported' | 'degraded' | 'unsupported';
const RANK: Record<Suitability, number> = { supported: 0, degraded: 1, unsupported: 2 };

export class WorkloadRunner implements WorkloadReader {
  private readonly cards_ = new Map<string, RequirementCard>();
  private readonly weights_ = new Map<string, number>();
  private readonly service_: ServiceModel;
  private readonly deps_: WorkloadRunnerDeps;
  private readonly tolerance_: number;
  private runs_: WorkloadRun[] = [];
  private seq_ = 0;

  constructor(cfg: WorkloadConfig, service: ServiceModel, deps: WorkloadRunnerDeps) {
    for (const c of cfg.cards) {
      this.cards_.set(c.id, { ...c });
      if (c.startWeight !== undefined) this.weights_.set(c.id, c.startWeight);
    }
    this.service_ = service;
    this.deps_ = deps;
    this.tolerance_ = cfg.degradedTolerance ?? DEFAULT_TOLERANCE;
    for (const s of cfg.autoStart ?? []) this.start(s.cardId, s.serviceId);
  }

  // ------------------------------------------------------------------ cards

  getCard(cardId: string): RequirementCard | undefined {
    return this.cards_.get(cardId);
  }

  cards(): RequirementCard[] {
    return [...this.cards_.values()];
  }

  /** Add a card that is not there yet (a consumer app's own job, such as a speed test). Returns the card in use. */
  ensureCard(card: RequirementCard): RequirementCard {
    const existing = this.cards_.get(card.id);
    if (existing) {
      return existing;
    }
    this.cards_.set(card.id, { ...card });

    return card;
  }

  /** Replace a card's requirement. The version goes up by one; runs of older versions stop counting. */
  reviseCard(patch: Partial<RequirementCard> & { id: string }): RequirementCard | null {
    const current = this.cards_.get(patch.id);
    if (!current) {
      return null;
    }
    const next: RequirementCard = { ...current, ...patch, version: current.version + 1 };
    this.cards_.set(next.id, next);
    this.invalidate_();

    return next;
  }

  /** S5: share weight a card's runs get on a busy service */
  setPriority(cardId: string, weight: number): void {
    if (this.cards_.has(cardId) && weight > 0) {
      this.weights_.set(cardId, weight);
    }
  }

  priorityOf(cardId: string): number {
    return this.getPriority(cardId);
  }

  getPriority(cardId: string): number {
    const card = this.cards_.get(cardId);

    return this.weights_.get(cardId) ?? (card ? DEFAULT_WEIGHT[card.priority] : 0);
  }

  // ----------------------------------------------------------------- assess

  /** Suitability of a service for a card right now, without a run and without sharing capacity */
  assess(cardId: string, serviceId: string): WorkloadAssessment | null {
    return this.assess_(cardId, serviceId, 1);
  }

  /** S6/S14: the same card against several services */
  compare(cardId: string, serviceIds: string[]): WorkloadAssessment[] {
    const out: WorkloadAssessment[] = [];
    for (const id of serviceIds) {
      const a = this.assess(cardId, id);
      if (a) out.push(a);
    }

    return out;
  }

  /** The profile a card would see: link profile plus remote leg (rtt adds, rate is capped) */
  effectiveProfile(serviceId: string, share = 1): EffectiveProfile | null {
    const link = this.service_.linkProfile(serviceId);
    if (!link) {
      return null;
    }
    const leg = this.service_.getPath(serviceId)?.remoteLeg;

    return {
      downMbps: Math.min(link.downMbps, leg?.downMbps ?? Number.POSITIVE_INFINITY) * share,
      upMbps: link.upMbps * share,
      rttMs: link.rttMs + (leg?.rttMs ?? 0),
      lossPct: link.lossPct,
      // Independent legs: variances add, so the remote leg's own jitter combines in quadrature (no leg jitter = fixed delay)
      ...(link.jitterMs === undefined ? {} : { jitterMs: Math.hypot(link.jitterMs, leg?.jitterMs ?? 0) }),
    };
  }

  private assess_(cardId: string, serviceId: string, share: number): WorkloadAssessment | null {
    const card = this.cards_.get(cardId);
    if (!card || !this.service_.getPath(serviceId)) {
      return null;
    }
    const base = { cardId, cardVersion: card.version, serviceId };
    // M26: a down layer anywhere explains the failure (an endpoint can be down behind a merely degraded account)
    const layers = this.service_.layers(serviceId);
    const fail = layers.find((l) => l.status === 'down') ?? this.service_.firstFailure(serviceId);
    if (fail && fail.status === 'down') {
      return { ...base, status: 'unsupported', unmet: [], reason: `layer:${fail.reason}`, effective: null };
    }
    const eff = this.effectiveProfile(serviceId, share);
    if (!eff) {
      return { ...base, status: 'unsupported', unmet: [], reason: 'no-link', effective: null };
    }
    const unmet: string[] = [];
    let worst: Suitability = 'supported';
    const check = (name: string, value: number, ok: boolean, miss: number): void => {
      if (ok) return;
      unmet.push(name);
      const level: Suitability = miss <= this.tolerance_ ? 'degraded' : 'unsupported';
      if (RANK[level] > RANK[worst]) worst = level;
      void value;
    };
    if (card.minDownMbps !== undefined) check('downMbps', eff.downMbps, eff.downMbps >= card.minDownMbps, (card.minDownMbps - eff.downMbps) / card.minDownMbps);
    if (card.minUpMbps !== undefined) check('upMbps', eff.upMbps, eff.upMbps >= card.minUpMbps, (card.minUpMbps - eff.upMbps) / card.minUpMbps);
    if (card.maxRttMs !== undefined) check('rttMs', eff.rttMs, eff.rttMs <= card.maxRttMs, (eff.rttMs - card.maxRttMs) / card.maxRttMs);
    if (card.maxLossPct !== undefined) {
      check('lossPct', eff.lossPct, eff.lossPct <= card.maxLossPct, card.maxLossPct === 0 ? 1 : (eff.lossPct - card.maxLossPct) / card.maxLossPct);
    }
    if (card.maxJitterMs !== undefined) {
      // No delay variation data is not zero jitter: the requirement cannot be shown met
      if (eff.jitterMs === undefined) {
        unmet.push('jitterMs');
        worst = 'unsupported';
      } else {
        check('jitterMs', eff.jitterMs, eff.jitterMs <= card.maxJitterMs, (eff.jitterMs - card.maxJitterMs) / card.maxJitterMs);
      }
    }
    // A degraded layer (endpoint or link trouble) cannot read better than degraded. An account or provider
    // capacity restriction is already priced into the effective profile above, so the card limits decide.
    // M26: only a degraded layer other than account and provider caps the result, wherever it sits in the chain
    const capping = layers.some(
      (l) => l.status === 'degraded' && l.layer !== 'account' && l.layer !== 'provider' && l.reason !== 'upstream-account' && l.reason !== 'upstream-provider'
    );
    if (capping && RANK[worst] < RANK.degraded) worst = 'degraded';

    return { ...base, status: worst, unmet, reason: 'ok', effective: eff };
  }

  // ------------------------------------------------------------------- runs

  runs(): readonly WorkloadRunReading[] {
    return this.runs_;
  }

  getRuns(): readonly WorkloadRun[] {
    return this.runs_;
  }

  getRun(runId: string): WorkloadRun | undefined {
    return this.runs_.find((r) => r.id === runId);
  }

  running(serviceId?: string): WorkloadRun[] {
    return this.runs_.filter((r) => r.status === 'running' && (serviceId === undefined || r.serviceId === serviceId));
  }

  /** Share of a service's capacity this run gets right now (1 when it runs alone) */
  shareOf(run: WorkloadRun): number {
    const peers = this.running(run.serviceId);
    if (!peers.some((r) => r.id === run.id)) {
      return 1;
    }
    const total = peers.reduce((sum, r) => sum + this.getPriority(r.cardId), 0);

    return total > 0 ? this.getPriority(run.cardId) / total : 1;
  }

  start(cardId: string, serviceId: string): StartResult {
    const card = this.cards_.get(cardId);
    if (!card) return { ok: false, reason: 'unknown-card' };
    if (!this.service_.getPath(serviceId)) return { ok: false, reason: 'unknown-service' };
    if (this.runs_.some((r) => r.status === 'running' && r.cardId === cardId && r.serviceId === serviceId)) {
      return { ok: false, reason: 'already-running' };
    }
    const now = this.deps_.now();
    const epochs = this.service_.getEpochs();
    this.seq_ += 1;
    const run: WorkloadRun = {
      id: `run-${this.seq_}`,
      cardId,
      cardVersion: card.version,
      serviceId,
      startS: now,
      endS: now + card.windowS,
      status: 'running',
      sampleIds: [],
      worst: 'supported',
      unmet: [],
      configEpoch: epochs.config,
      eventEpoch: epochs.event,
    };
    this.runs_.push(run);
    if (this.runs_.length > RUN_CAP) {
      this.runs_ = this.runs_.filter((r, i) => r.status === 'running' || i >= this.runs_.length - RUN_CAP);
    }
    this.observe_(run);

    return { ok: true, run };
  }

  abort(runId: string): boolean {
    const run = this.getRun(runId);
    if (!run || run.status !== 'running' || this.cards_.get(run.cardId)?.standing) {
      return false;
    }
    run.status = 'aborted';
    run.endS = this.deps_.now();

    return true;
  }

  /** Burn the rest of a run's window on the scenario clock, then finish it */
  waitForRun(runId: string): WorkloadRun | undefined {
    const run = this.getRun(runId);
    if (run?.status === 'running' && !this.cards_.get(run.cardId)?.standing) {
      const remaining = run.endS - this.deps_.now();
      if (remaining > 0) {
        this.deps_.skip?.(remaining);
      }
      this.update();
    }

    return this.getRun(runId);
  }

  /** Call once per plant step: invalidate, observe, finish due runs */
  update(): void {
    this.invalidate_();
    const now = this.deps_.now();
    for (const run of this.running()) {
      this.observe_(run);
      if (now >= run.endS) {
        this.finish_(run);
      }
    }
  }

  private invalidate_(): void {
    const epochs = this.service_.getEpochs();
    for (const run of this.runs_) {
      if (run.invalidatedBy || run.status === 'aborted') {
        continue;
      }
      const card = this.cards_.get(run.cardId);
      let why: string | undefined;
      if (card && card.version !== run.cardVersion) why = 'card-version';
      else if (card?.standing) why = undefined;
      else if (run.configEpoch !== epochs.config) why = 'config';
      else if (run.eventEpoch !== epochs.event) why = 'event';
      if (why) {
        run.invalidatedBy = why;
        if (run.status === 'running') {
          run.status = 'aborted';
          run.endS = this.deps_.now();
        }
      }
    }
  }

  private observe_(run: WorkloadRun): void {
    const a = this.assess_(run.cardId, run.serviceId, this.shareOf(run));
    if (a && RANK[a.status] >= RANK[run.worst]) {
      if (RANK[a.status] > RANK[run.worst] || run.unmet.length === 0) {
        run.unmet = a.unmet.length ? a.unmet : a.status === 'supported' ? [] : [a.reason];
      }
      run.worst = a.status;
    }
  }

  private finish_(run: WorkloadRun): void {
    const card = this.cards_.get(run.cardId);
    const ids = [this.service_.takeSample(run.serviceId, 'application', 'workload-run').id];
    const metrics: Array<['downMbps' | 'upMbps' | 'rttMs' | 'lossPct' | 'jitterMs', unknown]> = [
      ['downMbps', card?.minDownMbps],
      ['upMbps', card?.minUpMbps],
      ['rttMs', card?.maxRttMs],
      ['lossPct', card?.maxLossPct],
      ['jitterMs', card?.maxJitterMs],
    ];
    for (const [metric, bound] of metrics) {
      if (bound !== undefined) {
        ids.push(this.service_.takeSample(run.serviceId, 'application', 'workload-run', undefined, metric).id);
      }
    }
    run.sampleIds = ids;
    run.status = run.worst as WorkloadStatus;
  }

  // ------------------------------------------------------------- checkpoint

  getState(): WorkloadRunnerState {
    return {
      runs: this.runs_.map((r) => ({ ...r, sampleIds: [...r.sampleIds], unmet: [...r.unmet] })),
      weights: [...this.weights_],
      cards: this.cards(),
      seq: this.seq_,
    };
  }

  /** A run in progress restores as aborted ('reload'); finished runs stop counting too (retake the check) */
  restoreState(state: WorkloadRunnerState | undefined): void {
    if (!state) {
      return;
    }
    this.cards_.clear();
    for (const c of state.cards) this.cards_.set(c.id, { ...c });
    this.weights_.clear();
    for (const [id, w] of state.weights) this.weights_.set(id, w);
    this.seq_ = state.seq;
    this.runs_ = state.runs.map((r) => {
      const run = { ...r, sampleIds: [...r.sampleIds], unmet: [...r.unmet] };
      if (this.cards_.get(run.cardId)?.standing && run.status === 'running') {
        return run;
      }
      if (run.status === 'running') {
        run.status = 'aborted';
        run.endS = this.deps_.now();
      }
      run.invalidatedBy ??= 'reload';

      return run;
    });
  }
}
