/**
 * @file evidence-predicates - typed, serializable evidence matching (Campaign 6 gap package A)
 * @description A predicate describes what one notebook entry must show: the service, layer,
 * metric, endpoint, observed value, a position relative to a staged event, or the first effective
 * repair. A group asks for `min` distinct entries matching one predicate. A claim passes only when
 * every group is filled by a different entry, so repeating one entry or citing arbitrary
 * observations cannot satisfy it. Entries recorded before samples carried typed metadata have no
 * `sample` snapshot and can never satisfy a sample predicate. Pure: no scenario or DOM imports; the
 * event clock is injected.
 */

import type { EvidenceEntry, EvidenceKind } from './evidence-log';

export interface EvidencePredicate {
  kind?: EvidenceKind;
  /** The entry is a service sample of this service */
  serviceId?: string;
  layer?: string;
  metric?: string;
  endpointId?: string;
  /** The sampled value is one of these */
  valueIn?: Array<string | number>;
  /** The sample's recorded cause is one of these (a sample with no recorded cause, from an older save, passes) */
  causeIn?: string[];
  /** Entry subject (part, connector, service or event id) is one of these */
  subjectIn?: string[];
  /** The entry is the stamp of this staged event */
  eventId?: string;
  /** Plant verb is one of these */
  verbIn?: string[];
  /** A test entry that found nothing (positive === false) */
  negative?: boolean;
  /** A fix that changed something (effective === true) */
  effective?: boolean;
  /** Entry time is at or after / strictly before this staged event fired */
  afterEvent?: string;
  beforeEvent?: string;
  /** Entry time is at or after the first effective repair action (post-repair verification) */
  afterFirstFix?: boolean;
  /** Entry time is before the first effective repair action */
  beforeFirstFix?: boolean;
}

export interface EvidenceGroup {
  id: string;
  /** Player-safe description of what this group needs */
  label: string;
  /** Distinct entries required (default 1) */
  min?: number;
  match: EvidencePredicate;
  /** Other entries that fill the group equally well (a valid alternate diagnostic route) */
  orMatch?: EvidencePredicate[];
}

const groupMatches = (e: EvidenceEntry, g: EvidenceGroup, ctx: EvidenceContext, all: readonly EvidenceEntry[]): boolean =>
  entryMatches(e, g.match, ctx, all) || (g.orMatch ?? []).some((p) => entryMatches(e, p, ctx, all));

export interface EvidenceContext {
  /** Scenario time an event fired, or null when it has not */
  eventFiredAtS: (eventId: string) => number | null;
}

export interface EvidenceVerdict {
  ok: boolean;
  /** Labels of the groups that could not be filled */
  missing: string[];
  /** Entry ids assigned to each group when ok */
  assigned: Record<string, string[]>;
}

function firstFixS(entries: readonly EvidenceEntry[]): number | null {
  const fix = entries.find((e) => e.kind === 'action' && e.effective === true);

  return fix ? fix.tS : null;
}

export function entryMatches(e: EvidenceEntry, p: EvidencePredicate, ctx: EvidenceContext, all: readonly EvidenceEntry[]): boolean {
  if (p.kind !== undefined && e.kind !== p.kind) return false;
  const needsSample =
    p.serviceId !== undefined || p.layer !== undefined || p.metric !== undefined || p.endpointId !== undefined || p.valueIn !== undefined || p.causeIn !== undefined;
  if (needsSample) {
    const s = e.sample;
    if (!s) return false;
    if (p.serviceId !== undefined && s.serviceId !== p.serviceId) return false;
    if (p.layer !== undefined && s.layer !== p.layer) return false;
    if (p.metric !== undefined && s.metric !== p.metric) return false;
    if (p.endpointId !== undefined && s.endpointId !== p.endpointId) return false;
    if (p.valueIn !== undefined && !p.valueIn.includes(s.value)) return false;
    if (p.causeIn !== undefined && s.cause !== undefined && !p.causeIn.includes(s.cause)) return false;
  }
  if (p.subjectIn !== undefined && !p.subjectIn.includes(e.subject)) return false;
  if (p.eventId !== undefined && e.source.eventId !== p.eventId) return false;
  if (p.verbIn !== undefined && (e.verb === undefined || !p.verbIn.includes(e.verb))) return false;
  if (p.negative === true && e.positive !== false) return false;
  if (p.effective === true && e.effective !== true) return false;
  if (p.afterEvent !== undefined) {
    const at = ctx.eventFiredAtS(p.afterEvent);
    if (at === null || e.tS < at) return false;
  }
  if (p.beforeEvent !== undefined) {
    const at = ctx.eventFiredAtS(p.beforeEvent);
    if (at === null || e.tS >= at) return false;
  }
  if (p.afterFirstFix === true || p.beforeFirstFix === true) {
    const fix = firstFixS(all);
    if (p.afterFirstFix === true && (fix === null || e.tS < fix)) return false;
    if (p.beforeFirstFix === true && fix !== null && e.tS >= fix) return false;
  }

  return true;
}

/**
 * Fill every group with distinct entries from the cited ids. Cited ids that are repeated or unknown
 * are ignored. Backtracking assignment, so the verdict does not depend on citation order.
 */
export function assessEvidence(citedIds: readonly string[], groups: readonly EvidenceGroup[], all: readonly EvidenceEntry[], ctx: EvidenceContext): EvidenceVerdict {
  const byId = new Map(all.map((e) => [e.id, e] as const));
  const cited = [...new Set(citedIds)].map((id) => byId.get(id)).filter((e): e is EvidenceEntry => e !== undefined);
  const slots: Array<{ group: EvidenceGroup; options: number[] }> = [];
  for (const g of groups) {
    const options = cited.map((e, i) => (groupMatches(e, g, ctx, all) ? i : -1)).filter((i) => i >= 0);
    for (let n = 0; n < (g.min ?? 1); n++) slots.push({ group: g, options });
  }
  const used = new Set<number>();
  const chosen: number[] = [];
  const solve = (i: number): boolean => {
    if (i === slots.length) return true;
    for (const o of slots[i].options) {
      if (used.has(o)) continue;
      used.add(o);
      chosen[i] = o;
      if (solve(i + 1)) return true;
      used.delete(o);
    }

    return false;
  };
  if (solve(0)) {
    const assigned: Record<string, string[]> = {};
    slots.forEach((s, i) => {
      (assigned[s.group.id] ??= []).push(cited[chosen[i]].id);
    });

    return { ok: true, missing: [], assigned };
  }
  // Report each group that cannot be filled on its own, or, failing that, the groups competing for the same entries
  const missing = groups.filter((g) => cited.filter((e) => groupMatches(e, g, ctx, all)).length < (g.min ?? 1)).map((g) => g.label);

  return { ok: false, missing: missing.length > 0 ? missing : groups.map((g) => g.label), assigned: {} };
}

/** What a filed hypothesis must satisfy beyond naming an allowed cause */
export interface HypothesisSpec {
  causes: string[];
  /** Allowed claim scopes (absent: any) */
  scopes?: string[];
  /** Allowed claim targets (absent: any) */
  targets?: string[];
  /** Distinct cited entries needed (default 1), at least one an observation */
  minCited?: number;
  /**
   * Alternative evidence routes; the hypothesis passes when its citations satisfy any one. A route is a
   * list of groups. A recovery route for an operator who repaired first uses `afterFirstFix` groups.
   */
  routes?: EvidenceGroup[][];
  /** Routes that apply to one cause instead of `routes` (each cause can need different backing) */
  routesByCause?: Record<string, EvidenceGroup[][]>;
}

export interface HypothesisVerdict {
  ok: boolean;
  /** Plain-language reason when not ok */
  reason?: string;
}

export function assessHypothesis(
  h: { claim: { scope: string; targetId: string; cause?: string }; citedEntryIds: readonly string[] },
  spec: HypothesisSpec,
  all: readonly EvidenceEntry[],
  ctx: EvidenceContext
): HypothesisVerdict {
  const { claim } = h;
  if (claim.cause === undefined || !spec.causes.includes(claim.cause)) {
    return { ok: false, reason: 'The cause named is not one this evidence can support.' };
  }
  if (spec.scopes && !spec.scopes.includes(claim.scope)) {
    return { ok: false, reason: `The cause is filed against the wrong kind of thing (${claim.scope}).` };
  }
  if (spec.targets && !spec.targets.includes(claim.targetId)) {
    return { ok: false, reason: 'The cause is filed against the wrong target.' };
  }
  const byId = new Map(all.map((e) => [e.id, e] as const));
  const cited = [...new Set(h.citedEntryIds)].map((id) => byId.get(id)).filter((e): e is EvidenceEntry => e !== undefined);
  if (cited.length < (spec.minCited ?? 1) || !cited.some((e) => e.kind === 'observation')) {
    return { ok: false, reason: 'Too few distinct notebook observations back this cause.' };
  }
  const routes = spec.routesByCause?.[claim.cause] ?? spec.routes;
  if (routes && routes.length > 0) {
    const verdicts = routes.map((groups) => assessEvidence(h.citedEntryIds, groups, all, ctx));
    if (!verdicts.some((v) => v.ok)) {
      return { ok: false, reason: `The cited entries do not show: ${verdicts[0].missing.join('; ')}.` };
    }
  }

  return { ok: true };
}

/**
 * What to tell the player about a saved hypothesis. Only specs that name the hypothesis's cause apply; when none
 * does, a cause the scenario knows nothing of is reported as unsupported. Returns null when it holds up (or no
 * cause was chosen, or the scenario authored no specs).
 */
export function hypothesisFeedback(
  h: { claim: { scope: string; targetId: string; cause?: string }; citedEntryIds: readonly string[] },
  specs: readonly HypothesisSpec[],
  all: readonly EvidenceEntry[],
  ctx: EvidenceContext
): string | null {
  if (specs.length === 0 || !h.claim.cause || h.claim.cause === 'other') {
    return null;
  }
  const verdicts = specs.map((spec) => assessHypothesis(h, spec, all, ctx));
  if (verdicts.some((v) => v.ok)) {
    return null;
  }
  const named = specs.findIndex((spec) => spec.causes.includes(h.claim.cause as string));

  return (named >= 0 ? verdicts[named] : verdicts[0]).reason ?? null;
}
