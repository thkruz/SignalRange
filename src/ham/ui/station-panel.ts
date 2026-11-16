/**
 * @file station-panel - Panel contract for the Campaign 3 Station tab
 * @description Every instrument/operating panel implements StationPanel. The tab owns the
 * grid, calls `isRelevant` on each refresh to show or hide a panel, mounts a panel once
 * into its host, then calls `update(manager)` on each station update. Panels never hold
 * state of their own that the manager owns; all player actions go through `ctx.act`.
 *
 * Test id scheme: `ham-<panel>-<device|id>-<control>` (see ham-station-tab.ts header).
 */

import type { HamAction, HamStationManager } from '../ham-station-manager';
import type { ActionResult } from '../station/station-core';

export type HamActionResult = ActionResult;
export type FeedbackKind = 'info' | 'success' | 'warning' | 'danger';

export interface PanelContext {
  readonly manager: HamStationManager;
  /** Run a station action, flush the update event, show the result as inline feedback */
  act(a: HamAction): HamActionResult;
  /** Show a message in the tab's feedback strip */
  feedback(msg: string, kind: FeedbackKind, opts?: FeedbackOptions): void;
  /** What the feedback strip has said so far (also written to the Station log "Events & notes"), oldest first */
  readonly journal: readonly JournalEntry[];
  /** Put the held logbook or cards down (a panel that needs the bench or a window in plain view) */
  putDown?(): void;
}

export interface FeedbackOptions {
  /** Stay up until the next message replaces it (an instruction for as long as it applies) */
  sticky?: boolean;
  /** false for a state prompt rather than an action result: not written to the log */
  log?: boolean;
}

export interface JournalEntry {
  /** Station clock seconds when it was said */
  tS: number;
  kind: FeedbackKind;
  text: string;
}

export interface StationPanel {
  readonly id: string;
  readonly title: string;
  isRelevant(m: HamStationManager): boolean;
  mount(host: HTMLElement, ctx: PanelContext): void;
  update(m: HamStationManager): void;
  dispose(): void;
  /** A page panel: the book was opened on this page (build what only matters while it is read) */
  open?(): void;
  /** A page panel: the book was put down or turned to another page */
  close?(): void;
}
