/**
 * @file front-panel - The logbook's front page: the shift package and the task sheet
 * @description The same printed page the C6 clipboard opens on (title, brief paragraphs, the live objectives
 * checklist), pasted inside the front cover of the logbook. The page is built when the logbook is opened on it and
 * taken apart when the book is put down or turned away (no second, hidden checklist runs in the background).
 * Reading it counts as reading the mission brief (the same opened-box state the brief window sets), so the
 * "Read the Mission Brief" objective ticks either way; it does NOT count as opening the checklist window.
 * Test ids: ham-front-card (sheet).
 */

import { ClipboardCover } from '@app/pages/mission-control/tabs/clipboard/clipboard-cover';
import { missionItemBridge } from '@app/pages/mission-control/tabs/field-kit';
import '@app/pages/mission-control/tabs/clipboard/clipboard-shell.css';
import type { HamStationManager } from '../../ham-station-manager';
import type { StationPanel } from '../station-panel';
import { sheet } from './paper';

export class FrontPanel implements StationPanel {
  readonly id = 'front';
  readonly title = 'Front page';
  private root_: HTMLElement | null = null;
  private body_: HTMLElement | null = null;
  private cover_: ClipboardCover | null = null;

  isRelevant(_m: HamStationManager): boolean {
    return missionItemBridge.available('checklist');
  }

  mount(host: HTMLElement): void {
    const c = sheet('ham-front-card', this.title);
    c.root.classList.add('hl-front');
    this.root_ = c.root;
    this.body_ = c.body;
    host.append(c.root);
  }

  update(): void {}

  open(): void {
    if (this.cover_ || !this.body_) return;
    this.cover_ = new ClipboardCover({ registerOpened: false, registerBrief: missionItemBridge.available('brief'), written: true });
    this.body_.append(this.cover_.element);
  }

  close(): void {
    this.cover_?.dispose();
    this.cover_ = null;
  }

  dispose(): void {
    this.close();
    this.root_?.remove();
    this.root_ = null;
    this.body_ = null;
  }
}
