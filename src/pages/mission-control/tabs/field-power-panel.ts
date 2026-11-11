import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PartModeConfig, PowerForecast, PowerReadings, SupplyRestart } from '@app/physical/physical-plant-types';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import './field-power-panel.css';

/**
 * FieldPowerPanel - Power readings, mode selectors and the forecast preview (Phase 38.2, M08)
 *
 * A printed planning sheet on graph paper, held fullscreen with the field documents: the load table is printed,
 * the planned modes are pencilled in and the forecast is a hand-worked line on the graph. The sheet never switches
 * equipment; each device row has "Go to <part>" that puts the sheet down and walks to the part's close-up. The player reads stored energy, per-device draw, fuel and the
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
  /** Supply drops that restarted a terminal, for the standing supply alarm */
  supplyRestarts: readonly SupplyRestart[];
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
    // A generator reports the load wired to it even when it is stopped, so the state comes from the part, not the draw (c6-s15-F8)
    const genRunning = isGenerator && plant.isPartPowered(id);
    const state = isGenerator ? (genRunning ? 'Running' : 'Off') : 'Fixed load';
    devices.push({
      id,
      label: plant.getLabel(id),
      kind: isGenerator ? 'generator' : 'device',
      current: state,
      pending: state,
      starting: false,
      phase: null,
      loadW: isGenerator && !genRunning ? 0 : drawW,
      fuelL: isGenerator ? readings.fuelL[id] : null,
      modes: [],
      fixed: true,
    });
  }
  const socTotalWh = Object.values(readings.socWh).reduce((a, b) => a + b, 0);
  const capacityTotalWh = Object.values(readings.capacityWh).reduce((a, b) => a + b, 0);

  return { readings, devices, forecast: plant.forecast(changes), changes, socTotalWh, capacityTotalWh, supplyRestarts: plant.getSupplyRestarts() };
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

/**
 * The forecast as a hand-worked figure on the graph paper: stored energy against time, a straight line from
 * the charge now to the charge at the horizon, the reserve as a dashed rule. It draws only what the plant's
 * forecast already says.
 */
export function forecastGraph(model: PowerPanelModel): string {
  const f = model.forecast;
  const cap = Math.max(1, model.capacityTotalWh);
  const W = 520;
  const H = 190;
  const L = 52;
  const R = 14;
  const T = 14;
  const B = 34;
  const x = (frac: number): number => L + frac * (W - L - R);
  const y = (wh: number): number => T + (1 - Math.max(0, Math.min(1, wh / cap))) * (H - T - B);
  const reserve = model.readings.reserveWh;
  const y0 = y(model.socTotalWh);
  const y1 = y(f.projectedSocWh);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((q) => `<text class="fpp-axis" x="${L - 6}" y="${y(cap * q) + 4}" text-anchor="end">${Math.round(cap * q)}</text>`).join('');
  const reserveLine =
    reserve === null
      ? ''
      : `<line class="fpp-reserve" x1="${L}" x2="${W - R}" y1="${y(reserve)}" y2="${y(reserve)}"/><text class="fpp-pencil-note" x="${L + 8}" y="${y(reserve) - 5}">reserve ${Math.round(reserve)} Wh</text>`;
  const hit =
    f.secondsToReserve !== null && reserve !== null && f.horizonS > 0 && f.secondsToReserve <= f.horizonS
      ? `<circle class="fpp-cross" cx="${x(f.secondsToReserve / f.horizonS)}" cy="${y(reserve)}" r="6"/>`
      : '';
  const cls = f.meetsReserve ? 'fpp-line-ok' : 'fpp-line-bad';
  const mid = (H - B + T) / 2;

  return `<svg class="fpp-graph" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <line class="fpp-axis-line" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/><line class="fpp-axis-line" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
    ${grid}${reserveLine}
    <line class="fpp-line ${cls}" x1="${x(0)}" y1="${y0}" x2="${x(1)}" y2="${y1}"/>${hit}
    <circle class="fpp-dot" cx="${x(0)}" cy="${y0}" r="3.5"/><circle class="fpp-dot" cx="${x(1)}" cy="${y1}" r="3.5"/>
    <text class="fpp-pencil-note" x="${x(0) + 8}" y="${y0 - 8}">now ${Math.round(model.socTotalWh)} Wh</text>
    <text class="fpp-pencil-note" x="${x(1) - 4}" y="${y1 + (y1 < H - B - 26 ? 20 : -10)}" text-anchor="end">${Math.round(f.projectedSocWh)} Wh</text>
    <text class="fpp-axis" x="${x(0)}" y="${H - 16}" text-anchor="middle">0</text><text class="fpp-axis" x="${x(1) + 6}" y="${H - 16}" text-anchor="end">${escapeHtml(formatDuration(f.horizonS))}</text>
    <text class="fpp-axis" x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle">time ahead</text>
    <text class="fpp-axis" x="10" y="${mid}" text-anchor="middle" transform="rotate(-90 10 ${mid})">Wh</text>
  </svg>`;
}

export class FieldPowerPanel {
  private readonly pending_ = new Map<string, string>();
  private readonly cache_ = new Map<string, HTMLElement>();
  private built_ = false;
  private deviceKey_ = '';
  private lastResult_: string[] = [];
  private lastGraph_ = '';

  constructor(
    private readonly host_: HTMLElement,
    private readonly getPlant_: () => PhysicalPlantManager | null,
    private readonly visit_: ((partId: string) => void) | null = null
  ) {
    host_.addEventListener('change', (ev) => {
      const sel = (ev.target as Element).closest<HTMLInputElement>('input[data-power-part]');
      if (sel) {
        this.setPending(sel.dataset.powerPart as string, sel.value);
      }
    });
    host_.addEventListener('click', (ev) => {
      const visit = (ev.target as Element).closest<HTMLElement>('button[data-power-visit]');
      if (visit) {
        this.visit_?.(visit.dataset.powerVisit!);
        return;
      }
      const btn = (ev.target as Element).closest<HTMLElement>('button[data-power-action]');
      if (btn?.dataset.powerAction === 'apply') {
        if (this.visit_) {
          this.lastResult_ = ['Plan retained. Use each equipment control to set its mode; these marks only preview the forecast.'];
          this.sync();
        } else this.apply();
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
        const options = d.modes
          .map(
            (m) =>
              `<label class="fpp-switch-position"><input type="radio" name="power-${escapeHtml(d.id)}" data-power-part="${escapeHtml(d.id)}" value="${escapeHtml(m.id)}" /><span class="fpp-tick-box" aria-hidden="true"></span><span class="fpp-tick-label">${escapeHtml(m.label)}<small>${m.loadW} W</small></span></label>`
          )
          .join('');
        const plan = d.fixed
          ? '<span class="fpp-mode-idle">Not switchable here</span>'
          : `<fieldset class="fpp-mode-switch"><legend class="fpp-sr">${escapeHtml(d.label)} mode</legend>${options}</fieldset>`;
        const go = this.visit_ && !d.fixed ? `<button type="button" class="fpp-go" data-power-visit="${escapeHtml(d.id)}">Go to ${escapeHtml(d.label)}</button>` : '';

        return `<tr class="fpp-device" data-power-row="${escapeHtml(d.id)}">
          <th scope="row">${escapeHtml(d.label)}</th>
          <td class="fpp-now"><span class="fpp-mode" data-fpp="mode-${escapeHtml(d.id)}"></span></td>
          <td class="fpp-load"><b class="fpp-num" data-fpp="load-${escapeHtml(d.id)}"></b><span class="fpp-num fpp-fuel" data-fpp="fuel-${escapeHtml(d.id)}"></span></td>
          <td class="fpp-plan">${plan}</td>
          <td class="fpp-goto">${go}</td>
        </tr>`;
      })
      .join('');
    this.host_.innerHTML = `
      <section class="fpp" aria-label="Power plan">
        <header class="fpp-head">
          <p class="fpp-kicker">Planning sheet</p>
          <h2 class="fpp-title">Power plan</h2>
          <p class="fpp-sum" data-fpp="summary"></p>
        </header>
        <div class="fpp-body">
          <div class="fpp-stats">
            <span class="fpp-stat">Stored <b data-fpp="soc"></b></span>
            <span class="fpp-stat">Draw <b data-fpp="draw"></b></span>
            <span class="fpp-stat" data-fpp="charge-wrap">Charge <b data-fpp="charge"></b></span>
            <span class="fpp-stat" data-fpp="reserve-wrap">Reserve <b data-fpp="reserve"></b></span>
          </div>
          <table class="fpp-table">
            <caption class="fpp-caption">Loads. Pencil a tick for the mode you want; the switches stay on the equipment.</caption>
            <thead><tr><th scope="col">Device</th><th scope="col">Now</th><th scope="col">Load</th><th scope="col">Plan</th><th scope="col"><span class="fpp-sr">Walk to</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="fpp-forecast fpp-bad" data-fpp="supply-alarm" role="alert" style="display:none"></div>
          <div class="fpp-forecast" data-fpp="forecast-box">
            <div class="fpp-forecast-title">Forecast <span class="fpp-forecast-note" data-fpp="forecast-note"></span></div>
            <div class="fpp-energy" data-fpp="energy" role="img" aria-label="Battery forecast"></div>
            <div class="fpp-forecast-line" data-fpp="forecast-line"></div>
            <div class="fpp-forecast-line" data-fpp="forecast-extra"></div>
          </div>
          <div class="fpp-actions">
            <button type="button" class="fpp-btn fpp-btn-keep" data-power-action="apply">${this.visit_ ? 'Keep plan' : 'Apply'}</button>
            <button type="button" class="fpp-btn" data-power-action="reset">Discard picks</button>
            <span class="fpp-result" data-fpp="result" aria-live="polite"></span>
          </div>
        </div>
      </section>`;
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

    const alarm = this.el_('supply-alarm');
    if (alarm) {
      const last = model.supplyRestarts.at(-1);
      alarm.style.display = last ? '' : 'none';
      if (last) {
        const n = model.supplyRestarts.length;
        alarm.textContent = `Supply alarm: ${last.label} has restarted ${n} time${n === 1 ? '' : 's'} because its power dropped out at ${last.sourceLabel}. Each restart stops service for minutes. Check the supply, not the terminal.`;
      }
    }

    for (const d of model.devices) {
      const mode = d.modes.find((m) => m.id === d.current);
      const phaseText = d.phase === 'restarting' ? ' (restarting, no service yet)' : d.phase === 'searching' ? ' (searching for the satellite)' : '';
      this.text_(`mode-${d.id}`, d.starting ? `${mode?.label ?? d.current} (starting)` : `${mode?.label ?? d.current}${phaseText}`);
      const modeEl = this.el_(`mode-${d.id}`);
      if (modeEl) modeEl.className = `fpp-mode ${d.starting || d.phase ? 'fpp-mode-warn' : d.current === 'off' || d.current === 'standby' ? 'fpp-mode-idle' : 'fpp-mode-on'}`;
      this.text_(`load-${d.id}`, `${Math.round(d.loadW)} W`);
      this.text_(`fuel-${d.id}`, d.fuelL === null ? '' : `${d.fuelL.toFixed(1)} L`);
      for (const input of this.host_.querySelectorAll<HTMLInputElement>(`input[data-power-part="${d.id}"]`)) {
        input.checked = input.value === d.pending;
      }
      const row = this.host_.querySelector<HTMLElement>(`[data-power-row="${d.id}"]`);
      row?.classList.toggle('has-pending', d.current !== d.pending);
    }

    const f = model.forecast;
    const preview = Object.keys(model.changes).length > 0;
    const energy = this.el_('energy');
    if (energy) {
      energy.hidden = !hasBattery;
      energy.setAttribute(
        'aria-label',
        `Current charge ${Math.round(model.socTotalWh)} Wh; projected charge ${Math.round(f.projectedSocWh)} Wh; reserve ${Math.round(r.reserveWh ?? 0)} Wh.`
      );
      const svg = hasBattery ? forecastGraph(model) : '';
      if (this.lastGraph_ !== svg) {
        this.lastGraph_ = svg;
        energy.innerHTML = svg;
      }
    }
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
      extra.push(`The slowest change takes about ${formatDuration(f.startupCostS)} to settle.`);
    }
    this.text_('forecast-extra', extra.join(' '));
    const box = this.el_('forecast-box');
    if (box) box.className = `fpp-forecast ${f.meetsReserve ? 'fpp-ok' : 'fpp-bad'}`;
    const apply = this.host_.querySelector<HTMLButtonElement>('button[data-power-action="apply"]');
    if (apply) apply.disabled = !preview;
    this.text_('result', this.lastResult_.join(' '));
  }
}
