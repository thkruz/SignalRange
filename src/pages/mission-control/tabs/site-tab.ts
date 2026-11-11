import { isFrontlineAllowed, isTrainerVisible } from '@app/campaigns/frontline/frontline-gate';
import { closeupFor, FORWARD_SITE_ASPECT, FORWARD_SITE_IMAGE, forwardSceneLayers, SITE_ASPECT, SITE_IMAGES, visibleHotspots } from '@app/campaigns/frontline/site-hotspots';
import { sceneLayerImageFor, siteImageFor } from '@app/campaigns/frontline/site-layers';
import { BaseElement } from '@app/components/base-element';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { FieldHandoverPanel } from '@app/pages/mission-control/tabs/field-handover-panel';
import { FieldNotebookPanel, type HypothesisScope, type NotebookTarget } from '@app/pages/mission-control/tabs/field-notebook-panel';
import { FieldPathDiagramPanel } from '@app/pages/mission-control/tabs/field-path-diagram-panel';
import { FieldPowerPanel, powerPanelRelevant } from '@app/pages/mission-control/tabs/field-power-panel';
import { FieldRecordsPanel } from '@app/pages/mission-control/tabs/field-records-panel';
import { FieldServicePanel } from '@app/pages/mission-control/tabs/field-service-panel';
import { FieldWorkloadPanel } from '@app/pages/mission-control/tabs/field-workload-panel';
import { formStepState, sampleStepState } from '@app/pages/mission-control/tabs/form-step-state';
import { buildNotebookTargets } from '@app/pages/mission-control/tabs/notebook-targets';
import { hypothesisFeedback, hypothesisRequirementRoutes } from '@app/physical/evidence-predicates';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { SampleProvenance } from '@app/physical/service-types';
import { GLOW_FILTERS_SVG } from '@app/physical/ui/glow-filters';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { shapeSvg, svgOpen, VIEW_W, viewHeight } from '@app/physical/ui/plant-svg';
import { PlantTrainerBox } from '@app/physical/ui/plant-trainer-box';
import { entryDisplayText, escapeHtml, hotspotPip, internetPaths, skylinkPathLabel } from '@app/physical/ui/plant-ui-helpers';
import type { SceneLayer, SiteHotspot, SiteView } from '@app/physical/ui/site-types';
import { ScenarioManager } from '@app/scenario-manager';
import { getAssetUrl } from '@app/utils/asset-url';
import '@app/physical/ui/plant-ui.css';
import './site-workspace.css';

const SITE_WORKSPACES = [
  ['scene', 'Equipment'],
  ['power', 'Power'],
  ['service', 'Laptop'],
  ['workload', 'Workloads'],
  ['path', 'Service paths'],
  ['notebook', 'Notebook'],
  ['handover', 'Handover'],
  ['records', 'Records and notices'],
] as const;

/**
 * SiteTab - The Frontline site view (Phase 38.1 physical-layer sandbox)
 *
 * The painted site master with a hotspot per part. Hover shows the label,
 * the pip shows what the player can observe (powered, rebooting, dark), a
 * click opens the close-up. The header strip carries the spares count and
 * path status; location, trips and the spotted flag live in the global TentControl.
 */
export class SiteTab extends BaseElement {
  static source: SampleProvenance = 'local-probe';
  private static desktopRequested_ = false;
  /** Sitting down at the laptop shows its desktop; the next laptop view starts there */
  static requestDesktop(): void {
    SiteTab.source = 'local-probe';
    SiteTab.desktopRequested_ = true;
  }
  static takeDesktopRequest(): boolean {
    const requested = SiteTab.desktopRequested_;
    SiteTab.desktopRequested_ = false;

    return requested;
  }
  static openLaptop(): void {
    EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'field-service', desktop: true });
  }
  static openSource(source: SampleProvenance): void {
    SiteTab.source = source;
    EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'field-service' });
  }
  /** Peer workspaces advertised in the main mission-control tab bar. */
  static availableWorkspaces(): { id: string; label: string }[] {
    const services = PhysicalPlantService.servicesOrNull();
    const hasServices = (services?.getServiceIds().length ?? 0) > 0;
    const records = PhysicalPlantService.recordsOrNull();
    const available: Record<string, boolean> = {
      power: powerPanelRelevant(PhysicalPlantService.plantOrNull()),
      service: hasServices,
      workload: hasServices && (PhysicalPlantService.workloadsOrNull()?.cards().length ?? 0) > 0,
      path: hasServices,
      notebook: PhysicalPlantService.evidenceOrNull() !== null,
      handover: (records?.forms().length ?? 0) > 0,
      records: records?.equipment != null,
    };
    return SITE_WORKSPACES.filter(([id]) => available[id]).map(([id, label]) => ({ id: `field-${id}`, label }));
  }

  showWorkspace(tabId: string): void {
    this.dom_.dataset.fieldSource = tabId === 'field-service' ? SiteTab.source : '';
    if (tabId === 'field-service') this.servicePanel_?.setSource(SiteTab.source);
    this.workspace_ = tabId === 'site' ? 'scene' : tabId.slice('field-'.length);
    this.syncWorkspaces_();
  }
  /** Throttle interval for passive DOM sync on the sim tick (ms) */
  private static readonly UPDATE_INTERVAL_MS = 1000;

  private readonly boundUpdateHandler_: () => void;
  private readonly domCache_ = new Map<string, HTMLElement>();
  private lastSyncTime_ = 0;
  private powerPanel_: FieldPowerPanel | null = null;
  private servicePanel_: FieldServicePanel | null = null;
  private workloadPanel_: FieldWorkloadPanel | null = null;
  private notebookPanel_: FieldNotebookPanel | null = null;
  private handoverPanel_: FieldHandoverPanel | null = null;
  private recordsPanel_: FieldRecordsPanel | null = null;
  private pathPanel_: FieldPathDiagramPanel | null = null;
  /** Fallback view when no plant exists; with a plant the manager's outside flag is the only truth */
  private fallbackView_: SiteView = 'inside';
  /** The view whose image and hotspots are currently painted */
  private renderedView_: SiteView = 'inside';
  /** The painting currently shown (changes with the weather) */
  private renderedImage_ = '';
  private renderedAspect_ = 0;
  private workspace_ = 'scene';
  private active_ = false;

  constructor(containerId: string, onNotebookPutDown: () => void = () => EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'site' })) {
    super();
    this.init_(containerId, 'replace');
    this.dom_ = qs('.site-tab');
    this.powerPanel_ = new FieldPowerPanel(
      qs<HTMLElement>('#site-power-panel'),
      () => PhysicalPlantService.plantOrNull(),
      (part) => this.visitPart_(part)
    );
    this.servicePanel_ = new FieldServicePanel(
      qs<HTMLElement>('#site-service-panel'),
      () => PhysicalPlantService.servicesOrNull(),
      () => PhysicalPlantService.plantOrNull()?.getTimeSeconds() ?? 0,
      (seconds) => PhysicalPlantService.plantOrNull()?.spendTime(seconds),
      (serviceId) => sampleStepState(serviceId, ObjectivesManager.getInstance().getObjectiveStates())
    );
    this.workloadPanel_ = new FieldWorkloadPanel(
      qs<HTMLElement>('#site-workload-panel'),
      () => PhysicalPlantService.workloadsOrNull(),
      () => PhysicalPlantService.servicesOrNull(),
      () => PhysicalPlantService.plantOrNull()?.getTimeSeconds() ?? 0
    );
    this.notebookPanel_ = new FieldNotebookPanel(
      qs<HTMLElement>('#site-notebook-panel'),
      () => PhysicalPlantService.evidenceOrNull(),
      (scope) => this.notebookTargets_(scope),
      () => PhysicalPlantService.plantOrNull()?.getConfig().causeOptions ?? null,
      (entry) => {
        const specs = PhysicalPlantService.plantOrNull()?.getConfig().hypothesisSpecs ?? [];
        const log = PhysicalPlantService.evidenceOrNull();

        return log ? hypothesisFeedback(entry, specs, log.entries(), { eventFiredAtS: (id) => PhysicalPlantService.eventsOrNull()?.firedAtS(id) ?? null }) : null;
      },
      (entry) => entryDisplayText(entry, PhysicalPlantService.plantOrNull()),
      () => hypothesisRequirementRoutes(PhysicalPlantService.plantOrNull()?.getConfig().hypothesisSpecs ?? []),
      onNotebookPutDown
    );
    this.handoverPanel_ = new FieldHandoverPanel(qs<HTMLElement>('#site-handover-panel'), {
      records: () => PhysicalPlantService.recordsOrNull(),
      evidence: () => PhysicalPlantService.evidenceOrNull(),
      service: () => PhysicalPlantService.servicesOrNull(),
      runs: () => PhysicalPlantService.workloadsOrNull()?.getRuns() ?? [],
      plant: () => PhysicalPlantService.plantOrNull(),
      catchUp: () => PhysicalPlantService.catchUp(),
      eventFiredAtS: (id) => PhysicalPlantService.eventsOrNull()?.firedAtS(id) ?? null,
      formStep: (formId) => formStepState(formId, ObjectivesManager.getInstance().getObjectiveStates()),
    });

    this.recordsPanel_ = new FieldRecordsPanel(qs<HTMLElement>('#site-records-panel'), { records: () => PhysicalPlantService.recordsOrNull() });

    this.pathPanel_ = new FieldPathDiagramPanel(qs<HTMLElement>('#site-path-panel'), {
      plant: () => PhysicalPlantService.plantOrNull(),
      evidence: () => PhysicalPlantService.evidenceOrNull(),
      highlightShared: () => PhysicalPlantService.plantOrNull()?.getConfig().diagram?.highlightShared !== false,
    });

    this.boundUpdateHandler_ = this.throttledSync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
    this.syncDomWithState_();
  }

  /** Hypothesis targets the player can pick for a scope (labels only, no fault truth) */
  private notebookTargets_(scope: HypothesisScope): NotebookTarget[] {
    return buildNotebookTargets(scope, { plant: PhysicalPlantService.plantOrNull(), services: PhysicalPlantService.servicesOrNull() });
  }

  /** The image and hotspot overlay of the current view */
  private stageHtml_(): string {
    const view = this.view;
    this.renderedView_ = view;
    this.renderedAspect_ = this.aspect_();
    const overlay = [svgOpen(this.aspect_(), 'site-overlay')];
    overlay.push(GLOW_FILTERS_SVG);
    overlay.push(this.sceneLayersSvg_());
    for (const spot of this.spots_()) {
      overlay.push(this.hotspotHtml_(spot));
    }
    overlay.push('</svg>');
    const alt = this.isForward_() ? 'The forward post' : view === 'inside' ? 'Inside the tent' : 'The compound outside the tent';

    const image = siteImageFor(view, this.baseImage_(), PhysicalPlantService.plantOrNull()?.getWeather() ?? 'clear');
    this.renderedImage_ = this.imageKey_(image);

    return `<img src="${getAssetUrl(image)}" alt="${alt}" draggable="false" />${overlay.join('')}`;
  }

  /** Forward site: one outdoor view, no tent, no trips */
  private isForward_(): boolean {
    return PhysicalPlantService.plantOrNull()?.getSiteMode() === 'forward';
  }

  /** Forward scene layers (EuroSat gear) whose plant ids are on the site; inventory-driven, never weather or fault */
  private sceneLayers_(): SceneLayer[] {
    return this.isForward_() ? forwardSceneLayers(this.hasTarget_) : [];
  }

  private readonly hasTarget_ = (id: string): boolean => {
    const plant = PhysicalPlantService.plantOrNull();

    return !plant || plant.getTargetTraits(id) !== null;
  };

  /** Image plus the layer set: a change in either re-renders the stage */
  private imageKey_(image: string): string {
    return [image, ...this.sceneLayers_().map((l) => l.id)].join('|');
  }

  private sceneLayersSvg_(): string {
    const h = viewHeight(this.aspect_());
    const weather = PhysicalPlantService.plantOrNull()?.getWeather() ?? 'clear';

    return this.sceneLayers_()
      .map(
        (l) =>
          `<image class="site-scene-layer" data-scene-layer="${l.id}" href="${getAssetUrl(sceneLayerImageFor(l, weather))}" x="${(l.bbox[0] * VIEW_W).toFixed(2)}" y="${(l.bbox[1] * h).toFixed(2)}" width="${(l.bbox[2] * VIEW_W).toFixed(2)}" height="${(l.bbox[3] * h).toFixed(2)}" preserveAspectRatio="none" pointer-events="none"/>`
      )
      .join('');
  }

  private aspect_(): number {
    return this.isForward_() ? FORWARD_SITE_ASPECT : SITE_ASPECT[this.view];
  }

  private baseImage_(): string {
    return this.isForward_() ? FORWARD_SITE_IMAGE : SITE_IMAGES[this.view];
  }

  /** Hotspots of the current scene; those for equipment missing from the site inventory are hidden */
  private spots_(): SiteHotspot[] {
    return visibleHotspots(this.isForward_() ? 'forward' : this.view, this.hasTarget_);
  }

  /** Hover glow: the silhouette matte through the shared glow filter, or (no matte) a soft blurred copy of the shapes */
  private glowSvg_(spot: SiteHotspot, aspect: number): string {
    if (!spot.mask) {
      return spot.shapes.map((s) => shapeSvg(s, aspect, 'pp-glow-fb', 'pp-glow-fb-path')).join('');
    }
    const h = viewHeight(aspect);
    const [x, y, w, hh] = spot.mask.bbox;

    return `<image class="pp-glow" href="${getAssetUrl(spot.mask.file)}" x="${(x * VIEW_W).toFixed(2)}" y="${(y * h).toFixed(2)}" width="${(w * VIEW_W).toFixed(2)}" height="${(hh * h).toFixed(2)}" preserveAspectRatio="none" filter="url(#pp-glow)" pointer-events="none"/>`;
  }

  private hotspotHtml_(spot: SiteHotspot): string {
    const aspect = this.aspect_();
    const hit = spot.shapes.map((s) => shapeSvg(s, aspect, 'pp-hit', 'pp-hit-path')).join('');
    const shapes = this.glowSvg_(spot, aspect) + hit;
    const ax = spot.anchor[0] * VIEW_W;
    const ay = spot.anchor[1] * viewHeight(aspect);
    const target = spot.action ? `data-action="${spot.action}"` : spot.pendingArt ? 'data-pending="1" aria-disabled="true"' : `data-closeup="${spot.closeup}"`;

    return `<g class="pp-hotspot" data-hotspot="${spot.id}" ${target} tabindex="0" role="button" aria-label="${escapeHtml(spot.label)}">${shapes}<circle class="pp-pip-svg ok" id="${spot.id}-pip" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9"/><text class="pp-label" x="${(ax + 14).toFixed(1)}" y="${(ay + 6).toFixed(1)}">${escapeHtml(spot.label)}</text></g>`;
  }

  /** Current view, derived from the plant manager (never stored separately) */
  private get view(): SiteView {
    const plant = PhysicalPlantService.plantOrNull();
    if (plant) {
      return plant.getSiteMode() === 'forward' || plant.isOutside() ? 'outside' : 'inside';
    }

    return this.fallbackView_;
  }

  /** Current view (for tests and callers) */
  getView(): SiteView {
    return this.view;
  }

  /** Repaint the stage when the manager's state differs from what is painted */
  private renderStage_(): void {
    const stage = this.cache_('site-stage');
    if (!stage) {
      return;
    }
    if (this.patchStage_(stage)) {
      return;
    }
    stage.style.setProperty('--pp-ar', String(this.aspect_()));
    this.renderedAspect_ = this.aspect_();
    stage.innerHTML = this.stageHtml_();
  }

  /**
   * A weather or inventory change touches the picture and a few hotspots, not the whole stage. Replacing every
   * hotspot would swap the node under the pointer and swallow a click, so change only what differs.
   * Returns false when the view itself changed and the stage needs a full repaint.
   */
  private patchStage_(stage: HTMLElement): boolean {
    const svg = stage.querySelector<SVGSVGElement>('svg.site-overlay');
    const img = stage.querySelector<HTMLImageElement>('img');
    if (!svg || !img || this.renderedView_ !== this.view || this.renderedAspect_ !== this.aspect_()) {
      return false;
    }
    const image = siteImageFor(this.view, this.baseImage_(), PhysicalPlantService.plantOrNull()?.getWeather() ?? 'clear');
    const nextSrc = getAssetUrl(image);
    if (img.getAttribute('src') !== nextSrc) {
      img.setAttribute('src', nextSrc);
    }
    this.renderedImage_ = this.imageKey_(image);
    const parse = (markup: string): Element[] => {
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmp.innerHTML = markup;

      return [...tmp.children];
    };
    for (const old of svg.querySelectorAll('.site-scene-layer')) {
      old.remove();
    }
    const firstSpot = svg.querySelector('.pp-hotspot');
    for (const layer of parse(this.sceneLayersSvg_())) {
      svg.insertBefore(layer, firstSpot);
    }
    const wanted = this.spots_();
    const wantedIds = new Set(wanted.map((spot) => spot.id));
    const present = new Set<string>();
    for (const g of svg.querySelectorAll<SVGElement>('.pp-hotspot')) {
      const id = g.dataset.hotspot ?? '';
      if (wantedIds.has(id)) {
        present.add(id);
      } else {
        g.remove();
      }
    }
    for (const spot of wanted) {
      if (!present.has(spot.id)) {
        for (const node of parse(this.hotspotHtml_(spot))) {
          svg.appendChild(node);
        }
      }
    }

    return true;
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

  private visitPart_(partId: string): void {
    const spots = this.isForward_() ? visibleHotspots('forward', this.hasTarget_) : [...visibleHotspots('inside', this.hasTarget_), ...visibleHotspots('outside', this.hasTarget_)];
    // A part can sit in another hotspot's close-up (the forward EuroSat modem is on the router shelf)
    const plant = PhysicalPlantService.plantOrNull();
    const has = (target: string): boolean => plant?.getTargetTraits(target) != null;
    const mode = this.isForward_() ? 'forward' : 'camp';
    const spot =
      spots.find((item) => item.closeup && item.partIds.includes(partId)) ??
      spots.find((item) => item.closeup && closeupFor(item.closeup, mode, has).regions.some((region) => region.target === partId));
    if (!spot?.closeup) return;
    EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: 'site' });
    if (!this.isForward_()) this.setView(spot.view);
    const closeup = PartCloseupModal.getInstance();
    closeup.showCloseup(spot.closeup);
    closeup.selectTarget(partId);
  }

  protected get html_(): string {
    return html`
      <div class="site-tab">
        <div class="site-tab-col">
        <div class="site-strip">
          <h2 class="site-strip-title">Site</h2>
          <span class="site-stat site-outside-note" id="site-outside-note" style="display:none">Outside. Go inside to use the laptop.</span>
          <span class="site-stat">Spares <b id="site-spares">0</b></span>
          <span class="site-stat" id="site-internet-wrap">SkyLink <b id="site-path-skylink">-</b></span>
          <span class="site-stat"><span id="site-path-vsat-name">VSAT</span> <b id="site-path-vsat">-</b></span>
          <span class="site-strip-spacer"></span>
          <button type="button" class="btn btn-sm btn-outline-warning" id="site-open-trainer" style="display:none">Trainer</button>
        </div>
        <div class="site-stage-box" id="site-scene-panel"><div class="pp-stage" id="site-stage" style="--pp-ar:${this.aspect_()}">${this.stageHtml_()}</div></div>
        <nav class="site-field-kit" aria-label="Field kit">
          <button data-field-object="field-notebook">Open notebook</button>
          <button data-field-object="field-handover">Pick up handover clipboard</button>
          <button data-field-object="field-records">Open equipment log</button>
          <button data-field-object="field-path">Unfold wiring diagram</button>
          <button data-field-object="field-power">Open power plan</button>
          <button data-field-source="pilot-report">Use radio</button>
        </nav>
        <div id="site-power-panel" style="display:none"></div>
        <div id="site-service-panel" style="display:none"></div>
        <div id="site-workload-panel" style="display:none"></div>
        <div id="site-notebook-panel" style="display:none"></div>
        <div id="site-handover-panel" style="display:none"></div>
        <div id="site-records-panel" style="display:none"></div>
        <div id="site-path-panel" style="display:none"></div>
        </div>
      </div>
    `;
  }

  protected addEventListeners_(): void {
    const root = qs<HTMLElement>('.site-tab');
    root.addEventListener('click', (ev) => {
      const target = ev.target as Element;
      const object = target.closest<HTMLElement>('[data-field-object]');
      if (object) {
        EventBus.getInstance().emit(Events.SWITCH_TAB, { tabId: object.dataset.fieldObject! });
        return;
      }
      const source = target.closest<HTMLElement>('button[data-field-source]');
      if (source) {
        SiteTab.openSource(source.dataset.fieldSource as SampleProvenance);
        return;
      }
      const summary = target.closest('summary');
      if (summary?.parentElement?.parentElement?.getAttribute('role') === 'tabpanel') {
        ev.preventDefault();
        return;
      }
      const spot = target.closest<SVGElement>('[data-closeup], [data-action]');
      if (spot) {
        this.activateSpot_(spot);

        return;
      }
      const btn = target.closest<HTMLElement>('button');
      if (btn?.id === 'site-open-trainer') {
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
    const image = siteImageFor(this.view, this.baseImage_(), plant.getWeather());
    if (this.dom_ && (this.renderedView_ !== this.view || this.renderedImage_ !== this.imageKey_(image))) {
      this.renderStage_();
    }
    const forward = this.isForward_();
    this.powerPanel_?.sync();
    this.servicePanel_?.sync();
    this.workloadPanel_?.sync();
    this.notebookPanel_?.sync();
    this.handoverPanel_?.sync();
    this.recordsPanel_?.sync();
    this.pathPanel_?.sync();
    this.syncWorkspaces_();
    const note = this.cache_('site-outside-note');
    if (note) note.style.display = outside && !forward ? '' : 'none';
    const spares = Object.values(plant.getSpares()).reduce((a, b) => a + b, 0);
    this.setText_('site-spares', String(spares));
    const net = internetPaths(plant);
    this.setText_('site-path-skylink', skylinkPathLabel(plant));
    this.setText_('site-path-vsat-name', forward ? 'EuroSat' : 'VSAT');
    this.setText_('site-path-vsat', net.vsat ? 'up' : 'down');
    const trainer = this.cache_('site-open-trainer');
    if (trainer) trainer.style.display = isTrainerVisible(isFrontlineAllowed(), ScenarioManager.getInstance().data?.missionType) ? '' : 'none';

    for (const spot of this.spots_()) {
      const pip = this.dom_.querySelector(`#${spot.id}-pip`);
      if (pip) {
        pip.setAttribute('class', `pp-pip-svg ${spot.partIds.length === 0 ? 'ok' : hotspotPip(plant, spot.partIds)}`);
      }
    }
  }

  /** One full-size workspace; scenario-inapplicable tools never appear in navigation. */
  private syncWorkspaces_(): void {
    const offered = new Set(SiteTab.availableWorkspaces().map((item) => item.id));
    for (const button of this.dom_.querySelectorAll<HTMLElement>('[data-field-object]')) button.hidden = !offered.has(button.dataset.fieldObject!);
    this.dom_.querySelector<HTMLElement>('.site-field-kit')?.toggleAttribute('hidden', this.workspace_ !== 'scene');
    const available = SITE_WORKSPACES.filter(([id]) => id === 'scene' || this.cache_(`site-${id}-panel`)?.style.display !== 'none');
    if (!available.some(([id]) => id === this.workspace_)) this.workspace_ = 'scene';
    this.dom_.classList.toggle('is-notebook', this.workspace_ === 'notebook');
    for (const [id, label] of SITE_WORKSPACES) {
      const panel = this.cache_(`site-${id}-panel`);
      const selected = id === this.workspace_;
      if (panel) {
        panel.hidden = !selected;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-label', label);
        const section = panel.firstElementChild;
        if (section instanceof HTMLDetailsElement) {
          section.open = true;
          section.querySelector('summary')?.setAttribute('tabindex', '-1');
        }
      }
    }
    this.notebookPanel_?.setImmersive(this.active_ && this.workspace_ === 'notebook');
  }

  private setText_(id: string, text: string): void {
    const el = this.cache_(id);
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  public activate(): void {
    this.active_ = true;
    if (this.dom_) {
      this.dom_.style.display = 'block';
    }
    PhysicalPlantService.setSiteTabShown(true);
    this.syncDomWithState_();
  }

  public deactivate(): void {
    this.active_ = false;
    this.notebookPanel_?.setImmersive(false);
    PhysicalPlantService.setSiteTabShown(false);
    if (this.dom_) {
      this.dom_.style.display = 'none';
    }
  }

  public dispose(): void {
    PhysicalPlantService.setSiteTabShown(false);
    EventBus.getInstance().off(Events.UPDATE, this.boundUpdateHandler_);
    this.powerPanel_ = null;
    this.servicePanel_ = null;
    this.workloadPanel_?.destroy();
    this.workloadPanel_ = null;
    this.notebookPanel_?.destroy();
    this.notebookPanel_ = null;
    this.handoverPanel_?.destroy();
    this.handoverPanel_ = null;
    this.recordsPanel_?.destroy();
    this.recordsPanel_ = null;
    this.pathPanel_?.destroy();
    this.pathPanel_ = null;
    this.domCache_.clear();
    this.dom_?.remove();
  }
}
