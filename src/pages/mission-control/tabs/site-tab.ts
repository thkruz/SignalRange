import { isFrontlineAllowed } from '@app/campaigns/frontline/frontline-gate';
import { hotspotsForView, SITE_ASPECT, SITE_IMAGES } from '@app/campaigns/frontline/site-hotspots';
import { siteImageFor } from '@app/campaigns/frontline/site-layers';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { shapeSvg, svgOpen, VIEW_W, viewHeight } from '@app/physical/ui/plant-svg';
import { PlantTrainerBox } from '@app/physical/ui/plant-trainer-box';
import { escapeHtml, hotspotPip, internetPaths } from '@app/physical/ui/plant-ui-helpers';
import type { SiteHotspot, SiteView } from '@app/physical/ui/site-types';
import { SpaceyAppBox } from '@app/physical/ui/spacey-app-box';
import { getAssetUrl } from '@app/utils/asset-url';
import '@app/physical/ui/plant-ui.css';

/**
 * SiteTab - The Frontline site view (Phase 38.1 physical-layer sandbox)
 *
 * The painted site master with a hotspot per part. Hover shows the label,
 * the pip shows what the player can observe (powered, rebooting, dark), a
 * click opens the close-up. The header strip carries the inside/outside
 * state, trips, the spotted flag, the way back inside and the spares count.
 */
export class SiteTab extends BaseElement {
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;
  /** Fallback view when no plant exists; with a plant the manager's outside flag is the only truth */
  private fallbackView_: SiteView = 'inside';
  /** The view whose image and hotspots are currently painted */
  private renderedView_: SiteView = 'inside';
  /** The painting currently shown (changes with the weather) */
  private renderedImage_ = '';

  constructor(containerId: string) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.site-tab');

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.syncDomWithState_();
  }

  /** The image and hotspot overlay of the current view */
  private stageHtml_(): string {
    const view = this.view;
    this.renderedView_ = view;
    const overlay = [svgOpen(SITE_ASPECT[view], 'site-overlay')];
    for (const spot of hotspotsForView(view)) {
      overlay.push(this.hotspotHtml_(spot));
    }
    overlay.push('</svg>');
    const alt = view === 'inside' ? 'Inside the tent' : 'The compound outside the tent';

    const image = siteImageFor(view, SITE_IMAGES[view], PhysicalPlantService.plantOrNull()?.getWeather() ?? 'clear');
    this.renderedImage_ = image;

    return `<img src="${getAssetUrl(image)}" alt="${alt}" draggable="false" />${overlay.join('')}`;
  }

  private hotspotHtml_(spot: SiteHotspot): string {
    const aspect = SITE_ASPECT[spot.view];
    const shapes = spot.shapes.map((s) => shapeSvg(s, aspect, 'pp-hit', 'pp-hit-path')).join('');
    const ax = spot.anchor[0] * VIEW_W;
    const ay = spot.anchor[1] * viewHeight(aspect);
    const target = spot.action ? `data-action="${spot.action}"` : `data-closeup="${spot.closeup}"`;

    return `<g class="pp-hotspot" data-hotspot="${spot.id}" ${target} tabindex="0" role="button" aria-label="${escapeHtml(spot.label)}">${shapes}<circle class="pp-pip-svg ok" id="${spot.id}-pip" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9"/><text class="pp-label" x="${(ax + 14).toFixed(1)}" y="${(ay + 6).toFixed(1)}">${escapeHtml(spot.label)}</text></g>`;
  }

  /** Current view, derived from the plant manager (never stored separately) */
  private get view(): SiteView {
    const plant = PhysicalPlantService.plantOrNull();
    if (plant) {
      return plant.isOutside() ? 'outside' : 'inside';
    }

    return this.fallbackView_;
  }

  /** Current view (for tests and callers) */
  getView(): SiteView {
    return this.view;
  }

  /** Repaint the stage when the manager's state differs from what is painted */
  private renderStage_(): void {
    const view = this.view;
    const stage = this.cache_('site-stage');
    if (stage) {
      stage.style.setProperty('--pp-ar', String(SITE_ASPECT[view]));
      stage.innerHTML = this.stageHtml_();
    }
  }

  /** Show a view. Going outside opens a trip in the plant; going inside closes it. */
  setView(view: SiteView): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (view === 'outside' && plant && !plant.isOutside()) {
      plant.goOutside();
    } else if (view === 'inside' && plant?.isOutside()) {
      plant.returnInside();
    }
    this.fallbackView_ = view;
    this.renderStage_();
    this.syncDomWithState_();
  }

  private activateSpot_(spot: SVGElement): void {
    if (spot.dataset.action === 'go-outside') {
      this.setView('outside');
    } else if (spot.dataset.action === 'go-inside') {
      this.setView('inside');
    } else {
      PartCloseupModal.getInstance().showCloseup(spot.dataset.closeup as never);
    }
  }

  protected get html_(): string {
    return html`
      <div class="site-tab">
        <div class="site-tab-col">
        <div class="site-strip">
          <h2 class="site-strip-title">Site</h2>
          <span class="pp-badge" id="site-location"><span class="pp-pip" id="site-location-pip"></span><span id="site-location-text">Inside</span></span>
          <span class="site-stat site-outside-note" id="site-outside-note" style="display:none">Outside. Go inside to use the laptop.</span>
          <span class="site-stat">Trips <b id="site-trips">0/0</b></span>
          <span class="pp-badge pp-badge-bad" id="site-spotted" style="display:none">Spotted</span>
          <span class="site-stat">Spares <b id="site-spares">0</b></span>
          <span class="site-stat" id="site-internet-wrap">SpaceY <b id="site-path-spacey">-</b></span>
          <span class="site-stat">VSAT <b id="site-path-vsat">-</b></span>
          <span class="site-strip-spacer"></span>
          <button type="button" class="btn btn-sm btn-primary" id="site-view-toggle">Go outside</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="site-open-spacey">SpaceY app</button>
          <button type="button" class="btn btn-sm btn-outline-warning" id="site-open-trainer" style="display:none">Trainer</button>
        </div>
        <div class="site-stage-box"><div class="pp-stage" id="site-stage" style="--pp-ar:${SITE_ASPECT[this.view]}">${this.stageHtml_()}</div></div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    const root = qs<HTMLElement>('.site-tab');
    root.addEventListener('click', (ev) => {
      const target = ev.target as Element;
      const spot = target.closest<SVGElement>('[data-closeup], [data-action]');
      if (spot) {
        this.activateSpot_(spot);

        return;
      }
      const btn = target.closest<HTMLElement>('button');
      if (btn?.id === 'site-view-toggle') {
        this.setView(this.view === 'inside' ? 'outside' : 'inside');
      } else if (btn?.id === 'site-open-spacey') {
        SpaceyAppBox.getInstance().show();
      } else if (btn?.id === 'site-open-trainer') {
        PlantTrainerBox.getInstance().show();
      }
    });
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') {
        return;
      }
      const spot = (ev.target as Element).closest<SVGElement>('[data-closeup], [data-action]');
      if (spot) {
        ev.preventDefault();
        this.activateSpot_(spot);
      }
    });
  }

  private throttledSync_(): void {
    const now = Date.now();
    if (now - this.lastSyncTime_ < SiteTab.UPDATE_INTERVAL_MS) {
      return;
    }
    this.lastSyncTime_ = now;
    this.syncDomWithState_();
  }

  private cache_(id: string): HTMLElement | null {
    const cached = this.domCache_.get(id);
    if (cached) {
      return cached;
    }
    const el = this.dom_?.querySelector<HTMLElement>(`#${id}`) ?? null;
    if (el) {
      this.domCache_.set(id, el);
    }

    return el;
  }

  private syncDomWithState_(): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const outside = plant.isOutside();
    const image = siteImageFor(this.view, SITE_IMAGES[this.view], plant.getWeather());
    if (this.dom_ && (this.renderedView_ !== this.view || this.renderedImage_ !== image)) {
      this.renderStage_();
    }
    const note = this.cache_('site-outside-note');
    if (note) note.style.display = outside ? '' : 'none';
    const report = plant.getReport();
    const loc = this.cache_('site-location');
    if (loc) loc.className = `pp-badge ${outside ? 'pp-badge-warn' : 'pp-badge-ok'}`;
    this.setText_('site-location-text', outside ? 'Outside' : 'Inside');
    this.setText_('site-trips', `${report.trips}/${plant.getTripLimit()}`);
    const spotted = this.cache_('site-spotted');
    if (spotted) spotted.style.display = report.spotted ? 'inline-flex' : 'none';
    const spares = Object.values(plant.getSpares()).reduce((a, b) => a + b, 0);
    this.setText_('site-spares', String(spares));
    const net = internetPaths(plant);
    this.setText_('site-path-spacey', net.spacey ? 'up' : 'down');
    this.setText_('site-path-vsat', net.vsat ? 'up' : 'down');
    const trainer = this.cache_('site-open-trainer');
    if (trainer) trainer.style.display = isFrontlineAllowed() ? '' : 'none';

    this.setText_('site-view-toggle', this.view === 'inside' ? 'Go outside' : 'Go back inside');
    for (const spot of hotspotsForView(this.view)) {
      const pip = this.dom_.querySelector(`#${spot.id}-pip`);
      if (pip) {
        pip.setAttribute('class', `pp-pip-svg ${spot.partIds.length === 0 ? 'ok' : hotspotPip(plant, spot.partIds)}`);
      }
    }
  }

  private setText_(id: string, text: string): void {
    const el = this.cache_(id);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  public activate(): void {
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    PhysicalPlantService.setSiteTabShown(true);
    this.syncDomWithState_();
  }

  public deactivate(): void {
    PhysicalPlantService.setSiteTabShown(false);
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    PhysicalPlantService.setSiteTabShown(false);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
