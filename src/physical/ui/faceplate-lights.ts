/**
 * @file faceplate-lights - The status lights on a close-up (Phase 44, slice 7)
 * @description Replaces the embedded field-service table for device-indicator readings. Each light a service
 * path can show (power, local link, registration) is a lens. A part with a painted LED area carries its lenses
 * over that area of the painting (an anchor in the close-up definition); a part without one keeps them on the
 * side plate. Looking at a lens is the same check the table's "Observe light" button was: it takes a
 * device-indicator sample stamped with scenario time, spends the same 5 s, and the lens then shows that reading
 * with its age and whether it is still current, stale or invalidated. Nothing here reads layer truth: an unread
 * lens is a hatched cover marked LOOK, which is not the same thing as an unlit LED.
 */

import { buildServicePanelModel, CHECK_COST_S, type ServicePanelRow, type ServicePanelService } from '@app/pages/mission-control/tabs/field-service-panel';
import { badgeText, formatClock } from '@app/physical/field-evidence-format';
import { LAYER_LABEL, PROVENANCE_LABEL } from '@app/physical/reading-labels';
import { READABLE, type ServiceModel } from '@app/physical/service-model';
import type { ServiceLayer } from '@app/physical/service-types';
import { fpPlate } from './faceplate-kit';
import { escapeHtml } from './plant-ui-helpers';

const SOURCE = 'device-indicator' as const;

/** Where a part's painted LED area sits on the painting (0..1 of the image) */
export interface LedAnchor {
  x: number;
  y: number;
}

const idPart = (text: string): string => text.replace(/[^a-z0-9]+/giu, '-');

export class FaceplateLights {
  private serviceIds_: string[] = [];
  private anchors_: Record<string, LedAnchor | undefined> = {};
  private builtKey_ = '';
  /** The "Light checked" note, one per service so two banks never share a line */
  private readonly lastLook_ = new Map<string, string>();
  private readonly boundClick_: (event: Event) => void;

  constructor(
    private readonly host_: HTMLElement,
    /** The layer over the painting that carries anchored lenses (null: every lens stays on the plate) */
    private readonly artHost_: HTMLElement | null,
    private readonly getModel_: () => ServiceModel | null,
    private readonly getNow_: () => number,
    /** Spends scenario seconds on a look (a measurement costs time) */
    private readonly spend_: (seconds: number) => void
  ) {
    this.boundClick_ = this.onClick_.bind(this);
    this.host_.addEventListener('click', this.boundClick_);
    this.artHost_?.addEventListener('click', this.boundClick_);
  }

  /** Which services' lights this close-up carries, and where each bank's lenses sit on the painting; a different list rebuilds the banks */
  setServices(ids: string[], anchors: Record<string, LedAnchor | undefined> = {}): void {
    this.serviceIds_ = ids;
    this.anchors_ = this.artHost_ ? anchors : {};
    this.builtKey_ = '';
    this.sync();
  }

  dispose(): void {
    this.host_.removeEventListener('click', this.boundClick_);
    this.artHost_?.removeEventListener('click', this.boundClick_);
    this.host_.replaceChildren();
    this.artHost_?.replaceChildren();
  }

  /** Look at one lens: the same sample, cost and order as the old "Observe light" button */
  look(serviceId: string, layer: ServiceLayer): void {
    const model = this.getModel_();
    if (!model || !READABLE[SOURCE].includes(layer)) return;
    const sample = model.takeSample(serviceId, layer, SOURCE, undefined, 'status');
    this.lastLook_.set(serviceId, `Light checked: ${LAYER_LABEL[layer]}, by ${PROVENANCE_LABEL[SOURCE].toLowerCase()} at ${formatClock(sample.tS)}.`);
    this.spend_(CHECK_COST_S[SOURCE]);
    this.sync();
  }

  private onClick_(event: Event): void {
    const lens = (event.target as HTMLElement).closest<HTMLElement>('[data-fp-led]');
    if (lens?.dataset.svcService && lens.dataset.svcLayer) {
      this.look(lens.dataset.svcService, lens.dataset.svcLayer as ServiceLayer);
    }
  }

  sync(): void {
    const model = this.getModel_();
    if (!model || this.serviceIds_.length === 0) {
      this.host_.hidden = true;
      if (this.artHost_) this.artHost_.hidden = true;

      return;
    }
    const view = buildServicePanelModel(model, this.getNow_(), SOURCE)
      .filter((svc) => this.serviceIds_.includes(svc.id))
      .map((svc) => ({ ...svc, rows: svc.rows.filter((row) => READABLE[SOURCE].includes(row.layer) && !row.endpointId) }));
    this.host_.hidden = view.length === 0;
    const key = view.map((s) => `${s.id}:${this.anchors_[s.id] ? 'art' : 'plate'}:${s.rows.map((r) => r.layer).join(',')}`).join('|');
    if (key !== this.builtKey_) {
      this.builtKey_ = key;
      this.host_.innerHTML = view.map((svc) => this.bankHtml_(svc)).join('');
      if (this.artHost_) {
        this.artHost_.innerHTML = view.map((svc) => this.artRowHtml_(svc)).join('');
        this.artHost_.hidden = !this.artHost_.firstElementChild;
      }
    }
    this.patch_(view);
  }

  private lensHtml_(svc: ServicePanelService, row: ServicePanelRow): string {
    const label = LAYER_LABEL[row.layer];

    return `<button type="button" class="fp-led" data-fp-led data-svc-service="${escapeHtml(svc.id)}" data-svc-layer="${row.layer}" data-led-state="unread" data-label="" aria-label="Look at ${escapeHtml(label)} light" aria-describedby="fp-ro-${idPart(svc.id)}-${row.layer}"><span class="fp-lens" aria-hidden="true"></span><span class="fp-engrave fp-legend">${escapeHtml(label)}</span></button>`;
  }

  /** The lenses laid over the painted LED area of this service's terminal part */
  private artRowHtml_(svc: ServicePanelService): string {
    const anchor = this.anchors_[svc.id];
    if (!anchor) return '';

    return `<div class="fp-lens-row" role="group" aria-label="${escapeHtml(svc.label)} status lights" style="left:${(anchor.x * 100).toFixed(2)}%;top:${(anchor.y * 100).toFixed(2)}%">${svc.rows.map((row) => this.lensHtml_(svc, row)).join('')}</div>`;
  }

  private bankHtml_(svc: ServicePanelService): string {
    const onArt = Boolean(this.anchors_[svc.id]);
    const lenses = onArt ? '' : `<div class="fp-led-row">${svc.rows.map((row) => this.lensHtml_(svc, row)).join('')}</div>`;
    const hint = onArt ? '<p class="fp-hint">The lenses are on the device. Look at one to read it.</p>' : '';
    const readouts = svc.rows.map((row) => `<li id="fp-ro-${idPart(svc.id)}-${row.layer}" data-fp-readout data-svc-layer="${row.layer}"></li>`).join('');

    return `<section class="fp-lights" data-fp-bank="${escapeHtml(svc.id)}" aria-label="${escapeHtml(svc.label)} status lights">${fpPlate(`${svc.label} lights`)}${hint}${lenses}<ul class="fp-readouts">${readouts}</ul><p class="fp-look-note" data-fp-note aria-live="polite"></p><details class="fp-light-log"><summary>Light log</summary><ul data-fp-history></ul></details></section>`;
  }

  private patch_(view: ServicePanelService[]): void {
    for (const svc of view) {
      const bank = this.host_.querySelector<HTMLElement>(`[data-fp-bank="${CSS.escape(svc.id)}"]`);
      if (!bank) continue;
      for (const row of svc.rows) this.patchLens_(bank, svc.id, row);
      const note = bank.querySelector<HTMLElement>('[data-fp-note]');
      const text = this.lastLook_.get(svc.id) ?? '';
      if (note && note.textContent !== text) note.textContent = text;
      const list = bank.querySelector<HTMLElement>('[data-fp-history]');
      if (list) {
        const sig = svc.history.map((h) => h.text).join('\n');
        if (list.dataset.sig !== sig) {
          list.dataset.sig = sig;
          list.innerHTML = svc.history.length > 0 ? svc.history.map((h) => `<li>${escapeHtml(h.text)}</li>`).join('') : '<li class="fp-none">Nothing has changed yet.</li>';
        }
      }
    }
  }

  private lensEl_(bank: HTMLElement, serviceId: string, layer: ServiceLayer): HTMLElement | null {
    const sel = `[data-fp-led][data-svc-service="${CSS.escape(serviceId)}"][data-svc-layer="${layer}"]`;

    return bank.querySelector<HTMLElement>(sel) ?? this.artHost_?.querySelector<HTMLElement>(sel) ?? null;
  }

  private patchLens_(bank: HTMLElement, serviceId: string, row: ServicePanelRow): void {
    const lens = this.lensEl_(bank, serviceId, row.layer);
    if (!lens) return;
    const state = row.sample ? String(row.sample.value) : 'unread';
    const set = (name: string, value: string): void => {
      if (lens.dataset[name] !== value) lens.dataset[name] = value;
    };
    set('ledState', state);
    set('ledFresh', row.freshness ?? '');
    set('ledValue', row.sample ? row.value : '');
    const label = LAYER_LABEL[row.layer];
    const text = row.sample ? `${label}: ${row.value} · ${row.age} · ${badgeText(row)}` : `${label}: not looked at yet. Looking takes ${CHECK_COST_S[SOURCE]} s.`;
    set('label', text);
    const readout = bank.querySelector<HTMLElement>(`[data-fp-readout][data-svc-layer="${row.layer}"]`);
    if (readout && readout.textContent !== text) readout.textContent = text;
  }
}
