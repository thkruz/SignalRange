import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
import { ImmersiveView } from '@app/presentation/immersive-view';
import { TRIP_RULE_TEXT } from '@app/scoring/field-diagnosis';

/** The slice of the plant manager the control reads and drives. */
export interface PlantLike {
  isOutside(): boolean;
  getSiteMode(): string;
  getReport(): { trips: number; spotted: boolean };
  getTripLimit(): number;
  goOutside(): unknown;
  returnInside(): unknown;
}

/** What the control shows for a plant state. */
export interface TentControlView {
  outside: boolean;
  location: string;
  action: string;
  trips: string;
  spotted: boolean;
}

/** Pure mapping from plant state to control content. Null (hidden) without a plant or on a forward site (no tent). */
export function tentControlView(plant: PlantLike | null): TentControlView | null {
  if (!plant || plant.getSiteMode() === 'forward') {
    return null;
  }
  const outside = plant.isOutside();
  const report = plant.getReport();

  return {
    outside,
    location: outside ? 'Outside' : 'Inside the tent',
    action: outside ? 'Go back in' : 'Step outside',
    trips: `${report.trips}/${plant.getTripLimit()}`,
    spotted: report.spotted,
  };
}

/**
 * Persistent tent location control for the mission-control header: where the
 * player is and one button to step out or back in, reachable from every tab.
 * Reads and drives the plant manager only; keeps no state of its own.
 */
export class TentControl {
  private static active_: TentControl | null = null;
  private readonly root_: HTMLDivElement;
  private readonly plantOf_: () => PlantLike | null;
  /** Run after a confirmed step out (the Site scene repaints for the new view). */
  private afterToggle_: (() => void) | null = null;
  private afterCancel_: (() => void) | null = null;
  /** What had focus when the step-out ask opened (the header button or the tent flap); it gets focus back. */
  private opener_: HTMLElement | SVGElement | null = null;

  /** The control on screen, so the tent flap in the Site scene asks through the same confirm. */
  static active(): TentControl | null {
    return TentControl.active_;
  }

  constructor(parent: HTMLElement, plantOf: () => PlantLike | null = () => PhysicalPlantService.plantOrNull()) {
    this.plantOf_ = plantOf;
    this.root_ = document.createElement('div');
    this.root_.className = 'tent-control';
    this.root_.id = 'tent-control';
    this.root_.style.display = 'none';
    this.root_.innerHTML = `
      <span class="pp-badge" id="tent-location"><span class="pp-pip"></span><span id="tent-location-text"></span></span>
      <span class="tent-trips" title="${escapeHtml(TRIP_RULE_TEXT)}">Trips <b id="tent-trips"></b></span>
      <span class="pp-badge pp-badge-bad" id="tent-spotted" style="display:none">Spotted</span>
      <button type="button" class="btn btn-sm btn-primary" id="tent-toggle"></button>
      <span class="tent-confirm" id="tent-confirm-box" role="group" aria-labelledby="tent-confirm-text" style="display:none">
        <span id="tent-confirm-text"></span>
        <button type="button" class="btn btn-sm btn-primary" id="tent-confirm">Go outside</button>
        <button type="button" class="btn btn-sm" id="tent-cancel">Stay in</button>
      </span>
    `;
    this.root_.querySelector('#tent-toggle')?.addEventListener('click', () => this.requestToggle());
    this.root_.querySelector('#tent-confirm')?.addEventListener('click', () => {
      const after = this.afterToggle_;
      const opener = this.opener_;
      this.closeConfirm_();
      this.toggle();
      after?.();
      // Focus returns to what asked, unless `after` already placed it (the flap repaints with the scene)
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    });
    this.root_.querySelector('#tent-cancel')?.addEventListener('click', () => this.cancelConfirm_());
    // Esc backs out of the ask (and does not reach the pause menu)
    this.root_.querySelector('#tent-confirm-box')?.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.cancelConfirm_();
    });
    parent.appendChild(this.root_);
    TentControl.active_ = this;
    this.sync();
  }

  /** The control's element, so a HUD can host it; its id stays `tent-control` wherever it sits. */
  get element(): HTMLDivElement {
    return this.root_;
  }

  /**
   * The button's click: going back in is immediate; stepping out spends a rationed trip,
   * so it first asks (c6-s02-F11). The ask closes itself when the state changes. `after` runs once the
   * move happens (at once going in, on confirm going out); the tent flap uses it to repaint the scene.
   */
  requestToggle(after?: () => void, onCancel?: () => void): void {
    const plant = this.plantOf_();
    if (!plant) {
      return;
    }
    if (plant.isOutside()) {
      this.toggle();
      after?.();

      return;
    }
    this.afterToggle_ = after ?? null;
    this.afterCancel_ = onCancel ?? null;
    const active = document.activeElement;
    this.opener_ = active instanceof HTMLElement || active instanceof SVGElement ? active : null;
    // An object held fullscreen hides the HUD this ask lives in: put it down first so the ask is reachable
    ImmersiveView.closeAll();
    const report = plant.getReport();
    const limit = plant.getTripLimit();
    const over = report.trips + 1 > limit;
    const text = over ? `Trip ${report.trips + 1} is over the camp limit of ${limit} and gets you spotted.` : `This uses trip ${report.trips + 1} of ${limit}.`;
    this.root_.querySelector<HTMLElement>('#tent-confirm-text')!.textContent = text;
    this.root_.querySelector<HTMLElement>('#tent-confirm-box')!.style.display = 'inline-flex';
    this.root_.querySelector<HTMLElement>('#tent-toggle')!.style.display = 'none';
    // The ask takes focus wherever it was asked from, so a keyboard player at the flap answers it there
    this.root_.querySelector<HTMLElement>('#tent-confirm')!.focus({ preventScroll: true });
  }

  /** Whether the step-out ask is on screen. */
  get confirming(): boolean {
    return this.root_.querySelector<HTMLElement>('#tent-confirm-box')!.style.display !== 'none';
  }

  /** Stay in: close the ask and hand focus back to what opened it. */
  private cancelConfirm_(): void {
    const opener = this.opener_;
    const onCancel = this.afterCancel_;
    this.closeConfirm_();
    if (onCancel) {
      onCancel();

      return;
    }
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else this.root_.querySelector<HTMLElement>('#tent-toggle')?.focus({ preventScroll: true });
  }

  private closeConfirm_(): void {
    this.afterToggle_ = null;
    this.afterCancel_ = null;
    this.opener_ = null;
    this.root_.querySelector<HTMLElement>('#tent-confirm-box')!.style.display = 'none';
    this.root_.querySelector<HTMLElement>('#tent-toggle')!.style.display = '';
  }

  /** Step out or back in through the plant manager (the same calls the Site tab used). */
  toggle(): void {
    const plant = this.plantOf_();
    if (!plant) {
      return;
    }
    if (plant.isOutside()) {
      plant.returnInside();
    } else {
      plant.goOutside();
    }
    this.sync();
  }

  /** Repaint from the plant manager; cheap, safe to call every update. */
  sync(): void {
    const view = tentControlView(this.plantOf_());
    this.root_.style.display = view ? '' : 'none';
    if (!view) {
      return;
    }
    const set = (id: string, text: string): void => {
      const el = this.root_.querySelector<HTMLElement>(`#${id}`);
      if (el && el.textContent !== text) el.textContent = text;
    };
    this.root_.querySelector('#tent-location')!.className = `pp-badge ${view.outside ? 'pp-badge-warn' : 'pp-badge-ok'}`;
    this.root_.querySelector<HTMLElement>('#tent-spotted')!.style.display = view.spotted ? 'inline-flex' : 'none';
    set('tent-location-text', view.location);
    set('tent-trips', view.trips);
    set('tent-toggle', view.action);
    this.root_.dataset.state = view.outside ? 'outside' : 'inside';
  }

  dispose(): void {
    if (TentControl.active_ === this) TentControl.active_ = null;
    this.root_.remove();
  }
}
