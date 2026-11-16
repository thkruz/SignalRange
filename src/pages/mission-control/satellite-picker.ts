import { ConstellationTreeModel } from '@app/pages/mission-control/constellation-tree-model';
import type { SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { SimulationManager } from '@app/simulation/simulation-manager';

/**
 * Searchable satellite picker for the SDR and ACU target selects (Phase 3, P3-WP10).
 *
 * Scenarios without constellation members keep today's plain `<select>` with one option per authored
 * satellite. With members, the select lists only authored, pinned and selected satellites (plus the
 * current target) and a search box above it queries every member by name or NORAD id through the same
 * model as the asset tree. At most PICKER_LIMIT matches are in the DOM at any time.
 */

export const PICKER_LIMIT = 50;

export interface PickerEntry {
  noradId: number;
  name: string;
}

export interface PickerResult {
  entries: PickerEntry[];
  /** Matches that did not fit under the limit. */
  more: number;
  /** True when the scenario has constellation members, so the picker needs a search box. */
  scale: boolean;
}

const models = new WeakMap<SatelliteRegistry, ConstellationTreeModel>();

function modelFor(registry: SatelliteRegistry): ConstellationTreeModel {
  let model = models.get(registry);

  if (!model) {
    model = new ConstellationTreeModel(registry);
    models.set(registry, model);
  }

  return model;
}

function registryOf(sim: SimulationManager): SatelliteRegistry | undefined {
  return (sim as { registry?: SatelliteRegistry }).registry;
}

function matches(entry: PickerEntry, q: string, numeric: boolean): boolean {
  return entry.name.toLowerCase().includes(q) || (numeric && String(entry.noradId).startsWith(q));
}

/**
 * The options a picker shows. No members: every satellite of the sim, the query ignored (small scenarios
 * never show a search box). Members: authored, pinned and selected satellites plus `current`, or, for a
 * query, the matches among those first and then among all members, capped at `limit`.
 */
export function pickerEntries(sim: SimulationManager, query: string, current: number | null, limit: number = PICKER_LIMIT): PickerResult {
  const registry = registryOf(sim);

  if (!registry || !registry.memberCount || typeof registry.laneSatellites !== 'function') {
    return { entries: sim.satellites.map((sat) => ({ noradId: sat.noradId, name: sat.name })), more: 0, scale: false };
  }
  const seen = new Set<number>();
  const base: PickerEntry[] = [];
  const add = (noradId: number, name: string): void => {
    if (!seen.has(noradId)) {
      seen.add(noradId);
      base.push({ noradId, name });
    }
  };

  for (const sat of registry.laneSatellites()) {
    add(sat.noradId, sat.name);
  }
  if (current !== null) {
    const ref = registry.ref(current);

    if (ref) {
      add(current, ref.name);
    }
  }
  const q = query.trim().toLowerCase();

  if (q === '') {
    return { entries: base.slice(0, limit + 1), more: Math.max(0, base.length - limit), scale: true };
  }
  const numeric = /^\d+$/u.test(q);
  // The current pick stays listed while the operator searches for another.
  const entries = base.filter((entry) => entry.noradId === current || matches(entry, q, numeric));
  const hits = modelFor(registry).search(query);
  let more = 0;

  for (let i = 0; i < hits.length; i++) {
    const norad = registry.memberNorad(hits[i]);

    if (seen.has(norad)) {
      continue;
    }
    if (entries.length >= limit) {
      more = hits.length - i;
      break;
    }
    entries.push({ noradId: norad, name: registry.memberName(hits[i]) });
  }

  return { entries, more, scale: true };
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

/** Option markup for a picker result. Small scenarios render name only, as before; members add the NORAD id. */
export function pickerOptionsHtml(result: PickerResult): string {
  const rows = result.entries.map((entry) => `<option value="${entry.noradId}">${escapeHtml(entry.name)}${result.scale ? ` (${entry.noradId})` : ''}</option>`);

  if (result.more > 0) {
    rows.push(`<option value="" disabled>${result.more} more: refine the search</option>`);
  }

  return rows.join('');
}

export interface SatellitePickerOptions {
  /** Text of the empty first option ('-- Select Satellite --'). Omit when the select has no placeholder option. */
  placeholder?: string;
}

export class SatellitePicker {
  private readonly select_: HTMLSelectElement;
  private sim_: SimulationManager;
  private readonly placeholder_: string | undefined;
  private input_: HTMLInputElement | null = null;
  private query_ = '';
  private key_ = '';
  private readonly boundInput_: () => void;
  private readonly boundChange_: () => void;

  constructor(select: HTMLSelectElement, sim: SimulationManager, options: SatellitePickerOptions = {}) {
    this.select_ = select;
    this.sim_ = sim;
    this.placeholder_ = options.placeholder;
    this.boundInput_ = this.onInput_.bind(this);
    this.boundChange_ = this.onChange_.bind(this);
    if (pickerEntries(sim, '', null).scale) {
      this.mountSearch_();
    }
    this.select_.addEventListener('change', this.boundChange_);
  }

  /** The search box is only present when the scenario has constellation members. */
  get hasSearch(): boolean {
    return this.input_ !== null;
  }

  /** Rebuild the options when the list or the current target changed. Returns true if the DOM changed. */
  refresh(current: number | null = Number.parseInt(this.select_.value, 10) || null, sim?: SimulationManager): boolean {
    if (sim) {
      this.sim_ = sim;
    }
    const result = pickerEntries(this.sim_, this.query_, current);
    const key = `${this.query_}|${result.more}|${result.entries.map((entry) => `${entry.noradId}:${entry.name}`).join('|')}`;

    if (key === this.key_) {
      return false;
    }
    this.key_ = key;
    const placeholder = this.placeholder_ === undefined ? '' : `<option value="">${escapeHtml(this.placeholder_)}</option>`;
    const previous = this.select_.value;

    this.select_.innerHTML = placeholder + pickerOptionsHtml(result);
    if (previous !== '' && result.entries.some((entry) => String(entry.noradId) === previous)) {
      this.select_.value = previous;
    }

    return true;
  }

  dispose(): void {
    this.select_.removeEventListener('change', this.boundChange_);
    this.input_?.removeEventListener('input', this.boundInput_);
    this.input_?.remove();
    this.input_ = null;
  }

  private mountSearch_(): void {
    const input = document.createElement('input');

    input.type = 'search';
    input.className = 'form-control form-control-sm mb-1 sr-picker-search';
    input.placeholder = 'Search name or NORAD id';
    input.setAttribute('aria-label', 'Search satellites by name or NORAD id');
    input.autocomplete = 'off';
    input.addEventListener('input', this.boundInput_);
    this.select_.before(input);
    this.input_ = input;
  }

  private onInput_(): void {
    this.query_ = this.input_?.value ?? '';
    const current = Number.parseInt(this.select_.value, 10) || null;

    this.refresh(current);
  }

  /** Picking a member hydrates it, so the antenna and the tabs find a full satellite behind the id. */
  private onChange_(): void {
    const norad = Number.parseInt(this.select_.value, 10);

    if (Number.isFinite(norad)) {
      this.sim_.getSatByNoradId(norad);
    }
  }
}
