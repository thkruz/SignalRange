/**
 * M05 diagnostic scorer. Judges an EvidenceLog against the dependency graph. Order-independent:
 * any relevant sequence that reaches a supported fix passes. The score effect is capped
 * (Ted, 2026-11-09): a small bonus for useful negative tests, a small penalty for unsupported swaps.
 */

import type { DependencyGraph } from '@app/physical/dependency-graph';
import { type EvidenceEntry, type EvidenceLog, TEST_VERBS } from '@app/physical/evidence-log';
import type { AppWrongCauseRule } from '@app/physical/physical-plant-types';

export interface TestAssessment {
  entryId: string;
  relevant: boolean;
  outcome: 'positive' | 'negative';
  eliminated: string[];
}

export interface DiagnosticSummary {
  relevantTests: number;
  usefulNegatives: number;
  irrelevantTests: number;
  supportedFixes: number;
  unsupportedFixes: number;
  /** Effective swaps without support: "lucky swaps" */
  unsupportedSpares: number;
  /** Terminal app (or plant) actions that matched a scenario `wrongCauseActions` rule (phase 40 D7) */
  wrongCauseActions: number;
  /** Rule ids that matched, one per matching entry, in log order */
  wrongCauseRuleIds: string[];
  firstCorrectActionS: number | null;
  timeToCauseS: number | null;
  trips: number;
  spotted: boolean;
}

/** Plant side of the summary */
export interface DiagnosticPlant {
  getReport(): { firstCorrectActionS: number | null; trips: number; spotted: boolean };
}

function isTest(e: EvidenceEntry): boolean {
  return e.kind === 'observation' && e.verb !== undefined && TEST_VERBS.has(e.verb);
}

/**
 * Walk the log in order. The candidate set is the paths of the services showing a symptom when the
 * test was made, minus targets already ruled out. A relevant test with no finding rules its target
 * out (and earns credit once); testing a ruled-out or off-path target is irrelevant.
 * An effective fix resets the ruled-out set, because the world changed.
 */
export function assessTests(log: EvidenceLog, deps: DependencyGraph): TestAssessment[] {
  const out: TestAssessment[] = [];
  let eliminated = new Set<string>();
  for (const e of log.entries()) {
    if (e.kind === 'action' && e.effective === true) {
      eliminated = new Set();
      continue;
    }
    if (!isTest(e)) {
      continue;
    }
    const candidates = deps.candidates(e.symptoms ?? []);
    for (const id of eliminated) candidates.delete(id);
    const relevant = candidates.has(e.subject);
    const positive = e.positive === true;
    const removed: string[] = [];
    if (relevant && !positive) {
      eliminated.add(e.subject);
      removed.push(e.subject);
    }
    out.push({ entryId: e.id, relevant, outcome: positive ? 'positive' : 'negative', eliminated: removed });
  }

  return out;
}

/** Index of the earlier entry that supports a fix on this target, or -1 */
function supportIndex(entries: readonly EvidenceEntry[], upTo: number, fix: EvidenceEntry): number {
  const targets = new Set([fix.subject, ...(fix.clearedTargets ?? [])]);
  for (let i = 0; i < upTo; i++) {
    const e = entries[i];
    if (!isTest(e) || e.positive !== true) {
      continue;
    }
    for (const t of targets) {
      if (e.facts.some((f) => f.startsWith(`${t}|`)) || (e.revealedTargets ?? []).includes(t)) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Actions that match a wrong-cause rule: an action entry whose verb is in the rule's verbs while one of
 * the rule's fault kinds was injected (stamped on the entry as `faultKinds`). Each entry counts once,
 * under the first rule that matches it. Ineffective-or-not does not matter: the action was aimed at
 * the wrong cause.
 */
export function matchWrongCauseActions(log: EvidenceLog, rules: readonly AppWrongCauseRule[] = []): Array<{ entryId: string; ruleId: string }> {
  const out: Array<{ entryId: string; ruleId: string }> = [];
  if (rules.length === 0) {
    return out;
  }
  for (const e of log.entries('action')) {
    if (e.verb === undefined) {
      continue;
    }
    const kinds = e.faultKinds ?? [];
    const rule = rules.find((r) => r.verbs.includes(e.verb as string) && r.faultKinds.some((k) => kinds.includes(k)));
    if (rule) {
      out.push({ entryId: e.id, ruleId: rule.id });
    }
  }

  return out;
}

export function scoreDiagnosis(log: EvidenceLog, plant: DiagnosticPlant, deps: DependencyGraph, wrongCauseRules: readonly AppWrongCauseRule[] = []): DiagnosticSummary {
  const assessments = assessTests(log, deps);
  const entries = log.entries();
  let supportedFixes = 0;
  let unsupportedFixes = 0;
  let unsupportedSpares = 0;
  let timeToCauseS: number | null = null;
  entries.forEach((e, i) => {
    if (e.kind !== 'action' || e.effective !== true) {
      return;
    }
    const at = supportIndex(entries, i, e);
    if (at >= 0) {
      supportedFixes += 1;
      timeToCauseS ??= entries[at].tS - log.getStartS();
    } else {
      unsupportedFixes += 1;
      if (e.verb === 'swap') unsupportedSpares += 1;
    }
  });
  const report = plant.getReport();
  const wrong = matchWrongCauseActions(log, wrongCauseRules);

  return {
    relevantTests: assessments.filter((a) => a.relevant).length,
    usefulNegatives: assessments.filter((a) => a.relevant && a.outcome === 'negative').length,
    irrelevantTests: assessments.filter((a) => !a.relevant).length,
    supportedFixes,
    unsupportedFixes,
    unsupportedSpares,
    wrongCauseActions: wrong.length,
    wrongCauseRuleIds: wrong.map((w) => w.ruleId),
    firstCorrectActionS: report.firstCorrectActionS,
    timeToCauseS,
    trips: report.trips,
    spotted: report.spotted,
  };
}

export interface ScoreEffectCaps {
  bonusPerNegative: number;
  bonusCap: number;
  penaltyPerUnsupported: number;
  penaltyCap: number;
}

/** Points are on the debrief scale M18 chooses; defaults keep the effect small */
export const DEFAULT_SCORE_CAPS: Readonly<ScoreEffectCaps> = Object.freeze({
  bonusPerNegative: 1,
  bonusCap: 3,
  penaltyPerUnsupported: 2,
  penaltyCap: 4,
});

export interface DiagnosticScoreEffect {
  bonus: number;
  penalty: number;
  net: number;
  /** One line per effect for the debrief (M18) */
  notes: string[];
}

export function diagnosticScoreEffect(summary: DiagnosticSummary, caps: ScoreEffectCaps = DEFAULT_SCORE_CAPS): DiagnosticScoreEffect {
  const bonus = Math.min(caps.bonusCap, summary.usefulNegatives * caps.bonusPerNegative);
  const penalty = Math.min(caps.penaltyCap, summary.unsupportedFixes * caps.penaltyPerUnsupported);
  const notes: string[] = [];
  if (summary.usefulNegatives > 0) {
    notes.push(`${summary.usefulNegatives} test(s) on the path ruled a suspect out (bonus ${bonus}, capped at ${caps.bonusCap}).`);
  }
  if (summary.unsupportedFixes > 0) {
    notes.push(`${summary.unsupportedFixes} fix(es) worked without earlier evidence (penalty ${penalty}, capped at ${caps.penaltyCap}).`);
  }

  return { bonus, penalty, net: bonus - penalty, notes };
}

/** Percent-of-base-points caps used by the debrief (Ted, 2026-11-09): small, capped, frontline only */
export interface PercentEffectCaps {
  bonusPctPerNegative: number;
  bonusPctCap: number;
  penaltyPctPerUnsupported: number;
  penaltyPctCap: number;
  /** Percent per wrong-cause app action (default 5); shares the penalty cap */
  penaltyPctPerWrongCause?: number;
}

export const DEFAULT_PERCENT_CAPS: Readonly<PercentEffectCaps> = Object.freeze({
  bonusPctPerNegative: 2,
  bonusPctCap: 10,
  penaltyPctPerUnsupported: 5,
  penaltyPctCap: 20,
  penaltyPctPerWrongCause: 5,
});

export interface PercentScoreEffect {
  bonusPct: number;
  penaltyPct: number;
  /** Whole points added to the score */
  bonus: number;
  /** Whole points removed from the score */
  penalty: number;
}

/** Convert a diagnostic summary to whole points as a capped percentage of the objectives' base points */
export function diagnosticPercentEffect(summary: DiagnosticSummary, basePoints: number, caps: PercentEffectCaps = DEFAULT_PERCENT_CAPS): PercentScoreEffect {
  const bonusPct = Math.min(caps.bonusPctCap, Math.max(0, summary.usefulNegatives) * caps.bonusPctPerNegative);
  const penaltyPct = Math.min(
    caps.penaltyPctCap,
    Math.max(0, summary.unsupportedFixes) * caps.penaltyPctPerUnsupported + Math.max(0, summary.wrongCauseActions ?? 0) * (caps.penaltyPctPerWrongCause ?? 5)
  );
  const base = Math.max(0, basePoints);

  return { bonusPct, penaltyPct, bonus: Math.floor((base * bonusPct) / 100), penalty: Math.floor((base * penaltyPct) / 100) };
}
