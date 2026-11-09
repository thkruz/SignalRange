/**
 * @file plant-trainer-box - Developer/instructor panel for the physical plant (Phase 38.1)
 * @description Inject any fault kind on a valid target, clear active faults,
 * edit spares, move wind/rain/ambient, reset the plant. Shown in dev mode only
 * (the button that opens it is hidden for everyone else).
 */

import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantFault, PlantFaultKind, PlantTrigger } from '@app/physical/physical-plant-types';
import { PlantBox } from './plant-box-base';
import { escapeHtml, FAULT_KINDS, validTargets } from './plant-ui-helpers';

const TRIGGER_KINDS = ['always', 'windMps', 'rainMmH', 'loadW', 'atSeconds'] as const;
type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Build the trigger from the picker (exported for tests) */
export function buildTrigger(kind: TriggerKind, value: number): PlantTrigger {
  switch (kind) {
    case 'windMps':
      return { windMps: `>${value}` };
    case 'rainMmH':
      return { rainMmH: `>${value}` };
    case 'loadW':
      return { loadW: `>${value}` };
    case 'atSeconds':
      return { atSeconds: value };
    default:
      return { always: true };
  }
}

export class PlantTrainerBox extends PlantBox {
  private static instance_: PlantTrainerBox | null = null;
  private nextId_ = 1;
  private lastFaultKey_ = '';
  private lastSpareKey_ = '';

  private constructor() {
    super('plant-trainer-box', 'Plant trainer', '380px');
  }

  static getInstance(): PlantTrainerBox {
    PlantTrainerBox.instance_ ??= new PlantTrainerBox();

    return PlantTrainerBox.instance_;
  }

  static destroy(): void {
    if (PlantTrainerBox.instance_) {
      PlantTrainerBox.instance_.destroyBase_();
      PlantTrainerBox.instance_ = null;
    }
  }

  protected renderContent_(): string {
    const kindOptions = FAULT_KINDS.map((k) => `<option value="${k.kind}">${escapeHtml(k.label)}</option>`).join('');
    const triggerOptions = TRIGGER_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('');

    return `
      <div class="pp-trainer">
        <h4>Inject a fault</h4>
        <div class="pp-grid">
          <label for="pt-kind">Kind</label><select id="pt-kind" class="form-select form-select-sm">${kindOptions}</select>
          <label for="pt-target">Target</label><select id="pt-target" class="form-select form-select-sm"></select>
          <label for="pt-severity">Severity</label>
          <div class="d-flex gap-2 align-items-center"><input id="pt-severity" type="range" class="form-range" min="0.1" max="1" step="0.1" value="1" /><span id="pt-severity-val">1.0</span></div>
          <label for="pt-trigger">Trigger</label>
          <div class="d-flex gap-2"><select id="pt-trigger" class="form-select form-select-sm">${triggerOptions}</select><input id="pt-trigger-val" type="number" class="form-control form-control-sm" value="8" style="width:5rem" /></div>
          <label for="pt-at">At (m)</label><input id="pt-at" type="number" class="form-control form-control-sm" value="10" min="0" />
        </div>
        <button id="pt-inject" type="button" class="btn btn-primary btn-sm mt-2 w-100">Inject</button>
        <div class="text-muted small mt-1" id="pt-inject-msg"></div>

        <h4>Active faults</h4>
        <div id="pt-faults"></div>

        <h4>Spares</h4>
        <div class="pp-spares" id="pt-spares"></div>

        <h4>Weather</h4>
        <div class="pp-grid">
          <label for="pt-wind">Wind <span id="pt-wind-val"></span></label><input id="pt-wind" type="range" class="form-range" min="0" max="30" step="1" value="0" />
          <label for="pt-rain">Rain <span id="pt-rain-val"></span></label><input id="pt-rain" type="range" class="form-range" min="0" max="50" step="1" value="0" />
          <label for="pt-ambient">Ambient <span id="pt-ambient-val"></span></label><input id="pt-ambient" type="range" class="form-range" min="-30" max="45" step="1" value="15" />
          <label for="pt-snow">Snow</label><input id="pt-snow" type="checkbox" class="form-check-input" />
        </div>

        <button id="pt-reset" type="button" class="btn btn-warning btn-sm mt-3 w-100">Reset plant</button>
      </div>`;
  }

  protected bind_(root: HTMLElement): void {
    const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T;
    q('#pt-kind').addEventListener('change', () => this.refillTargets_(root));
    q<HTMLInputElement>('#pt-severity').addEventListener('input', () => {
      q('#pt-severity-val').textContent = Number(q<HTMLInputElement>('#pt-severity').value).toFixed(1);
    });
    q('#pt-inject').addEventListener('click', () => this.inject_(root));
    q('#pt-reset').addEventListener('click', () => {
      PhysicalPlantService.plantOrNull()?.reset();
      this.lastFaultKey_ = '';
      this.lastSpareKey_ = '';
      this.syncNow();
    });
    for (const id of ['wind', 'rain', 'ambient']) {
      q(`#pt-${id}`).addEventListener('input', () => this.applyWeather_(root));
    }
    q('#pt-snow').addEventListener('change', () => this.applyWeather_(root));
    root.addEventListener('click', (ev) => this.onClick_(ev));
    root.addEventListener('change', (ev) => this.onSpareChange_(ev));
    this.refillTargets_(root);
  }

  private refillTargets_(root: HTMLElement): void {
    const plant = PhysicalPlantService.plantOrNull();
    const kind = root.querySelector<HTMLSelectElement>('#pt-kind')?.value as PlantFaultKind | undefined;
    const target = root.querySelector<HTMLSelectElement>('#pt-target');
    if (!plant || !kind || !target) {
      return;
    }
    target.innerHTML = validTargets(plant, kind)
      .map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(plant.getLabel(id) === id ? id : `${plant.getLabel(id)} (${id})`)}</option>`)
      .join('');
    const def = FAULT_KINDS.find((k) => k.kind === kind);
    const at = root.querySelector<HTMLInputElement>('#pt-at');
    if (at) {
      at.disabled = !def?.cableMeters;
    }
  }

  private inject_(root: HTMLElement): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const kind = root.querySelector<HTMLSelectElement>('#pt-kind')!.value as PlantFaultKind;
    const target = root.querySelector<HTMLSelectElement>('#pt-target')!.value;
    const msg = root.querySelector('#pt-inject-msg')!;
    if (!target) {
      msg.textContent = 'No valid target for this kind.';

      return;
    }
    const severity = Number(root.querySelector<HTMLInputElement>('#pt-severity')!.value);
    const triggerKind = root.querySelector<HTMLSelectElement>('#pt-trigger')!.value as TriggerKind;
    const triggerVal = Number(root.querySelector<HTMLInputElement>('#pt-trigger-val')!.value);
    const fault: PlantFault = {
      id: `trainer-${this.nextId_++}`,
      target,
      kind,
      severity,
      trigger: buildTrigger(triggerKind, triggerVal),
    };
    if (FAULT_KINDS.find((k) => k.kind === kind)?.cableMeters) {
      const atM = Number(root.querySelector<HTMLInputElement>('#pt-at')!.value);
      fault.atMeters = Math.min(Math.max(atM, 0), plant.getCableState(target)?.lengthM ?? atM);
    }
    plant.injectFault(fault);
    msg.textContent = `Injected ${fault.id}.`;
    this.syncNow();
  }

  private onClick_(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-clear-fault]');
    if (!btn) {
      return;
    }
    PhysicalPlantService.plantOrNull()?.clearFault(btn.dataset.clearFault ?? '');
    this.syncNow();
  }

  private onSpareChange_(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const key = input.dataset.spare;
    const plant = PhysicalPlantService.plantOrNull();
    if (!key || !plant) {
      return;
    }
    plant.setSpares({ ...plant.getSpares(), [key]: Math.max(0, Math.floor(Number(input.value) || 0)) });
    this.syncNow();
  }

  private applyWeather_(root: HTMLElement): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const val = (id: string) => Number(root.querySelector<HTMLInputElement>(`#pt-${id}`)!.value);
    plant.setWeather({ windMps: val('wind'), rainMmH: val('rain'), ambientC: val('ambient'), snow: root.querySelector<HTMLInputElement>('#pt-snow')!.checked });
    this.writeWeatherLabels_(root);
  }

  private writeWeatherLabels_(root: HTMLElement): void {
    const set = (id: string, text: string) => {
      const el = root.querySelector(`#pt-${id}-val`);
      if (el) el.textContent = text;
    };
    set('wind', `${root.querySelector<HTMLInputElement>('#pt-wind')!.value} m/s`);
    set('rain', `${root.querySelector<HTMLInputElement>('#pt-rain')!.value} mm/h`);
    set('ambient', `${root.querySelector<HTMLInputElement>('#pt-ambient')!.value} C`);
  }

  protected sync_(root: HTMLElement): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const faults = plant.getFaults();
    const faultKey = faults.map((f) => f.id).join('|');
    if (faultKey !== this.lastFaultKey_) {
      this.lastFaultKey_ = faultKey;
      root.querySelector('#pt-faults')!.innerHTML =
        faults.length === 0
          ? '<div class="text-muted small">None</div>'
          : faults
              .map(
                (f) =>
                  `<div class="pp-fault-row"><span>${escapeHtml(f.id)}: ${f.kind} on ${escapeHtml(f.target)}</span><button type="button" class="btn btn-sm btn-outline-danger py-0" data-clear-fault="${escapeHtml(f.id)}">Clear</button></div>`
              )
              .join('');
    }
    const spares = plant.getSpares();
    const spareKey = Object.keys(spares).join('|');
    const spareHost = root.querySelector('#pt-spares')!;
    if (spareKey !== this.lastSpareKey_) {
      this.lastSpareKey_ = spareKey;
      spareHost.innerHTML = Object.keys(spares)
        .map(
          (key) =>
            `<label for="pt-spare-${escapeHtml(key)}">${escapeHtml(key)}</label><input id="pt-spare-${escapeHtml(key)}" data-spare="${escapeHtml(key)}" type="number" min="0" class="form-control form-control-sm" />`
        )
        .join('');
    }
    for (const [key, count] of Object.entries(spares)) {
      const input = spareHost.querySelector<HTMLInputElement>(`[data-spare="${key}"]`);
      if (input && document.activeElement !== input) {
        input.value = String(count);
      }
    }
    const env = plant.getEnvironment();
    for (const [id, value] of [
      ['wind', env.windMps],
      ['rain', env.rainMmH],
      ['ambient', env.ambientC],
    ] as const) {
      const slider = root.querySelector<HTMLInputElement>(`#pt-${id}`)!;
      if (document.activeElement !== slider) {
        slider.value = String(value);
      }
    }
    const snow = root.querySelector<HTMLInputElement>('#pt-snow');
    if (snow && document.activeElement !== snow) {
      snow.checked = env.snow === true;
    }
    this.writeWeatherLabels_(root);
  }
}
