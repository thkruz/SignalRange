import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { escapeHtml } from '@app/physical/ui/plant-ui-helpers';
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
  private readonly root_: HTMLDivElement;
  private readonly plantOf_: () => PlantLike | null;

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
    `;
    this.root_.querySelector('#tent-toggle')?.addEventListener('click', () => this.toggle());
    parent.appendChild(this.root_);
    this.sync();
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
    this.root_.remove();
  }
}
