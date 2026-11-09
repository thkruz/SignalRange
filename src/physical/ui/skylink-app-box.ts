/**
 * @file skylink-app-box - The generic satellite-internet terminal app (Phase 38.1)
 * @description Status, obstruction note, power draw and an event log of status
 * changes. Read-only: it reports what the terminal says, nothing the player
 * has not earned by looking at it. Opened from the site tab and from the laptop.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { SkylinkStatus } from '@app/physical/physical-plant-types';
import { PlantBox } from './plant-box-base';
import { escapeHtml, formatSimTime, SKYLINK_STATUS_TEXT, skylinkPip } from './plant-ui-helpers';

const NOTE_BY_STATUS: Record<SkylinkStatus, string> = {
  booting: 'Terminal is starting up. Searching for the satellite.',
  online: 'Connected. No obstructions detected.',
  obstructed: 'Obstruction detected in the dish field of view.',
  heating: 'Heating to melt snow. Service resumes when the dish is clear.',
  'thermal-shutdown': 'Terminal shut down to protect itself. Let it cool and check the supply.',
  'no-power': 'No power to the terminal.',
};

interface SkylinkEvent {
  tSeconds: number;
  text: string;
}

export class SkylinkAppBox extends PlantBox {
  private static instance_: SkylinkAppBox | null = null;

  private events_: SkylinkEvent[] = [];
  private lastStatus_: SkylinkStatus | null = null;
  private lastWatchMs_ = 0;
  private readonly boundWatch_: () => void;

  private constructor() {
    super('skylink-app-box', 'SkyLink', '300px');
    this.boundWatch_ = this.watch_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundWatch_);
  }

  static getInstance(): SkylinkAppBox {
    SkylinkAppBox.instance_ ??= new SkylinkAppBox();

    return SkylinkAppBox.instance_;
  }

  static destroy(): void {
    if (SkylinkAppBox.instance_) {
      EventBus.getInstance().off(Events.UPDATE, SkylinkAppBox.instance_.boundWatch_);
      SkylinkAppBox.instance_.destroyBase_();
      SkylinkAppBox.instance_ = null;
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
    const status = plant.skylinkStatus();
    if (status !== this.lastStatus_) {
      this.events_.push({ tSeconds: plant.getTimeSeconds(), text: SKYLINK_STATUS_TEXT[status] });
      this.events_ = this.events_.slice(-40);
      this.lastStatus_ = status;
    }
  }

  protected renderContent_(): string {
    return `
      <div class="pp-skylink">
        <div class="pp-skylink-head">
          <div>
            <div class="fw-bold" id="skylink-status-text">-</div>
            <div class="text-muted small" id="skylink-note">-</div>
          </div>
          <div class="pp-skylink-ring" id="skylink-ring">&#9679;</div>
        </div>
        <h4>Terminal</h4>
        <div class="pp-row"><span>Power draw</span><b id="skylink-power">-</b></div>
        <div class="pp-row"><span>Obstructions</span><b id="skylink-obstruction">-</b></div>
        <h4>Event log</h4>
        <div class="pp-event-log" id="skylink-events"></div>
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
    const status = plant.skylinkStatus();
    const text = root.querySelector('#skylink-status-text');
    const note = root.querySelector('#skylink-note');
    const ring = root.querySelector('#skylink-ring');
    const power = root.querySelector('#skylink-power');
    const obstruction = root.querySelector('#skylink-obstruction');
    const log = root.querySelector('#skylink-events');
    if (text) text.textContent = SKYLINK_STATUS_TEXT[status];
    if (note) note.textContent = NOTE_BY_STATUS[status];
    if (ring) ring.className = `pp-skylink-ring pp-pip-${skylinkPip(status)}`;
    if (power) power.textContent = `${Math.round(plant.getLoadW('skylink-dish'))} W`;
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
