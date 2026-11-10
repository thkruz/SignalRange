/**
 * @file part-closeup-modal - Close-up of one part of the site (Phase 38.1, WP12)
 * @description A painted close-up with a live SVG overlay: connectors with seat
 * depth, corrosion and water, cable damage once revealed, part regions. Selecting
 * a point is free; only an action button costs sim time, and every button shows
 * its cost first. The plant decides what happens and the panel shows the latest
 * result large with the history (repeats collapsed) beneath it.
 */

import { closeupFor } from '@app/campaigns/frontline/site-hotspots';
import { closeupImageFor } from '@app/campaigns/frontline/site-layers';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { STATION_TAB_PREFIX } from '@app/pages/mission-control/antenna-page-registry';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantWeather } from '@app/physical/physical-plant-types';
import { DISRUPTIVE_ACTIONS, SWAP_COSTS_S, VERB_COSTS_S } from '@app/physical/plant-verb-rules';
import { SKYLINK_TAB_ID } from '@app/plugins-builtin/terminal-app/skylink-tab-id';
import { getAssetUrl } from '@app/utils/asset-url';
import { activeLayers, evidenceCallouts } from './closeup-evidence';
import { pointAlong, shapeCentre, shapeSvg, svgOpen, VIEW_W, viewHeight } from './plant-svg';
import {
  escapeHtml,
  formatCost,
  formatSimTime,
  internetPaths,
  type PlantTool,
  partPip,
  plantUiState,
  runVerb,
  targetType,
  toolAppliesTo,
  type UiVerb,
  VERB_LABELS,
  verbsFor,
} from './plant-ui-helpers';
import type { CloseupDef, CloseupId } from './site-types';
import './plant-ui.css';

interface LogLine {
  t: string;
  verb: string;
  target: string;
  /** Plant id of the target, used to keep each close-up's history to its own items */
  targetId: string;
  observation: string;
  cost: string;
  count: number;
}

type MeterTool = Exclude<PlantTool, 'hand'>;

const METER_LABELS: Record<MeterTool, { action: string; log: string }> = {
  multimeter: { action: 'Measure (multimeter)', log: 'Multimeter' },
  'cable-tester': { action: 'Test cable (cable tester)', log: 'Cable tester' },
};
const METER_TOOLS: MeterTool[] = ['multimeter', 'cable-tester'];

/** Observation first, then fixes; the disruptive ones are drawn last and styled secondary */
const VERB_ORDER: UiVerb[] = ['inspect', 'wiggle', 'feel', 'tighten', 'seal', 'refuel', 'setMode', 'clearSnow', 'removeNet', 'reroute', 'reseat', 'swap', 'powerCycle'];

const PANEL_W = 340;
const FRAME_PAD = 12;
const TITLE_H = 44;
const MIN_BODY_H = 520;

export class PartCloseupModal extends DraggableModal {
  private static readonly MODAL_ID = 'part-closeup-modal';
  private static instance_: PartCloseupModal | null = null;

  private def_: CloseupDef | null = null;
  private selected_: string | null = null;
  /** The exact region, probe or cable the player selected; only this one keeps its outline */
  private selectedKey_: string | null = null;
  /** Friendly name of the selection (never an internal id) */
  private selectedLabel_ = '';
  private log_: LogLine[] = [];
  private showPoints_ = false;
  private opener_: Element | null = null;
  private lastOverlay_ = '';
  private lastImage_ = '';
  private lastRenderMs_ = 0;
  private subscribed_ = false;
  private readonly boundUpdate_: () => void;
  private readonly boundKeydown_: (event: KeyboardEvent) => void;

  private constructor() {
    super(PartCloseupModal.MODAL_ID, { title: 'Close-up' });
    this.boundUpdate_ = this.onUpdate_.bind(this);
    this.boundKeydown_ = this.onKeydown_.bind(this);
  }

  static getInstance(): PartCloseupModal {
    PartCloseupModal.instance_ ??= new PartCloseupModal();

    return PartCloseupModal.instance_;
  }

  static destroy(): void {
    PartCloseupModal.instance_?.unsubscribe_();
    document.getElementById(`${PartCloseupModal.MODAL_ID}-container`)?.remove();
    PartCloseupModal.instance_ = null;
  }

  /** The id of the close-up on screen, or null when closed */
  currentId(): CloseupId | null {
    return this.isOpen() ? (this.def_?.id ?? null) : null;
  }

  isOpen(): boolean {
    return this.boxEl !== null && this.boxEl.style.display !== 'none';
  }

  showCloseup(id: CloseupId): void {
    const plant = PhysicalPlantService.plantOrNull();
    const def = closeupFor(id, plant?.getSiteMode() ?? 'camp', (target) => plant?.getTargetTraits(target) != null);
    if (this.def_?.id !== id) {
      this.selected_ = null;
      this.selectedKey_ = null;
      this.selectedLabel_ = '';
      this.lastOverlay_ = '';
    }
    if (!this.isOpen()) {
      const active = document.activeElement;
      this.opener_ = active && active !== document.body ? active : null;
    }
    this.def_ = def;
    this.open(() => {
      const title = document.querySelector(`#${PartCloseupModal.MODAL_ID} .draggable-box__title h3`);
      if (title) {
        title.textContent = def.title;
      }
      this.render_();
      this.bindOnce_();
    });
    document.removeEventListener('keydown', this.boundKeydown_);
    document.addEventListener('keydown', this.boundKeydown_);
    this.subscribe_();
  }

  override close(cb?: () => void): void {
    const id = this.def_?.id;
    this.unsubscribe_();
    document.removeEventListener('keydown', this.boundKeydown_);
    super.close(cb);
    this.returnFocus_(id);
  }

  /** Focus goes back to the hotspot that opened the close-up */
  private returnFocus_(id: CloseupId | undefined): void {
    let target: Element | null = this.opener_?.isConnected ? this.opener_ : null;
    if (!target && id) {
      target = document.querySelector(`[data-hotspot][data-closeup="${id}"]`);
    }
    this.opener_ = null;
    (target as HTMLElement | SVGElement | null)?.focus?.();
  }

  /** Fixed profile-style modal: not draggable, a labelled dialog with an accessible close button */
  protected override onOpen(): void {
    super.onOpen();
    this.draggie?.disable();
    const close = this.boxEl?.querySelector<HTMLElement>(`#${PartCloseupModal.MODAL_ID}-close`);
    if (close) {
      close.setAttribute('role', 'button');
      close.setAttribute('aria-label', 'Close close-up');
      close.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>';
      close.tabIndex = 0;
      close.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.close();
        }
      };
    }
    const dialog = this.boxEl?.querySelector(`#${PartCloseupModal.MODAL_ID}`);
    dialog?.setAttribute('role', 'dialog');
    dialog?.setAttribute('aria-modal', 'true');
    dialog?.setAttribute('aria-label', 'Part close-up');
  }

  private onKeydown_(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) {
      event.stopPropagation();
      this.close();
    }
  }

  private subscribe_(): void {
    if (!this.subscribed_) {
      EventBus.getInstance().on(Events.UPDATE, this.boundUpdate_);
      this.subscribed_ = true;
    }
  }

  private unsubscribe_(): void {
    if (this.subscribed_) {
      EventBus.getInstance().off(Events.UPDATE, this.boundUpdate_);
      this.subscribed_ = false;
    }
  }

  private onUpdate_(): void {
    if (Date.now() - this.lastRenderMs_ < 1000) {
      return;
    }
    this.render_();
  }

  protected getModalContentHtml(): string {
    return `
      <div class="pp-closeup">
        <div class="pp-closeup-body">
          <div class="pp-stage-box" id="pcu-stagebox">
            <div class="pp-stage" id="pcu-stage"><img id="pcu-img" alt="" draggable="false"/><div class="pp-layers" id="pcu-layers"></div><div class="pp-overlay" id="pcu-overlay"></div><div class="pp-evidence" id="pcu-evidence"></div></div>
            <div class="pp-callout" id="pcu-callout" role="presentation" hidden></div>
          </div>
          <div class="pp-side">
            <h2 class="pp-item-title" id="pcu-title"></h2>
            <div>
              <div class="pp-section-title">Selected</div>
              <div class="pp-target" id="pcu-target">Nothing selected</div>
              <div class="pp-tags" id="pcu-tags"></div>
            </div>
            <div>
              <div class="pp-section-title">Actions</div>
              <div class="pp-verbs" id="pcu-verbs"></div>
            </div>
            <div>
              <div class="pp-section-title">Latest result</div>
              <div class="pp-latest" id="pcu-latest" aria-live="polite"></div>
            </div>
            <div class="pp-history-wrap">
              <div class="pp-section-title">History</div>
              <div class="pp-log" id="pcu-log"></div>
            </div>
            <div class="pp-foot">
              <label class="pp-foot-row"><input id="pcu-points" type="checkbox" /><span>Show interaction points</span></label>
              <details class="pp-trainer-foot">
                <summary>Trainer</summary>
                <label class="pp-foot-row"><input id="pcu-xray" type="checkbox" /><span>Show hidden state</span></label>
              </details>
            </div>
          </div>
        </div>
      </div>`;
  }

  private bound_ = false;

  private bindOnce_(): void {
    const root = this.root_();
    if (!root || this.bound_) {
      return;
    }
    this.bound_ = true;
    root.addEventListener('click', (ev) => this.onClick_(ev));
    root.addEventListener('keydown', (ev) => this.onRootKeydown_(ev));
    root.addEventListener('mouseover', (ev) => this.showCallout_(ev.target as Element));
    root.addEventListener('focusin', (ev) => this.showCallout_(ev.target as Element));
    root.addEventListener('mouseout', () => this.hideCallout_());
    root.addEventListener('focusout', () => this.hideCallout_());
    const xray = root.querySelector<HTMLInputElement>('#pcu-xray');
    xray?.addEventListener('change', () => {
      plantUiState.xray = xray.checked;
      this.render_();
    });
    const points = root.querySelector<HTMLInputElement>('#pcu-points');
    points?.addEventListener('change', () => {
      this.showPoints_ = points.checked;
      this.render_();
    });
  }

  private root_(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`#${PartCloseupModal.MODAL_ID} .pp-closeup`);
  }

  private onClick_(ev: Event): void {
    const el = ev.target as HTMLElement;
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const measureBtn = el.closest<HTMLElement>('[data-measure]');
    if (measureBtn && this.selected_) {
      this.measure_(plant, measureBtn.dataset.measure as MeterTool, this.selected_);

      return;
    }
    const verbBtn = el.closest<HTMLElement>('[data-verb]');
    if (verbBtn && this.selected_) {
      this.perform_(plant, verbBtn.dataset.verb as UiVerb, this.selected_);

      return;
    }
    const hit = el.closest<SVGElement>('[data-target]');
    if (hit) {
      this.select_(hit);
    }
  }

  private onRootKeydown_(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') {
      return;
    }
    const hit = (ev.target as Element).closest<SVGElement>('[data-target]');
    if (hit) {
      ev.preventDefault();
      this.select_(hit);
    }
  }

  /** Selecting is free: it never touches the clock */
  private select_(hit: SVGElement): void {
    const target = hit.dataset.target as string;
    this.selected_ = target;
    this.selectedKey_ = hit.dataset.sel ?? target;
    this.selectedLabel_ = (hit.dataset.label ?? '').split(': internet')[0];
    if (hit.dataset.opensApp === '1') {
      EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: `${STATION_TAB_PREFIX}${SKYLINK_TAB_ID}` });
    }
    this.render_();
  }

  /** Affordances of the selected region, when the data restricts them */
  private allows_(what: string): boolean {
    const aff = this.def_?.regions.find((r) => r.id === this.selectedKey_)?.affordances;

    return !aff || (aff as string[]).includes(what);
  }

  private meterTools_(plant: PhysicalPlantManager, target: string): MeterTool[] {
    return METER_TOOLS.filter((tool) => toolAppliesTo(plant, tool, target) && this.allows_(tool));
  }

  private measure_(plant: PhysicalPlantManager, tool: MeterTool, target: string): void {
    if (!toolAppliesTo(plant, tool, target)) {
      return;
    }
    const t = formatSimTime(plant.getTimeSeconds());
    const result = plant.measure(tool, target);
    this.pushLog_({
      t,
      verb: METER_LABELS[tool].log,
      target: this.targetName_(plant, target),
      targetId: target,
      observation: result.observation,
      cost: costText(result),
      count: 1,
    });
  }

  private perform_(plant: PhysicalPlantManager, verb: UiVerb, target: string): void {
    const t = formatSimTime(plant.getTimeSeconds());
    const result = runVerb(plant, verb, target);
    this.pushLog_({ t, verb: VERB_LABELS[verb], target: this.targetName_(plant, target), targetId: target, observation: result.observation, cost: costText(result), count: 1 });
  }

  private targetName_(plant: PhysicalPlantManager, target: string): string {
    return this.selectedLabel_ || plant.getLabel(target);
  }

  /** A repeat of the previous line (same action, target, cost and answer) bumps its count instead of adding a row */
  private pushLog_(line: LogLine): void {
    const last = this.viewLog_().at(-1);
    if (last && last.verb === line.verb && last.target === line.target && last.observation === line.observation && last.cost === line.cost) {
      last.count += 1;
      last.t = line.t;
    } else {
      this.log_.push(line);
      this.log_ = this.log_.slice(-60);
    }
    this.render_();
  }

  // ------------------------------------------------------------------ render

  private render_(): void {
    const root = this.root_();
    const plant = PhysicalPlantService.plantOrNull();
    const def = this.def_;
    if (!root || !plant || !def) {
      return;
    }
    this.lastRenderMs_ = Date.now();
    this.sizeFrame_(def);
    const img = root.querySelector<HTMLImageElement>('#pcu-img')!;
    const weather = plant.getWeather();
    const image = closeupImageFor(def, weather);
    if (this.lastImage_ !== image) {
      this.lastImage_ = image;
      img.src = getAssetUrl(image);
      img.alt = def.title;
    }
    this.renderEvidence_(root, plant, def, weather);
    const overlay = root.querySelector<HTMLElement>('#pcu-overlay')!;
    const html = this.overlaySvg_(plant, def);
    if (html !== this.lastOverlay_) {
      const focused = (document.activeElement as HTMLElement | null)?.closest?.('#pcu-overlay [data-sel]') as HTMLElement | null;
      const focusedKey = focused?.dataset.sel;
      this.lastOverlay_ = html;
      overlay.innerHTML = html;
      if (focusedKey) {
        overlay.querySelector<HTMLElement | SVGElement>(`[data-sel="${focusedKey}"]`)?.focus();
      }
    }
    root.querySelector('#pcu-title')!.textContent = def.title;
    this.renderSide_(root, plant);
    const xray = root.querySelector<HTMLInputElement>('#pcu-xray');
    if (xray) {
      xray.checked = plantUiState.xray;
    }
    const points = root.querySelector<HTMLInputElement>('#pcu-points');
    if (points) {
      points.checked = this.showPoints_;
    }
  }

  /** Paint layers (always, when the fault is present) and callouts (only after the reveal) */
  private renderEvidence_(root: HTMLElement, plant: PhysicalPlantManager, def: CloseupDef, weather: PlantWeather): void {
    const pct = (v: number): string => `${(v * 100).toFixed(3)}%`;
    const layers = activeLayers(plant, def, weather)
      .map(
        ({ layer, src }) =>
          `<img class="pp-layer" data-layer="${layer.id}" alt="" draggable="false" src="${getAssetUrl(src)}" style="left:${pct(layer.bbox[0])};top:${pct(layer.bbox[1])};width:${pct(layer.bbox[2])};height:${pct(layer.bbox[3])}"/>`
      )
      .join('');
    const layerHost = root.querySelector<HTMLElement>('#pcu-layers');
    if (layerHost && layerHost.innerHTML !== layers) {
      layerHost.innerHTML = layers;
    }
    const callouts = evidenceCallouts(plant, def, weather, plantUiState.xray)
      .map((c) => {
        const flip = c.x > 0.62 ? ' pp-evidence-left' : '';

        return `<div class="pp-evidence-item${flip}" data-evidence="${escapeHtml(c.key)}" style="left:${pct(c.x)};top:${pct(c.y)}"><span class="pp-evidence-ring"></span><span class="pp-evidence-label">${escapeHtml(c.text)}</span></div>`;
      })
      .join('');
    const host = root.querySelector<HTMLElement>('#pcu-evidence');
    if (host && host.innerHTML !== callouts) {
      host.innerHTML = callouts;
    }
  }

  /** The frame is sized around the fitted painting plus the right panel, and only changes with the close-up */
  private sizeFrame_(def: CloseupDef): void {
    const modal = document.getElementById(PartCloseupModal.MODAL_ID);
    if (!modal) {
      return;
    }
    const cs = getComputedStyle(document.documentElement);
    const vw = Number.parseFloat(cs.getPropertyValue('--mc-viewport-width')) || window.innerWidth;
    const vh = Number.parseFloat(cs.getPropertyValue('--mc-viewport-height')) || window.innerHeight;
    const maxW = Math.min(1500, vw - 32);
    const maxBodyH = Math.min(900, vh - 48) - TITLE_H;
    const availW = maxW - PANEL_W - FRAME_PAD * 3;
    const availH = maxBodyH - FRAME_PAD * 2;
    const imgW = Math.floor(Math.min(availW, availH * def.aspect));
    const imgH = Math.floor(imgW / def.aspect);
    const bodyH = Math.max(imgH + FRAME_PAD * 2, Math.min(MIN_BODY_H, maxBodyH));
    modal.style.setProperty('--pcu-img-w', `${imgW}px`);
    modal.style.setProperty('--pcu-img-h', `${imgH}px`);
    modal.style.setProperty('--pcu-w', `${imgW + PANEL_W + FRAME_PAD * 3}px`);
    modal.style.setProperty('--pcu-h', `${bodyH + TITLE_H}px`);
  }

  private showCallout_(el: Element): void {
    const root = this.root_();
    const hit = el.closest?.('#pcu-overlay [data-label]') as HTMLElement | null;
    const box = root?.querySelector<HTMLElement>('#pcu-stagebox');
    const callout = root?.querySelector<HTMLElement>('#pcu-callout');
    if (!hit || !box || !callout) {
      return;
    }
    callout.textContent = hit.dataset.label ?? '';
    callout.hidden = false;
    const b = box.getBoundingClientRect();
    const r = hit.getBoundingClientRect();
    const w = callout.offsetWidth;
    const left = Math.max(4, Math.min(b.width - w - 4, r.left - b.left + r.width / 2 - w / 2));
    const above = r.top - b.top - callout.offsetHeight - 8;
    callout.style.left = `${left}px`;
    callout.style.top = `${above >= 4 ? above : r.bottom - b.top + 8}px`;
  }

  private hideCallout_(): void {
    const callout = this.root_()?.querySelector<HTMLElement>('#pcu-callout');
    if (callout) {
      callout.hidden = true;
    }
  }

  private renderSide_(root: HTMLElement, plant: PhysicalPlantManager): void {
    const target = this.selected_;
    root.querySelector('#pcu-target')!.textContent = target ? this.targetName_(plant, target) : 'Select a part, connector or cable in the picture.';
    root.querySelector('#pcu-tags')!.innerHTML = target ? this.tagsHtml_(plant, target) : '';
    root.querySelector('#pcu-verbs')!.innerHTML = target ? this.actionsHtml_(plant, target) : '<span class="pp-hint">Selecting is free. Actions take time.</span>';
    this.renderLog_(root);
  }

  private actionsHtml_(plant: PhysicalPlantManager, target: string): string {
    const verbs = verbsFor(plant, target)
      .filter((verb) => this.allows_(verb))
      .sort((a, b) => VERB_ORDER.indexOf(a) - VERB_ORDER.indexOf(b));
    const observe: string[] = [];
    const fix: string[] = [];
    const disrupt: string[] = [];
    const meters = this.meterTools_(plant, target).map(
      (tool) =>
        `<button type="button" class="btn btn-sm btn-outline-primary pp-act" data-measure="${tool}">${METER_LABELS[tool].action}<span class="pp-cost"> &middot; ${formatCost(VERB_COSTS_S[tool])}</span></button>`
    );
    for (const verb of verbs) {
      const cost = verbCost_(plant, verb, target);
      if (DISRUPTIVE_ACTIONS.has(verb)) {
        const spare = verb === 'swap' ? sparesText_(plant.getSwapSpares(target)) : '';
        const none = verb === 'swap' && plant.getSwapSpares(target) <= 0;
        disrupt.push(
          `<button type="button" class="btn btn-sm btn-outline-secondary pp-act pp-act-disruptive${spare ? ' pp-act-wide' : ''}" data-verb="${verb}"${none ? ' disabled' : ''}>${VERB_LABELS[verb]}<span class="pp-cost"> &middot; ${formatCost(cost)}${spare}</span></button>`
        );
      } else {
        const list = verb === 'inspect' || verb === 'wiggle' || verb === 'feel' ? observe : fix;
        list.push(
          `<button type="button" class="btn btn-sm btn-outline-primary pp-act" data-verb="${verb}">${VERB_LABELS[verb]}<span class="pp-cost"> &middot; ${formatCost(cost)}</span></button>`
        );
      }
    }
    const all = [...observe, ...meters, ...fix, ...disrupt];

    return all.length === 0 ? '<span class="pp-hint">Nothing to do here.</span>' : all.join('');
  }

  /** Plant ids this close-up shows: its regions, probes and cables */
  private ownTargets_(): Set<string> {
    const def = this.def_;
    return new Set(def ? [...def.regions.map((r) => r.target), ...def.probes.map((p) => p.target), ...def.cables.map((c) => c.target)] : []);
  }

  /** The history for the open close-up only; other close-ups keep theirs in log_ */
  private viewLog_(): LogLine[] {
    const own = this.ownTargets_();
    return this.log_.filter((l) => own.has(l.targetId));
  }

  private renderLog_(root: HTMLElement): void {
    const view = this.viewLog_();
    const latest = view.at(-1);
    root.querySelector('#pcu-latest')!.innerHTML = latest
      ? `<div class="pp-latest-meta">${latest.t} &middot; ${escapeHtml(latest.verb)} &middot; ${escapeHtml(latest.target)} &middot; ${escapeHtml(latest.cost)}${latest.count > 1 ? ` <b>&times;${latest.count}</b>` : ''}</div><div class="pp-latest-text">${escapeHtml(latest.observation)}</div>`
      : '<span class="pp-hint">No actions yet.</span>';
    root.querySelector('#pcu-log')!.innerHTML = view
      .slice(0, -1)
      .reverse()
      .map(
        (l) =>
          `<div class="pp-log-row"><div class="pp-log-meta">${l.t} &middot; ${escapeHtml(l.verb)} &middot; ${escapeHtml(l.target)} &middot; ${escapeHtml(l.cost)}${l.count > 1 ? ` &middot; &times;${l.count}` : ''}</div><div>${escapeHtml(l.observation)}</div></div>`
      )
      .join('');
  }

  /** State tags: neutral for normal state, warn only for problems the player can see */
  private tagsHtml_(plant: PhysicalPlantManager, target: string): string {
    if (targetType(plant, target) !== 'part') {
      return '';
    }
    const tags: string[] = [];
    const state = plant.getPartState(target);
    const faults = plant.getFaults().filter((f) => f.target === target);
    const seen = (fact: string): boolean => plantUiState.xray || plant.isFactRevealed(target, fact);
    if (seen('snow') && faults.some((f) => f.kind === 'snow')) tags.push('<span class="pp-tag pp-tag-warn">Snow on dish</span>');
    if (seen('net') && faults.some((f) => f.kind === 'net')) tags.push('<span class="pp-tag pp-tag-warn">Net over dish</span>');
    if (state?.kind === 'generator') {
      tags.push(`<span class="pp-tag">${state.powered ? 'Running' : 'Stopped'}</span>`, `<span class="pp-tag">Fuel ${(state.fuelL ?? 0).toFixed(1)} L</span>`);
    } else if (state?.powered && state.lit) {
      tags.push('<span class="pp-tag">Lit</span>');
    }
    if (state && !state.powered) {
      tags.push(`<span class="pp-tag pp-tag-warn">${state.rebooting ? 'Rebooting' : 'No power'}</span>`);
    }

    return tags.join('');
  }

  private overlaySvg_(plant: PhysicalPlantManager, def: CloseupDef): string {
    const h = viewHeight(def.aspect);
    const parts: string[] = [svgOpen(def.aspect, this.showPoints_ ? 'pp-show-points' : '')];
    const attrs = (target: string, sel: string, label: string): string =>
      `data-target="${target}" data-sel="${sel}" data-label="${escapeHtml(label)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}"`;

    for (const cable of def.cables) {
      const points = cable.points.map(([x, y]) => `${(x * VIEW_W).toFixed(1)},${(y * h).toFixed(1)}`).join(' ');
      const sel = this.selectedKey_ === cable.target ? ' pp-selected' : '';
      const [mx, my] = pointAlong(cable.points, 0.5);
      parts.push(
        `<g class="pp-point pp-cable${sel}" ${attrs(cable.target, cable.target, cable.label)}><polyline class="pp-cable-line" points="${points}" stroke-width="26"/><circle class="pp-marker" cx="${(mx * VIEW_W).toFixed(1)}" cy="${(my * h).toFixed(1)}" r="7"/></g>`
      );
    }

    for (const region of def.regions) {
      const sel = this.selectedKey_ === region.id ? ' pp-selected' : '';
      const [cx, cy] = shapeCentre(region.shape, def.aspect);
      const pip = targetType(plant, region.target) === 'part' ? partPip(plant, region.target) : 'ok';
      const app = region.opensApp ? ' data-opens-app="1"' : '';
      const label = region.opensApp ? `${region.label}: internet ${internetPaths(plant).up ? 'up' : 'down'}` : region.label;
      const problem = pip === 'ok' ? '' : `<circle class="pp-pip-svg ${pip}" cx="${(cx + 12).toFixed(1)}" cy="${(cy - 12).toFixed(1)}" r="8"/>`;
      parts.push(
        `<g class="pp-point pp-region${sel}" ${attrs(region.target, region.id, label)}${app}>${shapeSvg(region.shape, def.aspect, 'pp-region-box', 'pp-region-box')}<circle class="pp-marker" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7"/>${problem}</g>`
      );
    }

    for (const probe of def.probes) {
      parts.push(this.probeSvg_(probe, h, attrs(probe.target, probe.id, probe.label)));
    }
    parts.push('</svg>');

    return parts.join('');
  }

  private probeSvg_(probe: CloseupDef['probes'][number], h: number, attrs: string): string {
    const cx = probe.x * VIEW_W;
    const cy = probe.y * h;
    const sel = this.selectedKey_ === probe.id ? ' pp-selected' : '';

    return `<g class="pp-point pp-probe${sel}" ${attrs}><circle class="pp-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="22"/><circle class="pp-marker" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7"/></g>`;
  }
}

function verbCost_(plant: PhysicalPlantManager, verb: UiVerb, target: string): number {
  if (verb === 'swap') {
    return SWAP_COSTS_S[targetType(plant, target) ?? 'part'];
  }

  return VERB_COSTS_S[verb];
}

function sparesText_(left: number): string {
  return left <= 0 ? ' &middot; no spares left' : ` &middot; uses 1 of ${left} spare${left === 1 ? '' : 's'}`;
}

function costText(result: { costSeconds: number; downtimeSeconds?: number }): string {
  const down = result.downtimeSeconds ? `, ${formatCost(result.downtimeSeconds)} down` : '';

  return `${formatCost(result.costSeconds)}${down}`;
}
