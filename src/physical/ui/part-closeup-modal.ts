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
import { displayViewport } from '@app/game-menu/display-viewport';
import type { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantWeather } from '@app/physical/physical-plant-types';
import { DISRUPTIVE_ACTIONS, SWAP_COSTS_S, VERB_COSTS_S } from '@app/physical/plant-verb-rules';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { getAssetUrl } from '@app/utils/asset-url';
import { activeLayers, evidenceCallouts } from './closeup-evidence';
import { type FaceTone, fpPlate, fpPush, fpSelector } from './faceplate-kit';
import { FaceplateLights, type LedAnchor } from './faceplate-lights';
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
import './faceplate.css';
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

const PANEL_W = 360;
const THROW_MS = 650;
const CONTROL_SELECTOR = '[data-verb], [data-measure], [data-equipment-mode], [data-open-laptop]';
const FRAME_PAD = 12;
const TITLE_H = 44;
const MIN_BODY_H = 520;

export class PartCloseupModal extends DraggableModal {
  private readonly immersive_ = new ImmersiveView();
  private lights_: FaceplateLights | null = null;
  /** Controls the player just used, shown pressed or thrown for a moment; keyed by part and action, each with its own timer */
  private readonly thrown_ = new Map<string, ReturnType<typeof setTimeout>>();
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
    PartCloseupModal.instance_?.close();
    PartCloseupModal.instance_?.clearThrown_();
    PartCloseupModal.instance_?.lights_?.dispose();
    PartCloseupModal.instance_?.unsubscribe_();
    document.getElementById(`${PartCloseupModal.MODAL_ID}-container`)?.remove();
    PartCloseupModal.instance_ = null;
  }

  /** The id of the close-up on screen, or null when closed */
  currentId(): CloseupId | null {
    return this.isOpen() ? (this.def_?.id ?? null) : null;
  }

  selectTarget(partId: string): void {
    const point = this.root_()?.querySelector<SVGElement>(`[data-target="${CSS.escape(partId)}"]`);
    if (point) this.select_(point);
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
      if (this.boxEl) this.immersive_.open(this.boxEl, def.title, 'equipment', () => this.close());
      this.buildLights_();
    });
    document.removeEventListener('keydown', this.boundKeydown_, true);
    document.addEventListener('keydown', this.boundKeydown_, true);
    this.subscribe_();
  }

  override close(cb?: () => void): void {
    this.clearThrown_();
    this.immersive_.close();
    const id = this.def_?.id;
    this.unsubscribe_();
    document.removeEventListener('keydown', this.boundKeydown_, true);
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
      event.preventDefault();
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

  /** The status lights this close-up's faceplate carries: services whose path runs through one of its parts */
  private buildLights_(): void {
    this.lights_?.dispose();
    this.lights_ = null;
    const host = this.root_()?.querySelector<HTMLElement>('#pcu-indicators');
    if (!host) return;
    const artHost = this.root_()?.querySelector<HTMLElement>('#pcu-lenses') ?? null;
    const model = PhysicalPlantService.servicesOrNull();
    const targets = new Set(this.def_?.regions.map((region) => region.target));
    const ids: string[] = [];
    const anchors: Record<string, LedAnchor | undefined> = {};
    for (const id of model?.getServiceIds() ?? []) {
      const path = model!.getPath(id);
      if (!path || ![path.terminalPartId, ...path.localPartIds.filter((part) => !part.includes('laptop'))].some((part) => targets.has(part))) continue;
      ids.push(id);
      const led = this.def_?.leds?.find((anchor) => [path.terminalPartId, ...path.localPartIds].includes(anchor.target));
      if (led) anchors[id] = { x: led.x, y: led.y };
    }
    this.lights_ = new FaceplateLights(
      host,
      artHost,
      () => PhysicalPlantService.servicesOrNull(),
      () => PhysicalPlantService.plantOrNull()?.getTimeSeconds() ?? 0,
      (seconds) => PhysicalPlantService.plantOrNull()?.spendTime(seconds)
    );
    this.lights_.setServices(ids, anchors);
  }

  protected getModalContentHtml(): string {
    return `
      <div class="pp-closeup">
        <div class="pp-closeup-body">
          <div class="pp-stage-box" id="pcu-stagebox">
            <div class="pp-stage" id="pcu-stage"><img id="pcu-img" alt="" draggable="false"/><div class="pp-layers" id="pcu-layers"></div><div class="pp-overlay" id="pcu-overlay"></div><div class="pp-evidence" id="pcu-evidence"></div><div class="pp-lenses" id="pcu-lenses"></div></div>
            <div class="pp-callout" id="pcu-callout" role="presentation" hidden></div>
          </div>
          <div class="pp-side">
            <h2 class="pp-item-title" id="pcu-title"></h2>
            <div>
              <div class="pp-section-title">Selected</div>
              <div class="pp-target" id="pcu-target">Nothing selected</div>
              <div class="pp-tags" id="pcu-tags"></div>
            </div>
            <div class="fp-panel" id="pcu-faceplate">
              <span class="fp-screw fp-screw-tl" aria-hidden="true"></span><span class="fp-screw fp-screw-tr" aria-hidden="true"></span><span class="fp-screw fp-screw-bl" aria-hidden="true"></span><span class="fp-screw fp-screw-br" aria-hidden="true"></span>
              <div id="pcu-indicators"></div>
              <div class="fp-controls" role="group" aria-label="Controls">
                <div class="pp-verbs" id="pcu-verbs"></div>
              </div>
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
    if (el.closest('[data-open-laptop]')) {
      this.close();
      EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'field-service', desktop: true });
      return;
    }
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const lens = el.closest<HTMLElement>('[data-fp-led]');
    if (lens) {
      // FaceplateLights has already taken the look and patched the lens; show the reading beside it
      this.showCallout_(lens);
      return;
    }
    const mode = el.closest<HTMLElement>('[data-equipment-mode]');
    if (mode && this.selected_) {
      const t = formatSimTime(plant.getTimeSeconds());
      const whBefore = storedWh_(plant);
      const result = plant.setPartMode(this.selected_, mode.dataset.equipmentMode!);
      this.pushLog_({
        t,
        verb: 'Set mode',
        target: plant.getLabel(this.selected_),
        targetId: this.selected_,
        observation: result.observation,
        cost: costText(result, whBefore - storedWh_(plant)),
        count: 1,
      });
      return;
    }
    const measureBtn = el.closest<HTMLElement>('[data-measure]');
    if (measureBtn && this.selected_) {
      this.markThrown_(measureBtn);
      this.measure_(plant, measureBtn.dataset.measure as MeterTool, this.selected_);

      return;
    }
    const verbBtn = el.closest<HTMLElement>('[data-verb]');
    if (verbBtn && this.selected_) {
      this.markThrown_(verbBtn);
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
    this.render_();
  }

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
    const whBefore = storedWh_(plant);
    const result = plant.measure(tool, target);
    this.pushLog_({
      t,
      verb: METER_LABELS[tool].log,
      target: this.targetName_(plant, target),
      targetId: target,
      observation: result.observation,
      cost: costText(result, whBefore - storedWh_(plant)),
      count: 1,
    });
  }

  private perform_(plant: PhysicalPlantManager, verb: UiVerb, target: string): void {
    const t = formatSimTime(plant.getTimeSeconds());
    const whBefore = storedWh_(plant);
    const result = runVerb(plant, verb, target);
    this.pushLog_({
      t,
      verb: VERB_LABELS[verb],
      target: this.targetName_(plant, target),
      targetId: target,
      observation: result.observation,
      cost: costText(result, whBefore - storedWh_(plant)),
      count: 1,
    });
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
    this.lights_?.sync();
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
    const maxW = displayViewport().width;
    const maxBodyH = displayViewport().height - 48 - TITLE_H;
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
    const hit = el.closest?.('#pcu-overlay [data-label], #pcu-lenses [data-label]') as HTMLElement | null;
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
    this.setHtmlIfChanged_(root.querySelector('#pcu-tags')!, target ? this.tagsHtml_(plant, target) : '');
    this.setHtmlIfChanged_(root.querySelector('#pcu-verbs')!, target ? this.actionsHtml_(plant, target) : '<span class="pp-hint">Selecting is free. Actions take time.</span>');
    this.renderLog_(root);
  }

  /**
   * The 1 s refresh must not rebuild the action buttons when nothing changed: a click whose mousedown and mouseup straddle
   * a rebuild lands on a detached button and does nothing (c6-s15-F2, the "Inspect does nothing" reports). The markup is
   * compared with the source signature stored on the element, never with the live innerHTML (the browser re-serialises
   * attributes and entities, so that comparison never matches). A real rebuild puts keyboard focus back on the same control.
   */
  private setHtmlIfChanged_(el: Element, markup: string): void {
    const host = el as HTMLElement;
    if (host.dataset.sig === markup) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && host.contains(active) ? PartCloseupModal.controlKey_(active) : null;
    host.dataset.sig = markup;
    host.innerHTML = markup;
    if (focusKey) {
      [...host.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].find((c) => PartCloseupModal.controlKey_(c) === focusKey && !c.hasAttribute('disabled'))?.focus();
    }
  }

  /** Stable identity of a faceplate control (its data id), used to restore focus after a rebuild */
  private static controlKey_(el: HTMLElement): string | null {
    const c = el.closest<HTMLElement>(CONTROL_SELECTOR);
    if (!c) return null;
    const d = c.dataset;
    if (d.verb) return `verb:${d.verb}`;
    if (d.measure) return `measure:${d.measure}`;
    if (d.equipmentMode) return `mode:${d.equipmentMode}`;

    return 'laptop';
  }

  private actionsHtml_(plant: PhysicalPlantManager, target: string): string {
    const verbs = verbsFor(plant, target)
      .filter((verb) => this.allows_(verb))
      .sort((a, b) => VERB_ORDER.indexOf(a) - VERB_ORDER.indexOf(b));
    const observe: string[] = [];
    const modes = plant.getModeOptions(target);
    if (modes.length) {
      const current = plant.getPartMode(target);
      observe.push(
        fpSelector(
          `${plant.getLabel(target)} mode`,
          modes.map((mode) => ({ id: mode.id, label: mode.label, on: current === mode.id })),
          'data-equipment-mode'
        )
      );
    }
    if (this.def_?.regions.some((region) => region.target === target && region.opensApp)) {
      observe.push(fpPush({ attrs: 'data-open-laptop', label: 'Use laptop', tone: 'port', wide: true, cls: 'pp-act' }));
    }
    const fix: string[] = [];
    const disrupt: string[] = [];
    const meters = this.meterTools_(plant, target).map((tool) =>
      fpPush({
        attrs: `data-measure="${tool}"`,
        label: METER_LABELS[tool].action,
        costHtml: `${formatCost(VERB_COSTS_S[tool])}${energyText_(plant, VERB_COSTS_S[tool])}`,
        tone: 'meter',
        wide: true,
        cls: 'pp-act',
      })
    );
    for (const verb of verbs) {
      const cost = verbCost_(plant, verb, target);
      const costHtml = `${formatCost(cost)}${energyText_(plant, cost)}`;
      if (DISRUPTIVE_ACTIONS.has(verb)) {
        const spare = verb === 'swap' ? sparesText_(plant.getSwapSpares(target)) : '';
        const none = verb === 'swap' && plant.getSwapSpares(target) <= 0;
        disrupt.push(
          fpPush({
            attrs: `data-verb="${verb}"`,
            label: VERB_LABELS[verb],
            costHtml: costHtml + spare,
            tone: 'hazard',
            wide: Boolean(spare),
            disabled: none,
            cls: 'pp-act pp-act-disruptive',
          })
        );
      } else {
        const observing = verb === 'inspect' || verb === 'wiggle' || verb === 'feel';
        const tone: FaceTone = observing ? 'observe' : 'fix';
        (observing ? observe : fix).push(fpPush({ attrs: `data-verb="${verb}"`, label: VERB_LABELS[verb], costHtml, tone, cls: 'pp-act' }));
      }
    }
    const groups: string[] = [];
    const group = (name: string, items: string[]): void => {
      if (items.length > 0) groups.push(`<div class="fp-group">${fpPlate(name)}<div class="fp-group-row">${items.join('')}</div></div>`);
    };
    group('Look and feel', observe);
    group('Meter', meters);
    group('Service', fix);
    group('Hazard: takes it down', disrupt);

    return groups.length === 0 ? '<span class="pp-hint">Nothing to do here.</span>' : groups.join('');
  }

  /**
   * Show a control pressed or thrown for a moment, then settle it back. The class goes on the live button (never into the
   * markup, so it costs no rebuild); the timer is keyed by part and action so selecting another part cannot inherit it.
   */
  private markThrown_(button: HTMLElement): void {
    const key = `${this.selected_ ?? ''}|${PartCloseupModal.controlKey_(button) ?? ''}`;
    clearTimeout(this.thrown_.get(key));
    button.classList.add('fp-thrown');
    this.thrown_.set(
      key,
      setTimeout(() => {
        this.thrown_.delete(key);
        this.root_()
          ?.querySelectorAll<HTMLElement>('#pcu-verbs .fp-thrown')
          .forEach((el) => {
            if (`${this.selected_}|${PartCloseupModal.controlKey_(el)}` === key) el.classList.remove('fp-thrown');
          });
      }, THROW_MS)
    );
  }

  private clearThrown_(): void {
    for (const timer of this.thrown_.values()) clearTimeout(timer);
    this.thrown_.clear();
    this.root_()
      ?.querySelectorAll('#pcu-verbs .fp-thrown')
      .forEach((el) => el.classList.remove('fp-thrown'));
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

function costText(result: { costSeconds: number; downtimeSeconds?: number }, usedWh = 0): string {
  const down = result.downtimeSeconds ? `, ${formatCost(result.downtimeSeconds)} down` : '';
  const energy = usedWh >= 0.05 ? `, ${whText_(usedWh)} of battery used` : '';

  return `${formatCost(result.costSeconds)}${down}${energy}`;
}

function storedWh_(plant: PhysicalPlantManager): number {
  return Object.values(plant.getPowerReadings().socWh).reduce((a, b) => a + b, 0);
}

function whText_(wh: number): string {
  return `${wh >= 10 ? Math.round(wh) : wh.toFixed(1)} Wh`;
}

/** Battery energy a timed action will cost at the present draw (empty when nothing runs off a battery or it rounds to nothing) */
function energyText_(plant: PhysicalPlantManager, seconds: number): string {
  const wh = (plant.getBatteryDrawW() * seconds) / 3600;

  return wh >= 0.05 ? ` &middot; about ${whText_(wh)} of battery` : '';
}
