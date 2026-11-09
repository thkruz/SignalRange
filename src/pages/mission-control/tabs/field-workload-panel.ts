import type { ServiceModel } from '@app/physical/service-model';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import type { WorkloadRunner } from '@app/physical/workload-runner';
import type { RequirementCard, WorkloadPriority, WorkloadRun } from '@app/physical/workload-types';
import './field-workload-panel.css';

/**
 * FieldWorkloadPanel - Requirement cards and runs (Phase 38.2, M11)
 *
 * Lists the requirement cards (background transfers in their own group), lets the player pick a
 * service and start a run, shows each run's window progress live, and keeps finished runs with
 * start and end timestamps. A run never shows layer truth: only its own result (status plus the
 * metrics that missed). Shared capacity (S5) shows as each running run's share and a per-card
 * priority control. "Hold" waits out a run's remaining window on the scenario clock (S13).
 */

/** Priority control: label to the share weight it sets */
export const PRIORITY_WEIGHT: Record<WorkloadPriority, number> = { background: 1, routine: 2, mission: 4 };

const PRIORITY_LABEL: Record<WorkloadPriority, string> = { background: 'Background', routine: 'Routine', mission: 'Mission' };

const STATUS_LABEL: Record<WorkloadRun['status'], string> = {
  running: 'Running',
  supported: 'Supported',
  degraded: 'Degraded',
  unsupported: 'Unsupported',
  aborted: 'Aborted',
};

const METRIC_LABEL: Record<string, string> = { downMbps: 'download', upMbps: 'upload', rttMs: 'latency', lossPct: 'loss' };

const INVALID_LABEL: Record<string, string> = {
  config: 'equipment or settings changed',
  event: 'conditions changed',
  'card-version': 'requirement changed',
  reload: 'session reloaded',
};

const HISTORY_SHOWN = 10;

function clock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));

  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Plain-language requirement line for a card */
export function describeCard(card: RequirementCard): string {
  const parts: string[] = [];
  if (card.minDownMbps !== undefined) parts.push(`down at least ${card.minDownMbps} Mbps`);
  if (card.minUpMbps !== undefined) parts.push(`up at least ${card.minUpMbps} Mbps`);
  if (card.maxRttMs !== undefined) parts.push(`latency under ${card.maxRttMs} ms`);
  if (card.maxLossPct !== undefined) parts.push(`loss under ${card.maxLossPct}%`);
  parts.push(`${card.windowS} s window`);

  return parts.join(', ');
}

/** Closest priority option for a share weight */
export function priorityForWeight(weight: number): WorkloadPriority {
  let best: WorkloadPriority = 'routine';
  let gap = Number.POSITIVE_INFINITY;
  for (const p of Object.keys(PRIORITY_WEIGHT) as WorkloadPriority[]) {
    const d = Math.abs(PRIORITY_WEIGHT[p] - weight);
    if (d < gap) {
      gap = d;
      best = p;
    }
  }

  return best;
}

export interface WorkloadRunLine {
  id: string;
  title: string;
  status: WorkloadRun['status'];
  running: boolean;
  /** A transfer already under way that the player cannot hold or stop */
  standing: boolean;
  /** 0 to 1 */
  progress: number;
  remainingS: number;
  shareText: string;
  stamps: string;
  result: string;
}

/** Everything one run row prints */
export function buildRunLine(run: WorkloadRun, runner: WorkloadRunner, serviceLabel: string, nowS: number): WorkloadRunLine {
  const card = runner.getCard(run.cardId);
  const running = run.status === 'running';
  const span = Math.max(1, run.endS - run.startS);
  const progress = running ? Math.min(1, Math.max(0, (nowS - run.startS) / span)) : 1;
  const share = running ? runner.shareOf(run) : 1;
  let result = '';
  if (run.status === 'aborted') {
    result = run.invalidatedBy ? `Stopped: ${INVALID_LABEL[run.invalidatedBy] ?? run.invalidatedBy}.` : 'Stopped by you.';
  } else if (!running) {
    const unmet = run.unmet.map((m) => METRIC_LABEL[m] ?? m);
    result = `${STATUS_LABEL[run.status]}${unmet.length > 0 ? `, fell short on ${unmet.join(', ')}` : ''}.`;
    if (run.invalidatedBy) result += ` No longer counts: ${INVALID_LABEL[run.invalidatedBy] ?? run.invalidatedBy}.`;
  }

  return {
    id: run.id,
    title: `${card?.label ?? run.cardId} on ${serviceLabel}`,
    status: run.status,
    running,
    standing: running && card?.standing === true,
    progress,
    remainingS: running ? Math.max(0, Math.ceil(run.endS - nowS)) : 0,
    shareText: running && share < 0.999 ? `${Math.round(share * 100)}% of capacity` : '',
    stamps: running ? `Started ${clock(run.startS)}${card?.standing ? ', continuing' : ''}` : `Started ${clock(run.startS)}, ended ${clock(run.endS)}`,
    result,
  };
}

export class FieldWorkloadPanel {
  private built_ = false;
  private cardKey_ = '';
  private runKey_ = '';
  private lastMsg_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly getRunner_: () => WorkloadRunner | null,
    private readonly getModel_: () => ServiceModel | null,
    private readonly getNow_: () => number
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
  }

  /** Start a run as if the player pressed Start; returns the run or a reason */
  start(cardId: string, serviceId: string): WorkloadRun | string {
    const runner = this.getRunner_();
    if (!runner) return 'no-runner';
    const res = runner.start(cardId, serviceId);
    if ('run' in res) {
      this.lastMsg_ = `Run started at ${clock(res.run.startS)}.`;
      this.sync();

      return res.run;
    }
    this.lastMsg_ = res.reason === 'already-running' ? 'That task is already running on this service.' : 'Cannot start that run.';
    this.sync();

    return res.reason;
  }

  /** Wait out the rest of a run's window (S13 hold) */
  hold(runId: string): WorkloadRun | undefined {
    const run = this.getRunner_()?.waitForRun(runId);
    if (run) this.lastMsg_ = `Held until ${clock(run.endS)}.`;
    this.sync();

    return run;
  }

  abort(runId: string): boolean {
    const ok = this.getRunner_()?.abort(runId) ?? false;
    if (ok) this.lastMsg_ = 'Run stopped.';
    this.sync();

    return ok;
  }

  setPriority(cardId: string, priority: WorkloadPriority): void {
    this.getRunner_()?.setPriority(cardId, PRIORITY_WEIGHT[priority]);
    this.sync();
  }

  private readonly onClick_ = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-wl-act]');
    if (!btn) return;
    const act = btn.dataset.wlAct;
    if (act === 'start') {
      const row = btn.closest<HTMLElement>('[data-wl-card]');
      const service = row?.querySelector<HTMLSelectElement>('select[data-wl-service]')?.value;
      if (row && service) this.start(row.dataset.wlCard ?? '', service);
    } else if (act === 'hold') {
      this.hold(btn.closest<HTMLElement>('[data-wl-run]')?.dataset.wlRun ?? '');
    } else if (act === 'abort') {
      this.abort(btn.closest<HTMLElement>('[data-wl-run]')?.dataset.wlRun ?? '');
    }
  };

  private readonly onChange_ = (e: Event): void => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-wl-priority]');
    const row = sel?.closest<HTMLElement>('[data-wl-card]');
    if (sel && row) this.setPriority(row.dataset.wlCard ?? '', sel.value as WorkloadPriority);
  };

  sync(): void {
    const runner = this.getRunner_();
    const model = this.getModel_();
    if (!runner || !model || runner.cards().length === 0) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    const cards = runner.cards();
    const services = model.getServiceIds();
    const key = `${services.join(',')}#${cards.map((c) => `${c.id}:${c.version}`).join(',')}`;
    if (!this.built_ || key !== this.cardKey_) {
      this.build_(cards, services, model);
      this.cardKey_ = key;
      this.built_ = true;
      this.runKey_ = '';
    }
    this.patch_(runner, model);
  }

  private cardRow_(c: RequirementCard, services: string[], model: ServiceModel): string {
    const opts = services.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(model.getPath(id)?.label ?? id)}</option>`).join('');
    const prio = (Object.keys(PRIORITY_WEIGHT) as WorkloadPriority[]).map((p) => `<option value="${p}">${PRIORITY_LABEL[p]}</option>`).join('');

    return `<div class="fwp-card" data-wl-card="${escapeHtml(c.id)}">
      <div class="fwp-card-main"><b>${escapeHtml(c.label)}</b> <span class="fwp-req">${escapeHtml(describeCard(c))}</span></div>
      <div class="fwp-card-ctl">
        <select class="form-select form-select-sm" data-wl-service aria-label="${escapeHtml(c.label)} service">${opts}</select>
        <select class="form-select form-select-sm" data-wl-priority aria-label="${escapeHtml(c.label)} priority">${prio}</select>
        <button type="button" class="btn btn-sm btn-outline-primary" data-wl-act="start">Start run</button>
      </div>
    </div>`;
  }

  private build_(cards: RequirementCard[], services: string[], model: ServiceModel): void {
    const main = cards.filter((c) => c.priority !== 'background');
    const bg = cards.filter((c) => c.priority === 'background');
    const group = (title: string, list: RequirementCard[]): string =>
      list.length > 0 ? `<div class="fwp-group-title">${title}</div>${list.map((c) => this.cardRow_(c, services, model)).join('')}` : '';
    this.host_.innerHTML = `
      <details class="fwp" open>
        <summary class="fwp-summary"><b>Workloads</b> <span class="fwp-last" data-fwp="last" aria-live="polite"></span></summary>
        <div class="fwp-body">
          ${group('Tasks', main)}
          ${group('Background transfers', bg)}
          <div class="fwp-group-title">Runs</div>
          <ul class="fwp-runs" data-fwp="runs"></ul>
        </div>
      </details>`;
  }

  private patch_(runner: WorkloadRunner, model: ServiceModel): void {
    const last = this.host_.querySelector<HTMLElement>('[data-fwp="last"]');
    if (last && last.textContent !== this.lastMsg_) last.textContent = this.lastMsg_;
    for (const row of this.host_.querySelectorAll<HTMLElement>('[data-wl-card]')) {
      const sel = row.querySelector<HTMLSelectElement>('select[data-wl-priority]');
      const want = priorityForWeight(runner.getPriority(row.dataset.wlCard ?? ''));
      if (sel && sel.value !== want && document.activeElement !== sel) sel.value = want;
    }
    const now = this.getNow_();
    const runs = runner.getRuns().slice(-HISTORY_SHOWN).reverse();
    const lines = runs.map((r) => buildRunLine(r, runner, model.getPath(r.serviceId)?.label ?? r.serviceId, now));
    const key = lines.map((l) => `${l.id}:${l.status}:${l.result}:${l.stamps}`).join('|');
    const list = this.host_.querySelector<HTMLElement>('[data-fwp="runs"]');
    if (!list) return;
    if (key !== this.runKey_) {
      this.runKey_ = key;
      list.innerHTML =
        lines.length === 0
          ? '<li class="fwp-none">No runs yet.</li>'
          : lines
              .map(
                (l) => `<li class="fwp-run fwp-${l.status}" data-wl-run="${escapeHtml(l.id)}">
          <div><b>${escapeHtml(l.title)}</b> <span class="fwp-badge fwp-b-${l.status}">${STATUS_LABEL[l.status]}</span></div>
          <progress max="100" value="${Math.round(l.progress * 100)}" data-fwp="bar-${escapeHtml(l.id)}"></progress>
          <div class="fwp-meta"><span data-fwp="rem-${escapeHtml(l.id)}"></span> <span data-fwp="share-${escapeHtml(l.id)}"></span> ${escapeHtml(l.stamps)}</div>
          ${l.result ? `<div class="fwp-result">${escapeHtml(l.result)}</div>` : ''}
          ${l.running && !l.standing ? '<div class="fwp-actions"><button type="button" class="btn btn-sm btn-outline-secondary" data-wl-act="hold">Hold for result</button> <button type="button" class="btn btn-sm btn-outline-danger" data-wl-act="abort">Stop</button></div>' : ''}
        </li>`
              )
              .join('');
    }
    for (const l of lines) {
      if (!l.running) continue;
      const bar = list.querySelector<HTMLProgressElement>(`[data-fwp="bar-${l.id}"]`);
      if (bar) bar.value = Math.round(l.progress * 100);
      const rem = list.querySelector<HTMLElement>(`[data-fwp="rem-${l.id}"]`);
      if (rem) rem.textContent = l.standing ? 'In progress' : `${l.remainingS} s left`;
      const share = list.querySelector<HTMLElement>(`[data-fwp="share-${l.id}"]`);
      if (share) share.textContent = l.shareText;
    }
  }
}
