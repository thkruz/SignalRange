/**
 * @file spacey-app-box - The generic satellite-internet terminal app (Phase 38.1)
 * @description Status, obstruction note, power draw and an event log of status
 * changes. Read-only: it reports what the terminal says, nothing the player
 * has not earned by looking at it. Opened from the site tab and from the laptop.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { SpaceyStatus } from '@app/physical/physical-plant-types';
import { PlantBox } from './plant-box-base';
import { escapeHtml, formatSimTime, SPACEY_STATUS_TEXT, spaceyPip } from './plant-ui-helpers';

const NOTE_BY_STATUS: Record<SpaceyStatus, string> = {
  booting: 'Terminal is starting up. Searching for the satellite.',
  online: 'Connected. No obstructions detected.',
  obstructed: 'Obstruction detected in the dish field of view.',
  heating: 'Heating to melt snow. Service resumes when the dish is clear.',
  'thermal-shutdown': 'Terminal shut down to protect itself. Let it cool and check the supply.',
  'no-power': 'No power to the terminal.',
};

interface SpaceyEvent {
  tSeconds: number;
  text: string;
}

export class SpaceyAppBox extends PlantBox {
  private static instance_: SpaceyAppBox | null = null;

  private events_: SpaceyEvent[] = [];
  private lastStatus_: SpaceyStatus | null = null;
  private lastWatchMs_ = 0;
  private readonly boundWatch_: () => void;

  private constructor() {
    super('spacey-app-box', 'SpaceY', '300px');
    this.boundWatch_ = this.watch_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundWatch_);
  }

  static getInstance(): SpaceyAppBox {
    SpaceyAppBox.instance_ ??= new SpaceyAppBox();

    return SpaceyAppBox.instance_;
  }

  static destroy(): void {
    if (SpaceyAppBox.instance_) {
      EventBus.getInstance().off(Events.UPDATE, SpaceyAppBox.instance_.boundWatch_);
      SpaceyAppBox.instance_.destroyBase_();
      SpaceyAppBox.instance_ = null;
    }
  }

  /** Record status transitions even while the app is closed */
  private watch_(): void {
    if (Date.now() - this.lastWatchMs_ < 1000) {
      return;
    }
    this.lastWatchMs_ = Date.now();
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    const status = plant.spaceyStatus();
    if (status !== this.lastStatus_) {
      this.events_.push({ tSeconds: plant.getTimeSeconds(), text: SPACEY_STATUS_TEXT[status] });
      this.events_ = this.events_.slice(-40);
      this.lastStatus_ = status;
    }
  }

  protected renderContent_(): string {
    return `
      <div class="pp-spacey">
        <div class="pp-spacey-head">
          <div>
            <div class="fw-bold" id="spacey-status-text">-</div>
            <div class="text-muted small" id="spacey-note">-</div>
          </div>
          <div class="pp-spacey-ring" id="spacey-ring">&#9679;</div>
        </div>
        <h4>Terminal</h4>
        <div class="pp-row"><span>Power draw</span><b id="spacey-power">-</b></div>
        <div class="pp-row"><span>Obstructions</span><b id="spacey-obstruction">-</b></div>
        <h4>Event log</h4>
        <div class="pp-event-log" id="spacey-events"></div>
      </div>`;
  }

  protected bind_(): void {
    // Read-only panel: nothing to bind
  }

  protected sync_(root: HTMLElement): void {
    const plant = PhysicalPlantService.plantOrNull();
    if (!plant) {
      return;
    }
    this.watch_();
    const status = plant.spaceyStatus();
    const text = root.querySelector('#spacey-status-text');
    const note = root.querySelector('#spacey-note');
    const ring = root.querySelector('#spacey-ring');
    const power = root.querySelector('#spacey-power');
    const obstruction = root.querySelector('#spacey-obstruction');
    const log = root.querySelector('#spacey-events');
    if (text) text.textContent = SPACEY_STATUS_TEXT[status];
    if (note) note.textContent = NOTE_BY_STATUS[status];
    if (ring) ring.className = `pp-spacey-ring pp-pip-${spaceyPip(status)}`;
    if (power) power.textContent = `${Math.round(plant.getLoadW('spacey-dish'))} W`;
    if (obstruction) obstruction.textContent = status === 'obstructed' ? 'Yes' : status === 'heating' ? 'Snow (melting)' : 'None';
    if (log) {
      log.innerHTML = this.events_
        .slice()
        .reverse()
        .map((e) => `<div>${formatSimTime(e.tSeconds)} ${escapeHtml(e.text)}</div>`)
        .join('');
    }
  }
}
