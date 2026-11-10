import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PartModeConfig, PowerForecast, PowerReadings } from '@app/physical/physical-plant-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-power-panel.css';

/**
 * FieldPowerPanel - Power readings, mode selectors and the forecast preview (Phase 38.2, M08)
 *
 * Lives under the site stage. The player reads stored energy, per-device draw, fuel and the
 * reserve, picks modes per device, sees the forecast for those picks (a pure preview, nothing
 * changes), and only then commits with Apply. A commit goes through `setPartMode`, so every
 * change costs scenario time and is logged by the plant like any other verb. The skeleton is
 * built once and values are patched in place, so an open selector is never reset by the 1 Hz sync.
 */

/** One mode-capable device as the panel shows it */
export interface PowerDeviceRow {
  id: string;
  label: string;
  kind: 'generator' | 'device';
  current: string;
  pending: string;
  starting: boolean;
  /** Restarting or searching after a supply loss: the row says Running but there is no service yet */
  phase: 'restarting' | 'searching' | null;
  loadW: number;
  fuelL: number | null;
  modes: Pick<PartModeConfig, 'id' | 'label' | 'loadW'>[];
  /** No selectable modes: the row only reports the draw (a fixed load, or a generator the player starts on site) */
  fixed?: boolean;
}

/** Everything the panel prints, derived from the plant (no DOM) */
export interface PowerPanelModel {
  readings: PowerReadings;
  devices: PowerDeviceRow[];
  forecast: PowerForecast;
  /** Pending picks that differ from the current mode */
  changes: Record<string, string>;
  socTotalWh: number;
  capacityTotalWh: number;
}

/** True when the plant has anything for the panel to show: a mode-capable device or a reserve */
export function powerPanelRelevant(plant: PhysicalPlantManager | null): boolean {
  if (!plant) {
    return false;
  }
  if (plant.getPowerReadings().reserveWh !== null) {
    return true;
  }

  return plant.getPartIds().some((id) => plant.getModeOptions(id).length > 0);
}

/** Build the view model; `pending` maps part id -> picked mode id (unset = keep current) */
export function buildPowerPanelModel(plant: PhysicalPlantManager, pending: ReadonlyMap<string, string>): PowerPanelModel {
  const readings = plant.getPowerReadings();
  const devices: PowerDeviceRow[] = [];
  const changes: Record<string, string> = {};
  for (const id of plant.getPartIds()) {
    const modes = plant.getModeOptions(id);
    if (modes.length === 0) {
      continue;
    }
    const current = plant.getPartMode(id) as string;
    const pick = pending.get(id);
    const picked = pick !== undefined && modes.some((m) => m.id === pick) ? pick : current;
    if (picked !== current) {
      changes[id] = picked;
    }
    devices.push({
      id,
      label: plant.getLabel(id),
      kind: id in readings.fuelL ? 'generator' : 'device',
      current,
      pending: picked,
      starting: plant.isStarting(id),
      phase: plant.getStartupPhase(id),
      loadW: readings.loadW[id] ?? plant.getLoadW(id),
      fuelL: id in readings.fuelL ? readings.fuelL[id] : null,
      modes: modes.map((m) => ({ id: m.id, label: m.label, loadW: m.loadW })),
    });
  }
  // Loads with no authored modes still draw power: list them read-only so the table matches the draw total
  for (const id of plant.getPartIds()) {
    if (devices.some((d) => d.id === id) || id in readings.capacityWh) {
      continue;
    }
    const isGenerator = id in readings.fuelL;
    const drawW = readings.loadW[id] ?? plant.getLoadW(id);
    if (!isGenerator && drawW <= 0 && plant.getLoadW(id) <= 0) {
      continue;
    }
    const state = isGenerator ? (drawW > 0 ? 'Running' : 'Off') : 'Fixed load';
    devices.push({
      id,
      label: plant.getLabel(id),
      kind: isGenerator ? 'generator' : 'device',
      current: state,
      pending: state,
      starting: false,
      phase: null,
      loadW: drawW,
      fuelL: isGenerator ? readings.fuelL[id] : null,
      modes: [],
      fixed: true,
    });
  }
  const socTotalWh = Object.values(readings.socWh).reduce((a, b) => a + b, 0);
  const capacityTotalWh = Object.values(readings.capacityWh).reduce((a, b) => a + b, 0);

  return { readings, devices, forecast: plant.forecast(changes), changes, socTotalWh, capacityTotalWh };
}

/** "1 h 30 min", "45 min", "40 s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return `${s} s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export class FieldPowerPanel {
  private readonly pending_ = new Map<string, string>();
  private readonly cache_ = new Map<string, HTMLElement>();
  private built_ = false;
  private deviceKey_ = '';
  private lastResult_: string[] = [];

  constructor(
    private readonly host_: HTMLElement,
    private readonly getPlant_: () => PhysicalPlantManager | null
  ) {
    host_.addEventListener('change', (ev) => {
      const sel = (ev.target as Element).closest<HTMLSelectElement>('select[data-power-part]');
      if (sel) {
        this.setPending(sel.dataset.powerPart as string, sel.value);
      }
    });
    host_.addEventListener('click', (ev) => {
      const btn = (ev.target as Element).closest<HTMLElement>('button[data-power-action]');
      if (btn?.dataset.powerAction === 'apply') {
        this.apply();
      } else if (btn?.dataset.powerAction === 'reset') {
        this.pending_.clear();
        this.sync();
      }
    });
  }

  /** Pick a mode for a device without committing; the forecast follows at once */
  setPending(partId: string, modeId: string): void {
    this.pending_.set(partId, modeId);
    this.sync();
  }

  getPending(): ReadonlyMap<string, string> {
    return this.pending_;
  }

  /** Commit every pending pick that differs from the current mode; returns the plant's observation lines */
  apply(): string[] {
    const plant = this.getPlant_();
    if (!plant) {
      return [];
    }
    const lines: string[] = [];
    const model = buildPowerPanelModel(plant, this.pending_);
    // Stop devices first so a generator or terminal that frees load is not delayed by a start
    const order = Object.entries(model.changes).sort(([, a], [, b]) => Number(b === 'off' || b === 'standby') - Number(a === 'off' || a === 'standby'));
    for (const [partId, modeId] of order) {
      const result = plant.setPartMode(partId, modeId);
      lines.push(`${plant.getLabel(partId)}: ${result.observation}`);
    }
    this.pending_.clear();
    this.lastResult_ = lines;
    this.sync();

    return lines;
  }

  /** Rebuild the skeleton if the device set changed, then patch values */
  sync(): void {
    const plant = this.getPlant_();
    if (!plant || !powerPanelRelevant(plant)) {
      this.host_.style.display = 'none';

      return;
    }
    this.host_.style.display = '';
    const model = buildPowerPanelModel(plant, this.pending_);
    const key = model.devices.map((d) => `${d.id}:${d.modes.map((m) => m.id).join('/')}`).join('|');
    if (!this.built_ || key !== this.deviceKey_) {
      this.build_(model);
      this.deviceKey_ = key;
      this.built_ = true;
    }
    this.patch_(model);
  }

  private build_(model: PowerPanelModel): void {
    this.cache_.clear();
    const rows = model.devices
      .map((d) => {
        const options = d.modes.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)} (${m.loadW} W)</option>`).join('');

        return `<tr data-power-row="${escapeHtml(d.id)}">
          <td>${escapeHtml(d.label)}</td>
          <td><span class="fpp-mode" data-fpp="mode-${escapeHtml(d.id)}"></span></td>
          <td class="fpp-num" data-fpp="load-${escapeHtml(d.id)}"></td>
          <td class="fpp-num" data-fpp="fuel-${escapeHtml(d.id)}">${d.fuelL === null ? '' : ''}</td>
          <td>${d.fixed ? '<span class="fpp-mode-idle">Not switchable here</span>' : `<select class="form-select form-select-sm" data-power-part="${escapeHtml(d.id)}" aria-label="${escapeHtml(d.label)} mode">${options}</select>`}</td>
        </tr>`;
      })
      .join('');
    this.host_.innerHTML = `
      <details class="fpp" open>
        <summary class="fpp-summary"><b>Power</b> <span class="fpp-sum" data-fpp="summary"></span></summary>
        <div class="fpp-body">
          <div class="fpp-stats">
            <span class="fpp-stat">Stored <b data-fpp="soc"></b></span>
            <span class="fpp-stat">Draw <b data-fpp="draw"></b></span>
            <span class="fpp-stat" data-fpp="charge-wrap">Charge <b data-fpp="charge"></b></span>
            <span class="fpp-stat" data-fpp="reserve-wrap">Reserve <b data-fpp="reserve"></b></span>
          </div>
          <table class="fpp-table">
            <thead><tr><th>Device</th><th>Mode</th><th class="fpp-num">Draw</th><th class="fpp-num">Fuel</th><th>Set mode</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="fpp-forecast" data-fpp="forecast-box">
            <div class="fpp-forecast-title">Forecast <span class="fpp-forecast-note" data-fpp="forecast-note"></span></div>
            <div class="fpp-forecast-line" data-fpp="forecast-line"></div>
            <div class="fpp-forecast-line" data-fpp="forecast-extra"></div>
          </div>
          <div class="fpp-actions">
            <button type="button" class="btn btn-sm btn-primary" data-power-action="apply">Apply</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-power-action="reset">Discard picks</button>
            <span class="fpp-result" data-fpp="result" aria-live="polite"></span>
          </div>
        </div>
      </details>`;
  }

  private el_(key: string): HTMLElement | null {
    const cached = this.cache_.get(key);
    if (cached) {
      return cached;
    }
    const el = this.host_.querySelector<HTMLElement>(`[data-fpp="${key}"]`);
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

  private patch_(model: PowerPanelModel): void {
    const r = model.readings;
    const hasBattery = Object.keys(r.capacityWh).length > 0;
    this.text_('soc', hasBattery ? `${Math.round(model.socTotalWh)} / ${Math.round(model.capacityTotalWh)} Wh` : 'n/a');
    this.text_('draw', `${Math.round(r.totalDrawW)} W`);
    this.text_('charge', `${Math.round(r.chargeW)} W`);
    const chargeWrap = this.el_('charge-wrap');
    if (chargeWrap) chargeWrap.style.display = r.chargeW > 0 ? '' : 'none';
    const reserveWrap = this.el_('reserve-wrap');
    if (reserveWrap) reserveWrap.style.display = r.reserveWh === null ? 'none' : '';
    this.text_('reserve', r.reserveWh === null ? '' : `${Math.round(r.reserveWh)} Wh`);
    this.text_('summary', hasBattery ? `${Math.round(model.socTotalWh)} Wh stored, drawing ${Math.round(r.totalDrawW)} W` : `drawing ${Math.round(r.totalDrawW)} W`);

    for (const d of model.devices) {
      const mode = d.modes.find((m) => m.id === d.current);
      const phaseText = d.phase === 'restarting' ? ' (restarting, no service yet)' : d.phase === 'searching' ? ' (searching for the satellite)' : '';
      this.text_(`mode-${d.id}`, d.starting ? `${mode?.label ?? d.current} (starting)` : `${mode?.label ?? d.current}${phaseText}`);
      const modeEl = this.el_(`mode-${d.id}`);
      if (modeEl) modeEl.className = `fpp-mode ${d.starting || d.phase ? 'fpp-mode-warn' : d.current === 'off' || d.current === 'standby' ? 'fpp-mode-idle' : 'fpp-mode-on'}`;
      this.text_(`load-${d.id}`, `${Math.round(d.loadW)} W`);
      this.text_(`fuel-${d.id}`, d.fuelL === null ? '' : `${d.fuelL.toFixed(1)} L`);
      const sel = this.host_.querySelector<HTMLSelectElement>(`select[data-power-part="${d.id}"]`);
      if (sel && sel.value !== d.pending) {
        sel.value = d.pending;
      }
    }

    const f = model.forecast;
    const preview = Object.keys(model.changes).length > 0;
    this.text_('forecast-note', preview ? '(preview of your picks, nothing changed yet)' : '(current modes)');
    const basis = f.basis === 'battery-only' ? 'on batteries alone' : 'with the generator';
    this.text_(
      'forecast-line',
      `After ${formatDuration(f.horizonS)} ${basis}: ${Math.round(f.projectedSocWh)} Wh left. ${f.meetsReserve ? 'Meets the reserve.' : 'Falls below the reserve.'}`
    );
    const extra: string[] = [];
    if (f.secondsToReserve !== null && r.reserveWh !== null) {
      extra.push(`Reserve reached in ${formatDuration(f.secondsToReserve)}.`);
    }
    if (f.fuelUsedL > 0) {
      extra.push(`Fuel used ${f.fuelUsedL.toFixed(1)} L.`);
    }
    if (f.startupCostS > 0) {
      extra.push(`Changes take about ${formatDuration(f.startupCostS)} to settle.`);
    }
    this.text_('forecast-extra', extra.join(' '));
    const box = this.el_('forecast-box');
    if (box) box.className = `fpp-forecast ${f.meetsReserve ? 'fpp-ok' : 'fpp-bad'}`;
    const apply = this.host_.querySelector<HTMLButtonElement>('button[data-power-action="apply"]');
    if (apply) apply.disabled = !preview;
    this.text_('result', this.lastResult_.join(' '));
  }
}
