/**
 * M06 condition factory for Campaign 6. Every factory returns a `custom` Condition (`id: 'c6:<name>'`)
 * whose evaluator reads only the field hooks (plant, service model, evidence log, events,
 * workloads, records). With no plant every evaluator is false, so a scenario outside the field
 * campaign can never complete one by accident. Conditions that depend on a sample, an event or a
 * window carry `params.fieldTimed` so the scan test can keep them off freezing objectives.
 */

import type { Condition, ConditionParams } from '@app/objectives/objective-types';
import { type HypothesisEntry, TEST_VERBS } from '@app/physical/evidence-log';
import { assessHypothesis, type HypothesisSpec } from '@app/physical/evidence-predicates';
import { type FieldHooks, getActiveField } from '@app/physical/field-hooks';
import type { ServiceLayer } from '@app/physical/service-types';

type TimedParams = ConditionParams & { fieldTimed?: boolean };

const hooks = (): FieldHooks | null => getActiveField();

function make(name: string, description: string, evaluator: () => boolean, timed: boolean): Condition {
  const params: TimedParams = { evaluator, fieldTimed: timed };

  return { id: `c6:${name}`, type: 'custom', description, params, mustMaintain: false };
}

/** True for a factory condition that needs a sample, an event or a window to pass */
export function isFieldTimedCondition(c: Condition): boolean {
  return (c.params as TimedParams | undefined)?.fieldTimed === true;
}

export interface PowerReadMetrics {
  socWh?: { min?: number; max?: number };
  loadW?: { min?: number; max?: number };
  fuelL?: { min?: number; max?: number };
}

const inRange = (v: number, r: { min?: number; max?: number } | undefined): boolean =>
  r === undefined || ((r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max));

/** The part's live power readings sit inside every given range (battery soc, any part's draw, generator fuel) */
export function powerRead(partId: string, metrics: PowerReadMetrics, description = `Power readings for ${partId}`): Condition {
  return make(
    `powerRead:${partId}:${JSON.stringify(metrics)}`,
    description,
    () => {
      const h = hooks();
      if (!h) {
        return false;
      }
      const r = h.plant.getPowerReadings();
      const soc = r.socWh[partId];
      const fuel = r.fuelL[partId];
      if (metrics.socWh && soc === undefined) {
        return false;
      }
      if (metrics.fuelL && fuel === undefined) {
        return false;
      }

      return inRange(soc ?? 0, metrics.socWh) && inRange(fuel ?? 0, metrics.fuelL) && inRange(r.loadW[partId] ?? h.plant.getLoadW(partId), metrics.loadW);
    },
    false
  );
}

export function modeIs(partId: string, mode: string, description = `${partId} is in ${mode} mode`): Condition {
  return make(`modeIs:${partId}:${mode}`, description, () => hooks()?.plant.getPartMode(partId) === mode, false);
}

/** The plant's power forecast (optionally with mode overrides) meets the authored reserve */
export function forecastMeetsReserve(modeOverrides: Record<string, string> = {}, description = 'Forecast keeps the reserve'): Condition {
  return make(
    `forecastMeetsReserve:${JSON.stringify(Object.entries(modeOverrides).sort())}`,
    description,
    () => hooks()?.plant.forecast(modeOverrides).meetsReserve ?? false,
    false
  );
}

/** The latest sample of the layer has the status (when given) and, by default, is still current */
export function layerObserved(
  serviceId: string,
  layer: ServiceLayer,
  opts: { status?: 'up' | 'degraded' | 'down' | 'unknown'; current?: boolean } = {},
  description = `${serviceId} ${layer} observed`
): Condition {
  return make(
    `layerObserved:${serviceId}:${layer}:${opts.status ?? 'any'}:${opts.current === false ? 'any-age' : 'current'}`,
    description,
    () => {
      const model = hooks()?.service;
      const sample = model?.latest(serviceId, layer);
      if (!model || !sample) {
        return false;
      }
      if (opts.current !== false && model.freshness(sample) !== 'current') {
        return false;
      }

      return opts.status === undefined || sample.value === opts.status;
    },
    true
  );
}

/** Every listed layer has a current sample */
export function samplesCurrent(serviceId: string, layers: ServiceLayer[], description = `${serviceId} samples are current`): Condition {
  return make(
    `samplesCurrent:${serviceId}:${layers.join(',')}`,
    description,
    () => {
      const model = hooks()?.service;
      if (!model) {
        return false;
      }

      return layers.every((layer) => {
        const sample = model.latest(serviceId, layer);

        return sample !== null && model.freshness(sample) === 'current';
      });
    },
    true
  );
}

export function eventFired(eventId: string, description = `Event ${eventId} has happened`): Condition {
  return make(`eventFired:${eventId}`, description, () => hooks()?.events?.hasFired(eventId) ?? false, true);
}

/**
 * The player made an effective action on `actionTarget`. Evidence is not required to complete it:
 * a fix made before any test would otherwise lock the objective for good (the fault cannot be
 * revealed again). The M05 scorer grades the order, and a fix without earlier support counts as an
 * unsupported fix (capped penalty). `target` and `fact` stay in the id so authored rows read the same.
 */
export function evidenceBeforeAction(target: string, fact: string, actionTarget: string, description = 'Evidence came before the repair'): Condition {
  return make(
    `evidenceBeforeAction:${target}:${fact}:${actionTarget}`,
    description,
    () => {
      const log = hooks()?.evidence;
      if (!log) {
        return false;
      }
      return log.entries('action').some((e) => e.subject === actionTarget && e.effective === true);
    },
    true
  );
}

/** The fault is gone and an effective action cleared its target. A fix with no earlier test is an unsupported fix for the scorer, not a lock. */
export function faultClearedWithEvidence(faultId: string, description = 'Fault cleared with evidence'): Condition {
  return make(
    `faultClearedWithEvidence:${faultId}`,
    description,
    () => {
      const h = hooks();
      if (!h?.evidence) {
        return false;
      }
      const target = h.evidence.faultTarget(faultId);
      if (!target || h.plant.getFaults().some((f) => f.id === faultId)) {
        return false;
      }
      return h.evidence.entries().some((e) => e.kind === 'action' && e.effective === true && e.clearedTargets?.includes(target));
    },
    true
  );
}

/** The player filed a hypothesis on this scope and target citing at least `minCited` entries */
export function hypothesisMatches(
  claim: { scope: HypothesisEntry['claim']['scope']; targetId: string },
  opts: { minCited?: number; cause?: string } = {},
  description = 'Hypothesis filed'
): Condition {
  return make(
    `hypothesisMatches:${claim.scope}:${claim.targetId}${opts.cause === undefined ? '' : `:${opts.cause}`}`,
    description,
    () => {
      const log = hooks()?.evidence;
      if (!log) {
        return false;
      }

      return (log.entries('hypothesis') as readonly HypothesisEntry[]).some(
        (h) =>
          h.claim.scope === claim.scope &&
          h.claim.targetId === claim.targetId &&
          (opts.cause === undefined || h.claim.cause === opts.cause) &&
          h.citedEntryIds.length >= (opts.minCited ?? 1)
      );
    },
    true
  );
}

/** Scenario time of the latest effective action that cleared the fault's target, or null while the fault stands or nothing cleared it */
function clearedAtS(h: FieldHooks, faultId: string): number | null {
  const target = h.evidence?.faultTarget(faultId);
  if (!h.evidence || !target || h.plant.getFaults().some((f) => f.id === faultId)) {
    return null;
  }
  const hits = h.evidence.entries().filter((e) => e.kind === 'action' && e.effective === true && e.clearedTargets?.includes(target));

  return hits.length > 0 ? Math.max(...hits.map((e) => e.tS)) : null;
}

/** A supported, not invalidated workload run on the card and service (after an event or a fault's repair, when given) */
export function workloadVerified(
  args: { card: string; service: string; afterEvent?: string; afterFaultCleared?: string; afterRequestApproved?: string; afterHandover?: string },
  description = 'Workload verified'
): Condition {
  return make(
    `workloadVerified:${args.card}:${args.service}${args.afterFaultCleared === undefined ? '' : `:after-${args.afterFaultCleared}`}${args.afterRequestApproved === undefined ? '' : `:approved-${args.afterRequestApproved}`}${args.afterHandover === undefined ? '' : `:filed-${args.afterHandover}`}`,
    description,
    () => {
      const h = hooks();
      if (!h?.workloads) {
        return false;
      }
      const after = args.afterEvent === undefined ? null : (h.events?.firedAtS(args.afterEvent) ?? null);
      if (args.afterEvent !== undefined && after === null) {
        return false;
      }

      let from = after;
      if (args.afterFaultCleared !== undefined) {
        const cleared = clearedAtS(h, args.afterFaultCleared);
        if (cleared === null) {
          return false;
        }
        from = Math.max(from ?? 0, cleared);
      }

      if (args.afterRequestApproved !== undefined) {
        const decision = h.records?.requestDecision?.(args.afterRequestApproved);
        if (decision?.status !== 'approved' || decision.decidedAtS === undefined) {
          return false;
        }
        from = Math.max(from ?? 0, decision.decidedAtS);
      }

      if (args.afterHandover !== undefined) {
        const filed = h.records?.handoverFiledAtS?.(args.afterHandover) ?? null;
        if (filed === null) {
          return false;
        }
        from = Math.max(from ?? 0, filed);
      }

      return h.workloads
        .runs()
        .some((r) => r.cardId === args.card && r.serviceId === args.service && r.status === 'supported' && !r.invalidatedBy && (from === null || r.startS >= from));
    },
    true
  );
}

/**
 * Stored battery energy stayed at or above the authored reserve for `windowS` scenario seconds in a row.
 * The window start lives in the plant (keyed by window length), so it rides in checkpoints and
 * clears on reset and restore. The plan's 10 % rate check is not done (see FX1 result).
 */
export function reserveHeld(args: { windowS: number }, description = 'Reserve held'): Condition {
  return make(
    `reserveHeld:${args.windowS}`,
    description,
    () => {
      const h = hooks();
      if (!h) {
        return false;
      }
      const r = h.plant.getPowerReadings();
      const stored = Object.values(r.socWh).reduce((a, b) => a + b, 0);
      const sinceS = h.plant.holdWindow(`reserveHeld:${args.windowS}`, r.reserveWh !== null && stored >= r.reserveWh);
      if (sinceS === null) {
        return false;
      }

      return r.tS - sinceS >= args.windowS;
    },
    true
  );
}

export function recordAccepted(unitId: string, description = `Record accepted for ${unitId}`): Condition {
  return make(`recordAccepted:${unitId}`, description, () => hooks()?.records?.isAccepted(unitId) ?? false, true);
}

export function handoverValid(formId: string, description = 'Handover form valid'): Condition {
  return make(`handoverValid:${formId}`, description, () => hooks()?.records?.isHandoverValid(formId) ?? false, true);
}

/**
 * The latest accepted filing of the form certifies the state as it is NOW (FieldRecords.isHandoverCurrent).
 * For a final claim. Unlike `handoverValid` the row is re-evaluated until its objective completes, so a mode
 * change or a staged event after the filing makes the objective wait for a fresh filing. The earlier filing
 * stays on record and `handoverValid` rows of completed objectives stay done.
 */
export function handoverCurrent(formId: string, description = 'Handover certifies the current state'): Condition {
  const c = make(`handoverCurrent:${formId}`, description, () => hooks()?.records?.isHandoverCurrent?.(formId) ?? false, true);

  return { ...c, mustMaintain: true, maintainUntilObjectiveComplete: true };
}

/**
 * Every listed part, connector or cable has a test observation (inspect, wiggle, feel or a meter
 * reading) in the evidence log. The log writes the entry as the player acts, so this is the
 * recorded assessment of each site fact, not a click on a close-up.
 */
/** The player filed this correction request (any answer) */
export function correctionFiled(requestId: string, description = `Correction ${requestId} filed`): Condition {
  return make(`correctionFiled:${requestId}`, description, () => hooks()?.records?.requestDecision?.(requestId) != null, true);
}

/** The authorized contact approved this correction request after the player filed it */
export function correctionApproved(requestId: string, description = `Correction ${requestId} approved`): Condition {
  return make(`correctionApproved:${requestId}`, description, () => hooks()?.records?.requestDecision?.(requestId)?.status === 'approved', true);
}

/**
 * Every listed part, connector or cable has a test observation (inspect, wiggle, feel or a meter
 * reading) in the evidence log. The log writes the entry as the player acts, so this is the
 * recorded assessment of each site fact, not a click on a close-up.
 */
export function siteChecked(targetIds: string[], description = 'Site checks recorded'): Condition {
  return make(
    `siteChecked:${targetIds.join(',')}`,
    description,
    () => {
      const log = hooks()?.evidence;
      if (!log) {
        return false;
      }
      const seen = new Set(
        log
          .entries('observation')
          .filter((e) => e.verb !== undefined && TEST_VERBS.has(e.verb))
          .map((e) => e.subject)
      );

      return targetIds.every((id) => seen.has(id));
    },
    true
  );
}

/** A test showed the player the injected fault (it exists, and an observation revealed its target) */
export function faultEvidenceRecorded(faultId: string, description = 'Fault evidence recorded'): Condition {
  return make(
    `faultEvidenceRecorded:${faultId}`,
    description,
    () => {
      const log = hooks()?.evidence;
      const target = log?.faultTarget(faultId);
      if (!log || !target) {
        return false;
      }

      return log.entries('observation').some((e) => e.positive === true && e.revealedTargets?.includes(target));
    },
    true
  );
}

/** A generator or other source is feeding the battery again (charge power above zero) */
export function chargingRestored(description = 'External input restored'): Condition {
  return make('chargingRestored', description, () => (hooks()?.plant.getPowerReadings().chargeW ?? 0) > 0, true);
}

/** At least one of the services is assessed as supporting the card right now (no run needed) */
export function anyServiceSupports(cardId: string, serviceIds: string[], description = 'A configured service supports the workload'): Condition {
  return make(
    `anyServiceSupports:${cardId}:${serviceIds.join(',')}`,
    description,
    () => {
      const w = hooks()?.workloads;
      if (!w?.assess) {
        return false;
      }

      return serviceIds.some((id) => w.assess?.(cardId, id)?.status === 'supported');
    },
    false
  );
}

/**
 * The service dropped out at least `minInterruptions` times (the model's own history, so it is the
 * real timeline) and the player has read both sides of the pattern: a registration reading that
 * showed it down, one that showed it up, and a local-network reading that stayed up.
 */
export function interruptionPattern(
  serviceId: string,
  minInterruptions: number,
  description = 'Interruption pattern recorded',
  /** Count only drops with these causes (S15: 'link-lost', so a modem reboot cannot manufacture drops). Entries with no recorded cause (old saves) count. */
  opts: { reasons?: string[] } = {}
): Condition {
  return make(
    `interruptionPattern:${serviceId}:${minInterruptions}${opts.reasons ? `:${opts.reasons.join(',')}` : ''}`,
    description,
    () => {
      const model = hooks()?.service;
      if (!model) {
        return false;
      }
      const drops = model
        .history(serviceId)
        .filter((e) => e.layer === 'registration' && e.to === 'down' && (!opts.reasons || e.reason === undefined || opts.reasons.includes(e.reason))).length;
      const samples = model.samplesFor(serviceId);
      const registration = (v: string) => samples.some((s) => s.layer === 'registration' && s.value === v);

      return drops >= minInterruptions && registration('down') && registration('up') && samples.some((s) => s.layer === 'local' && s.value === 'up');
    },
    true
  );
}

/**
 * At least `min` tests found nothing wrong (negative observations are kept as evidence, not discarded).
 * Repeating one test on the same subject earns one credit; `subjects` limits credit to checks of the
 * subjects relevant to the diagnosis (an off-path negative is not evidence about the cause).
 */
export function negativeChecksKept(min: number, description = 'Negative checks recorded', opts: { subjects?: string[] } = {}): Condition {
  return make(
    `negativeChecksKept:${min}${opts.subjects ? `:${opts.subjects.join(',')}` : ''}`,
    description,
    () => {
      const log = hooks()?.evidence;
      if (!log) {
        return false;
      }
      const negatives = log
        .entries('observation')
        .filter((e) => e.verb !== undefined && TEST_VERBS.has(e.verb) && e.positive === false && (opts.subjects === undefined || opts.subjects.includes(e.subject)));

      return new Set(negatives.map((e) => e.subject)).size >= min;
    },
    true
  );
}

/**
 * A hypothesis names an allowed cause (never 'other') with distinct cited observations. Optional scope,
 * target and typed evidence routes (any one route suffices) tie it to what the player actually saw; see
 * `assessHypothesis` for the rules and reasons.
 */
export function hypothesisFiled(causes: string[], opts: Omit<HypothesisSpec, 'causes'> = {}, description = 'Hypothesis filed with a cause and evidence'): Condition {
  return make(
    `hypothesisFiled:${causes.join(',')}`,
    description,
    () => {
      const h = hooks();
      const log = h?.evidence;
      if (!log) {
        return false;
      }
      const all = log.entries();
      const ctx = { eventFiredAtS: (id: string) => h?.events?.firedAtS(id) ?? null };

      return (log.entries('hypothesis') as readonly HypothesisEntry[]).some((hyp) => assessHypothesis(hyp, { ...opts, causes }, all, ctx).ok);
    },
    false
  );
}

/** The latest sample of the layer was taken after the event fired and has the status */
export function sampleAfterEvent(
  serviceId: string,
  layer: ServiceLayer,
  status: 'up' | 'degraded' | 'down',
  eventId: string,
  description = `${serviceId} ${layer} read after ${eventId}`
): Condition {
  return make(
    `sampleAfterEvent:${serviceId}:${layer}:${status}:${eventId}`,
    description,
    () => {
      const h = hooks();
      const firedAt = h?.events?.firedAtS(eventId) ?? null;
      const sample = h?.service?.latest(serviceId, layer);

      return firedAt !== null && sample != null && sample.tS >= firedAt && sample.value === status;
    },
    true
  );
}

/**
 * A normal recovery was watched through: after the staged event (or the player's last restart of
 * the terminal, whichever is later) the registration layer came back up in the history and the
 * player read it up afterwards. A restart resets the interval; it does not fail the objective.
 */
export function recoveryObserved(serviceId: string, eventId: string, terminalPartId: string, description = 'Recovery observed'): Condition {
  return make(
    `recoveryObserved:${serviceId}:${eventId}`,
    description,
    () => {
      const h = hooks();
      const firedAt = h?.events?.firedAtS(eventId) ?? null;
      if (!h?.service || firedAt === null) {
        return false;
      }
      const restarts = h.plant.getLog().filter((e) => e.verb === 'powerCycle' && e.target === terminalPartId && e.tSeconds >= firedAt);
      const since = Math.max(firedAt, ...restarts.map((e) => e.tSeconds));
      const upAt = h.service
        .history(serviceId)
        .filter((e) => e.layer === 'registration' && e.to === 'up' && e.tS > since)
        .map((e) => e.tS)[0];
      if (upAt === undefined) {
        return false;
      }
      const sample = h.service.latest(serviceId, 'registration');

      return sample != null && sample.tS >= upAt && sample.value === 'up';
    },
    true
  );
}

type RunStatus = 'supported' | 'degraded' | 'unsupported';

/**
 * Every listed service has a finished run of the card that still counts (not invalidated). `statuses`
 * narrows the outcome: S5 needs the first run to miss the requirement, S6 accepts any outcome because an
 * unsuitable result is a valid, fully observed one.
 */
export function workloadRunFinished(args: { card: string; services: string[]; statuses?: RunStatus[] }, description = 'Workload run finished'): Condition {
  return make(
    `workloadRunFinished:${args.card}:${args.services.join(',')}${args.statuses ? `:${args.statuses.join('|')}` : ''}`,
    description,
    () => {
      const runs = hooks()?.workloads?.runs();
      if (!runs) {
        return false;
      }
      const allowed: string[] = args.statuses ?? ['supported', 'degraded', 'unsupported'];

      return args.services.every((s) => runs.some((r) => r.cardId === args.card && r.serviceId === s && allowed.includes(r.status) && !r.invalidatedBy));
    },
    true
  );
}

/** The deferred card now carries a smaller share weight than the card that must keep running */
export function priorityDeferred(args: { defer: string; keep: string }, description = 'Priority applied'): Condition {
  return make(
    `priorityDeferred:${args.defer}:${args.keep}`,
    description,
    () => {
      const w = hooks()?.workloads;
      if (!w?.priorityOf) {
        return false;
      }

      return w.priorityOf(args.defer) < w.priorityOf(args.keep);
    },
    false
  );
}

/**
 * M24: a path-diagram selection the player recorded (EvidenceLog.selections) names every `include` node and none
 * of the `exclude` nodes. `afterEvent` ignores selections made before that event fired. The latest qualifying
 * selection counts; earlier wrong selections stay in the notebook but never block a later correct one.
 */
export function diagramSelection(args: { include: string[]; exclude?: string[]; afterEvent?: string; diagramId?: string }, description = 'Path diagram marked'): Condition {
  return make(
    `diagramSelection:${args.include.join(',')}${args.exclude ? `!${args.exclude.join(',')}` : ''}${args.afterEvent ? `@${args.afterEvent}` : ''}`,
    description,
    () => {
      const h = hooks();
      if (!h?.evidence) {
        return false;
      }
      const from = args.afterEvent === undefined ? 0 : (h.events?.firedAtS(args.afterEvent) ?? null);
      if (from === null) {
        return false;
      }

      return h.evidence.selections(args.diagramId).some((e) => {
        const picked = e.selection ?? [];

        return e.tS >= from && args.include.every((id) => picked.includes(id)) && !(args.exclude ?? []).some((id) => picked.includes(id));
      });
    },
    args.afterEvent !== undefined
  );
}

/**
 * E6 (phase 40 D10): the SkyLink terminal transmitted less than `maxSeconds` in the window
 * [`fromS`, `toS`] (absolute sim seconds; default the whole run so far). The counter is never shown
 * in the app. With `toS` the condition is false until the window has closed, so it reads as a
 * pass/fail test ("stayed quiet through the sweep"); without `toS` it is true while under budget
 * and false once exceeded, so pair it with `mustMaintain` on the objective for a hold.
 */
export function transmitTimeUnder(
  args: { maxSeconds: number; fromS?: number; toS?: number },
  description = `Terminal transmitted under ${Math.round(args.maxSeconds / 60)} min`
): Condition {
  return make(
    `transmitTimeUnder:${args.maxSeconds}:${args.fromS ?? ''}:${args.toS ?? ''}`,
    description,
    () => {
      const h = hooks();
      if (!h) {
        return false;
      }
      if (args.toS !== undefined && h.plant.getTimeSeconds() < args.toS) {
        return false;
      }

      return h.plant.getTransmitSeconds(args.fromS, args.toS) < args.maxSeconds;
    },
    args.toS !== undefined
  );
}

/** The terminal transmitted at least `minSeconds` in the window (for "kept the link up" tests) */
export function transmitTimeAtLeast(
  args: { minSeconds: number; fromS?: number; toS?: number },
  description = `Terminal transmitted at least ${Math.round(args.minSeconds / 60)} min`
): Condition {
  return make(
    `transmitTimeAtLeast:${args.minSeconds}:${args.fromS ?? ''}:${args.toS ?? ''}`,
    description,
    () => (hooks()?.plant.getTransmitSeconds(args.fromS, args.toS) ?? 0) >= args.minSeconds,
    true
  );
}
