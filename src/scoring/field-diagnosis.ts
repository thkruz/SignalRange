/**
 * M18 field diagnosis for the completion debrief. Built only when the scenario has a plant
 * evidence log (Campaign 6); every other campaign gets null, so its score and debrief are
 * unchanged. The score effect is capped (Ted, 2026-11-09) and explained line by line.
 */

import { DependencyGraph } from '@app/physical/dependency-graph';
import { type DiagnosticSummary, diagnosticPercentEffect, type PercentScoreEffect, scoreDiagnosis } from '@app/physical/diagnostic-scorer';
import type { FieldHooks } from '@app/physical/field-hooks';
import type { PlantConfig } from '@app/physical/physical-plant-types';

export interface FieldDiagnosis {
  summary: DiagnosticSummary;
  effect: PercentScoreEffect;
  /** Plain-language lines for the "Field diagnosis" debrief section, in display order */
  lines: string[];
  /** Why the numbers above move the score, shown under the section */
  scoreNotes: string[];
  /** True when nothing was diagnosed (no fault, no hypothesis step, nothing to credit or penalise): the debrief leaves the section out */
  quiet?: boolean;
}

/** The instructor's camp rule, as worded in the S1 brief, the site strip tooltip and the debrief */
export const TRIP_RULE_TEXT =
  "The instructor's camp rule: you may go outside to the equipment three times, and a fourth trip gets you spotted. It is a training rule, not part of the service. At a forward post it does not apply.";

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);

  return `${m} min ${String(s).padStart(2, '0')} s`;
}

function timeToCauseLine(summary: DiagnosticSummary, hasFault: boolean): string {
  if (!hasFault) return 'Time to cause: nothing to find. This shift had no fault.';

  return summary.timeToCauseS === null ? 'Time to cause: the cause was not established with evidence.' : `Time to cause: ${minutes(summary.timeToCauseS)} from the start.`;
}

/** True when the scenario can put something wrong in front of the player (a fault, an injected fault or an armed link impairment) */
export function plantHasFault(config: PlantConfig): boolean {
  if ((config.faults ?? []).length > 0) return true;

  return (config.events ?? []).some((e) => e.actions.some((a) => a.kind === 'inject-fault' || (a.kind === 'link-impairment' && a.active)));
}

/** Pure: build the section text from a summary and the base points */
export function describeFieldDiagnosis(
  summary: DiagnosticSummary,
  basePoints: number,
  wrongCauseNotes: readonly string[] = [],
  hasFault = true,
  /** False when the scenario has no hypothesis step: the time-to-cause line would then report a step the player was never asked to do */
  hasHypothesisStep = true
): FieldDiagnosis {
  const effect = diagnosticPercentEffect(summary, basePoints);
  const lines: string[] = [
    ...(hasHypothesisStep ? [timeToCauseLine(summary, hasFault)] : []),
    `Relevant tests: ${summary.relevantTests} on the affected path, ${summary.irrelevantTests} that did not bear on the symptom.`,
    `Credited negative tests: ${summary.usefulNegatives} (a clean result that ruled a suspect out).`,
    `Lucky swaps: ${summary.unsupportedSpares} (a spare fixed it, but no earlier test pointed there).`,
    `Fixes with earlier evidence: ${summary.supportedFixes}. Fixes without it: ${summary.unsupportedFixes}.`,
    `Trips outside: ${summary.trips}.`,
  ];
  if (summary.wrongCauseActions > 0) {
    lines.push(`Actions aimed at the wrong cause: ${summary.wrongCauseActions}${wrongCauseNotes.length > 0 ? ` (${wrongCauseNotes.join('; ')})` : ''}.`);
  }
  const scoreNotes: string[] = [];
  if (summary.usefulNegatives > 0) {
    scoreNotes.push(`Bonus +${effect.bonus} points: ${effect.bonusPct}% of objective points (2% per credited negative test, capped at 10%).`);
  }
  if (summary.unsupportedFixes > 0) {
    scoreNotes.push(`Penalty -${effect.penalty} points: ${effect.penaltyPct}% of objective points (5% per fix without earlier evidence, capped at 20%).`);
  }
  if (summary.wrongCauseActions > 0) {
    scoreNotes.push(`Wrong-cause actions count toward the same penalty: 5% of objective points each, within the 20% cap.`);
  }
  if (scoreNotes.length === 0) {
    scoreNotes.push(
      basePoints === 0
        ? 'This scenario is practice: its objectives carry no points, so the score stays at 0. These lines are for your own review.'
        : 'Your diagnosis did not change the score.'
    );
  }
  scoreNotes.push(TRIP_RULE_TEXT);

  return { summary, effect, lines, scoreNotes };
}

/** Everything the scorer needs, as hooks hand it over */
export interface DiagnosisSource {
  field: Pick<FieldHooks, 'evidence' | 'plant'> | null;
  /** Read lazily, only after an evidence log is known to exist */
  config: () => PlantConfig | null;
}

/** Null unless the scenario has a plant evidence log: C1-C5 never get a diagnosis */
export function buildFieldDiagnosis(source: DiagnosisSource, basePoints: number): FieldDiagnosis | null {
  const { field } = source;
  if (!field?.evidence) return null;
  const config = source.config();
  if (!config) return null;
  const rules = config.wrongCauseActions ?? [];
  const summary = scoreDiagnosis(field.evidence, field.plant, new DependencyGraph(config), rules);
  const notes = [...new Set(summary.wrongCauseRuleIds.map((id) => rules.find((r) => r.id === id)?.note).filter((n): n is string => n !== undefined))];

  const hasHypothesisStep = (config.hypothesisSpecs?.length ?? 0) > 0 || rules.length > 0 || field.evidence.entries().some((e) => e.kind === 'hypothesis');

  const hasFault = plantHasFault(config);
  const diagnosis = describeFieldDiagnosis(summary, basePoints, notes, hasFault, hasHypothesisStep);
  const nothingDiagnosed =
    !hasFault && !hasHypothesisStep && summary.wrongCauseActions === 0 && summary.unsupportedFixes === 0 && summary.usefulNegatives === 0 && summary.unsupportedSpares === 0;

  return nothingDiagnosed ? { ...diagnosis, quiet: true } : diagnosis;
}
