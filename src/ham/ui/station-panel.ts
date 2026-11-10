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
  feedback(msg: string, kind: FeedbackKind): void;
}

export interface StationPanel {
  readonly id: string;
  readonly title: string;
  isRelevant(m: HamStationManager): boolean;
  mount(host: HTMLElement, ctx: PanelContext): void;
  update(m: HamStationManager): void;
  dispose(): void;
}
