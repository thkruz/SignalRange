/**
 * Report forms: a small fill-in form a custom objective condition can ask the
 * player to file (an interference report, a beacon identification). The spec
 * carries its own check, so the objective only asks "was it filed and accepted".
 *
 * Leaf module: no manager imports, so scenario data may register forms without
 * a cycle. The dialog lives in report-form-dialog.ts.
 */

export interface ReportFieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

export interface ReportFormResult {
  ok: boolean;
  message: string;
}

export interface ReportFormSpec {
  id: string;
  title: string;
  intro?: string;
  fields: readonly ReportFieldSpec[];
  submitLabel?: string;
  /** Check the filled values. A passing result marks the report filed. */
  submit(values: Record<string, string>): ReportFormResult;
  /** Optional lookup box under the fields (for example, beacon plan). */
  lookup?: { label: string; placeholder: string; run(input: string): string };
}

const forms_ = new Map<string, ReportFormSpec>();
const filed_ = new Map<string, unknown>();

export function registerReportForm(spec: ReportFormSpec): void {
  forms_.set(spec.id, spec);
}

export function getReportForm(id: string): ReportFormSpec | undefined {
  return forms_.get(id);
}

/** Record an accepted report. `run` identifies the scenario run (any object that is new per load). */
export function markReportFiled(id: string, run: unknown): void {
  filed_.set(id, run);
}

export function isReportFiled(id: string, run: unknown): boolean {
  return run !== undefined && filed_.get(id) === run;
}
