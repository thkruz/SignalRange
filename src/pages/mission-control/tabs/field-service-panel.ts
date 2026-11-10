import { type FormStepState, SAMPLE_STEP_LATER_NOTE } from '@app/pages/mission-control/tabs/form-step-state';
import { capacityNote, LAYER_LABEL, METRIC_LABEL, PROVENANCE_LABEL } from '@app/physical/reading-labels';
import { NUMERIC_READABLE, READABLE, type ServiceModel } from '@app/physical/service-model';
import { type Freshness, type LayerStatus, type SampleMetric, type SampleProvenance, SERVICE_LAYERS, type ServiceLayer, type ServiceSample } from '@app/physical/service-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-service-panel.css';

/**
 * FieldServicePanel - What the player has checked about each service (Phase 38.2, M09)
 *
 * Per service, per layer: pick how to look (a device light, a local probe, the terminal app, the
 * provider portal, a pilot report, an endpoint report, a workload run) and press Check. Each press
 * takes a sample stamped with scenario time. The panel never shows the layer truth: it shows the
 * latest sample with its value, units, provenance, age and a current / stale / invalidated badge,
 * plus the symptom history (status changes the player could have seen). A provenance that cannot
 * see a layer is not offered for it, so a green light cannot stand in for end-to-end service.
 */

export { LAYER_LABEL, PROVENANCE_LABEL };

const FRESHNESS_LABEL: Record<Freshness, string> = {
  current: 'Current',
  stale: 'Stale',
  invalidated: 'Invalidated',
  unavailable: 'Cannot see this',
};

const STATUS_LABEL: Record<LayerStatus, string> = { up: 'Up', degraded: 'Degraded', down: 'Down', unknown: 'Unknown' };

/** Order a provenance menu the way a player escalates: lights first, workload last */
/** Scenario seconds a check by each provenance takes (the reading is stamped before the time is spent) */
export const CHECK_COST_S: Record<SampleProvenance, number> = {
  'device-indicator': 5,
  'local-probe': 10,
  'terminal-app': 10,
  'provider-portal': 15,
  'pilot-report': 20,
  'endpoint-report': 15,
  'workload-run': 0,
};

const PROVENANCE_ORDER: SampleProvenance[] = ['device-indicator', 'local-probe', 'terminal-app', 'provider-portal', 'pilot-report', 'endpoint-report', 'workload-run'];
const HISTORY_SHOWN = 12;

/** Provenances that can observe a layer (the application layer takes end-to-end ones only) */
export function provenancesFor(layer: ServiceLayer): SampleProvenance[] {
  return PROVENANCE_ORDER.filter((p) => READABLE[p].includes(layer));
}

/** True when a provenance can return numbers on a layer */
export function isNumericCheck(via: SampleProvenance, layer: ServiceLayer): boolean {
  return NUMERIC_READABLE[via] === layer;
}

export interface ServicePanelRow {
  layer: ServiceLayer;
  endpointId?: string;
  /** Row key for the DOM */
  key: string;
  sample: ServiceSample | null;
  freshness: Freshness | null;
  /** Why an Invalidated reading no longer counts ("link interruption at 10:13:36") */
  invalidatedWhy?: string;
  value: string;
  provenance: string;
  age: string;
}

export interface ServicePanelHistoryLine {
  tS: number;
  text: string;
}

export interface ServicePanelService {
  id: string;
  label: string;
  rows: ServicePanelRow[];
  history: ServicePanelHistoryLine[];
  /** Measured recovery intervals (package E): boundaries as scenario clock times, and the spans once known */
  intervals: string[];
}

/** One recovery interval as the panel prints it: the boundaries the model recorded, never a derived guess */
export function describeInterval(model: ServiceModel, rec: { id: string; startS: number; activationS: number | null; registeredS: number | null; usableS: number | null }): string {
  const at = (v: number | null) => (v === null ? 'not yet' : formatClock(v));
  const span = (k: 'restoration' | 'response' | 'startup') => {
    const v = model.intervalSpanS(rec.id, k);

    return v === null ? 'open' : `${Math.round(v * 10) / 10} s`;
  };

  return `Outage started ${at(rec.startS)}. Operator activated ${at(rec.activationS)} (${span('response')} after the start). Terminal registered ${at(rec.registeredS)} (${span('startup')} after activation). Service usable ${at(rec.usableS)}. Time to restore service: ${span('restoration')}.`;
}

/** Badge text: a Current reading also says when it gets old (a change on site can still end it sooner) */
export function badgeText(r: Pick<ServicePanelRow, 'freshness' | 'sample' | 'invalidatedWhy'>): string {
  if (!r.freshness) return '';
  if (r.freshness === 'current' && r.sample) return `${FRESHNESS_LABEL.current}, fresh until ${formatClock(r.sample.tS + r.sample.maxAgeS)}`;

  if (r.freshness === 'invalidated' && r.invalidatedWhy) return `${FRESHNESS_LABEL.invalidated}: ${r.invalidatedWhy}`;

  return FRESHNESS_LABEL[r.freshness];
}

export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 90) {
    return `${s} s ago`;
  }

  return `${Math.round(s / 60)} min ago`;
}

function formatClock(tS: number): string {
  const s = Math.max(0, Math.floor(tS));
  const mm = Math.floor(s / 60);

  return `elapsed ${String(mm).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatSampleValue(sample: ServiceSample): string {
  if (sample.value === 'unknown') {
    return 'No reading';
  }
  if (typeof sample.value === 'number') {
    const n = Math.round(sample.value * 10) / 10;
    if (sample.metric === 'jitterMs') {
      return `Jitter ${n} ms (mean change between 1 s delay readings, last ${sample.windowS ?? 60} s)`;
    }

    return `${METRIC_LABEL[sample.metric]}${capacityNote(sample)} ${n} ${sample.unit}`;
  }
  if (sample.value === 'down' && sample.metric !== 'status') {
    return `${METRIC_LABEL[sample.metric]}: no link`;
  }

  return STATUS_LABEL[sample.value];
}

/** Rows for one service: each layer once, the application layer once more per endpoint */
function rowSpecs(model: ServiceModel, serviceId: string): Array<{ layer: ServiceLayer; endpointId?: string }> {
  const out: Array<{ layer: ServiceLayer; endpointId?: string }> = [];
  const endpoints = model.getPath(serviceId)?.endpointIds ?? [];
  for (const layer of SERVICE_LAYERS) {
    out.push({ layer });
    if (layer === 'application') {
      for (const endpointId of endpoints) out.push({ layer, endpointId });
    }
  }

  return out;
}

/** An endpoint report of the application layer, with no workload run yet to back it */
function untestedApplication(model: ServiceModel, serviceId: string, sample: ServiceSample): boolean {
  return (
    sample.layer === 'application' &&
    sample.metric === 'status' &&
    sample.provenance === 'endpoint-report' &&
    sample.value === 'up' &&
    !model.samplesFor(serviceId).some((s) => s.provenance === 'workload-run')
  );
}

/** Derive everything the panel prints from the service model (no DOM, no layer truth) */
export function buildServicePanelModel(model: ServiceModel, nowS: number): ServicePanelService[] {
  return model.getServiceIds().map((id) => {
    const path = model.getPath(id);
    const rows = rowSpecs(model, id).map(({ layer, endpointId }): ServicePanelRow => {
      const sample = model.latest(id, layer, endpointId);
      const row: ServicePanelRow = {
        layer,
        endpointId,
        key: `${id}|${layer}|${endpointId ?? ''}`,
        sample,
        freshness: sample ? model.freshness(sample) : null,
        value: sample
          ? untestedApplication(model, id, sample)
            ? 'Not yet tested (the endpoint only reports for itself; run a workload)'
            : formatSampleValue(sample)
          : 'Not checked',
        provenance: sample ? PROVENANCE_LABEL[sample.provenance] : '',
        age: sample ? formatAge(nowS - sample.tS) : '',
      };
      const why = sample && row.freshness === 'invalidated' ? model.invalidation(sample) : null;
      if (why) row.invalidatedWhy = why.kind === 'event' ? `${why.label} at ${formatClock(why.atS)}` : `equipment or settings changed at ${formatClock(why.atS)}`;

      return row;
    });
    // Symptom history: transitions on layers the player has looked at, or whose change shows outside the layer
    const history = model
      .history(id)
      .slice(-HISTORY_SHOWN)
      .reverse()
      .map((h) => ({ tS: h.tS, text: `${formatClock(h.tS)} ${LAYER_LABEL[h.layer]}: ${STATUS_LABEL[h.from]} to ${STATUS_LABEL[h.to]}` }));

    const intervals = model.intervals(id).map((rec) => describeInterval(model, rec));

    return { id, label: path?.label ?? id, rows, history, intervals };
  });
}

export class FieldServicePanel {
  private built_ = false;
  private serviceKey_ = '';
  private readonly cache_ = new Map<string, HTMLElement>();
  private lastCheck_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly getModel_: () => ServiceModel | null,
    private readonly getNow_: () => number,
    /** Spends scenario seconds on a check (M21: a measurement costs time). Absent = a check is free. */
    private readonly spend_: ((seconds: number) => void) | null = null,
    /** Where the checklist steps that read this service's samples stand; absent = no note */
    private readonly sampleStep_: ((serviceId: string) => FormStepState) | null = null
  ) {
    this.host_.addEventListener('click', this.onClick_);
    this.host_.addEventListener('change', this.onChange_);
  }

  destroy(): void {
    this.host_.removeEventListener('click', this.onClick_);
    this.host_.removeEventListener('change', this.onChange_);
  }

  /** Take a sample as if the player pressed Check on that row; returns the sample */
  check(serviceId: string, layer: ServiceLayer, via: SampleProvenance, endpointId?: string, metric: SampleMetric = 'status'): ServiceSample | null {
    const model = this.getModel_();
    if (!model) {
      return null;
    }
    const sample = model.takeSample(serviceId, layer, via, endpointId, isNumericCheck(via, layer) ? metric : 'status');
    this.lastCheck_ = `${LAYER_LABEL[layer]} checked by ${PROVENANCE_LABEL[via].toLowerCase()} at ${formatClock(sample.tS)}.`;
    if (this.sampleStep_?.(serviceId) === 'later') {
      this.lastCheck_ += ` ${SAMPLE_STEP_LATER_NOTE}`;
    }
    this.spend_?.(CHECK_COST_S[via]);
    this.sync();

    return sample;
  }

  private readonly onClick_ = (e: Event): void => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-svc-check]');
    if (!btn) {
      return;
    }
    const row = btn.closest<HTMLElement>('[data-svc-row]');
    if (!row) {
      return;
    }
    const via = row.querySelector<HTMLSelectElement>('select[data-svc-via]')?.value as SampleProvenance | undefined;
    const metric = (row.querySelector<HTMLSelectElement>('select[data-svc-metric]')?.value ?? 'status') as SampleMetric;
    if (!via) {
      return;
    }
    this.check(row.dataset.svcService ?? '', row.dataset.svcLayer as ServiceLayer, via, row.dataset.svcEndpoint || undefined, metric);
  };

  private readonly onChange_ = (e: Event): void => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-svc-via]');
    const row = sel?.closest<HTMLElement>('[data-svc-row]');
    if (sel && row) {
      this.showMetric_(row, sel.value as SampleProvenance);
    }
  };

  private showMetric_(row: HTMLElement, via: SampleProvenance): void {
    const metric = row.querySelector<HTMLSelectElement>('select[data-svc-metric]');
    if (metric) {
      metric.style.display = isNumericCheck(via, row.dataset.svcLayer as ServiceLayer) ? '' : 'none';
    }
  }

  sync(): void {
    const model = this.getModel_();
    if (!model || model.getServiceIds().length === 0) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    const view = buildServicePanelModel(model, this.getNow_());
    const key = view.map((s) => `${s.id}:${s.rows.length}`).join('|');
    if (!this.built_ || key !== this.serviceKey_) {
      this.build_(view);
      this.serviceKey_ = key;
      this.built_ = true;
    }
    this.patch_(view);
  }

  private build_(view: ServicePanelService[]): void {
    this.cache_.clear();
    const sections = view
      .map((svc) => {
        const rows = svc.rows
          .map((r) => {
            const opts = provenancesFor(r.layer)
              .map((p) => `<option value="${p}">${escapeHtml(PROVENANCE_LABEL[p])}</option>`)
              .join('');
            const metrics = (['status', 'rttMs', 'jitterMs', 'downMbps', 'upMbps', 'lossPct'] as SampleMetric[])
              .map((m) => `<option value="${m}">${METRIC_LABEL[m]}</option>`)
              .join('');
            const name = r.endpointId ? `${LAYER_LABEL[r.layer]} (${escapeHtml(r.endpointId)})` : LAYER_LABEL[r.layer];
            const defaultVia = r.endpointId ? 'endpoint-report' : undefined;

            return `<tr data-svc-row="${escapeHtml(r.key)}" data-svc-service="${escapeHtml(svc.id)}" data-svc-layer="${r.layer}" data-svc-endpoint="${escapeHtml(r.endpointId ?? '')}">
              <td>${name}</td>
              <td><select class="form-select form-select-sm" data-svc-via aria-label="${escapeHtml(name)} check method">${opts.replace(
                defaultVia ? `value="${defaultVia}"` : 'value="__none__"',
                defaultVia ? `value="${defaultVia}" selected` : 'value="__none__"'
              )}</select>
                <select class="form-select form-select-sm" data-svc-metric style="display:none" aria-label="${escapeHtml(name)} measurement">${metrics}</select></td>
              <td><button type="button" class="btn btn-sm btn-outline-primary" data-svc-check>Check</button></td>
              <td data-fsp="value-${escapeHtml(r.key)}"></td>
              <td data-fsp="source-${escapeHtml(r.key)}"></td>
              <td data-fsp="age-${escapeHtml(r.key)}"></td>
              <td><span class="fsp-badge" data-fsp="badge-${escapeHtml(r.key)}"></span></td>
            </tr>`;
          })
          .join('');

        return `<div class="fsp-service" data-svc-section="${escapeHtml(svc.id)}">
          <div class="fsp-service-title">${escapeHtml(svc.label)}</div>
          <table class="fsp-table">
            <thead><tr><th>Layer</th><th>Check with</th><th></th><th>Reading</th><th>Source</th><th>Taken</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <ul class="fsp-history" data-fsp="intervals-${escapeHtml(svc.id)}" style="display:none"></ul>
          <div class="fsp-history-title">Symptom history</div>
          <ul class="fsp-history" data-fsp="history-${escapeHtml(svc.id)}"></ul>
        </div>`;
      })
      .join('');
    this.host_.innerHTML = `
      <details class="fsp" open>
        <summary class="fsp-summary"><b>Service checks</b> <span class="fsp-last" data-fsp="last" aria-live="polite"></span></summary>
        <div class="fsp-body">${sections}</div>
      </details>`;
    for (const row of this.host_.querySelectorAll<HTMLElement>('[data-svc-row]')) {
      const via = row.querySelector<HTMLSelectElement>('select[data-svc-via]')?.value as SampleProvenance | undefined;
      if (via) this.showMetric_(row, via);
    }
  }

  private el_(key: string): HTMLElement | null {
    const cached = this.cache_.get(key);
    if (cached) {
      return cached;
    }
    const el = this.host_.querySelector<HTMLElement>(`[data-fsp="${key}"]`);
    if (el) {
      this.cache_.set(key, el);
    }

    return el;
  }

  private text_(key: string, value: string): void {
    const el = this.el_(key);
    if (el && el.textContent !== value) {
      el.textContent = value;
    }
  }

  private patch_(view: ServicePanelService[]): void {
    this.text_('last', this.lastCheck_);
    for (const svc of view) {
      for (const r of svc.rows) {
        this.text_(`value-${r.key}`, r.value);
        this.text_(`source-${r.key}`, r.provenance);
        this.text_(`age-${r.key}`, r.age);
        this.text_(`badge-${r.key}`, badgeText(r));
        const badge = this.el_(`badge-${r.key}`);
        const cls = `fsp-badge${r.freshness ? ` fsp-${r.freshness}` : ''}`;
        if (badge && badge.className !== cls) badge.className = cls;
      }
      const ivs = this.el_(`intervals-${svc.id}`);
      if (ivs) {
        const text = svc.intervals.join('\n');
        if (ivs.dataset.sig !== text) {
          ivs.dataset.sig = text;
          ivs.style.display = svc.intervals.length > 0 ? '' : 'none';
          ivs.innerHTML = svc.intervals.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
        }
      }
      const list = this.el_(`history-${svc.id}`);
      if (list) {
        const text = svc.history.map((h) => h.text).join('\n');
        if (list.dataset.sig !== text) {
          list.dataset.sig = text;
          list.innerHTML = svc.history.length > 0 ? svc.history.map((h) => `<li>${escapeHtml(h.text)}</li>`).join('') : '<li class="fsp-none">Nothing has changed yet.</li>';
        }
      }
    }
  }
}
