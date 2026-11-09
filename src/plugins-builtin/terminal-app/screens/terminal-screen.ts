/**
 * @file terminal-screen - The screen interface of the terminal app (phase 40, WP3)
 * @description Each dashboard screen is one module that exports a `TerminalScreenFactory`.
 * The shell builds a screen once on first visit, calls `sync` about once a second while it is
 * shown, and calls `dispose` when the page goes away. WP4-6 add a screen by writing a factory and
 * putting it in `SCREEN_FACTORIES` (`../skylink-dashboard.ts`).
 */
import type { SleepSchedule, SnowMeltMode, TerminalSettings, VerbResult } from '@app/physical/physical-plant-types';
import type { TerminalAppModel, TerminalView } from '../terminal-app-model';
import type { TerminalScreenId, TerminalSkin } from '../terminal-skin';

/** What the app can do to the dish and router. Every call goes through the plant, costs sim time and is logged. */
export interface TerminalActions {
  reboot(): VerbResult;
  setSnowMelt(mode: SnowMeltMode): VerbResult;
  setSleep(schedule: SleepSchedule | null): VerbResult;
  setRouterWifi(ssid: string, password: string): VerbResult;
  settings(): TerminalSettings;
}

export interface TerminalScreenContext {
  readonly skin: TerminalSkin;
  readonly model: TerminalAppModel;
  readonly actions: TerminalActions;
  /** Ask before a destructive action. Resolves true when the player confirms. */
  confirm(message: string, confirmLabel: string): Promise<boolean>;
  /** Ask the shell to call `sync` again now (after an action) */
  refresh(): void;
}

export interface TerminalScreen {
  readonly id: TerminalScreenId;
  /** Build the DOM into `container`, once */
  mount(container: HTMLElement): void;
  /**
   * Refresh from the latest view (about 1 Hz while shown, and right after an action).
   * Never overwrite a focused or edited input here.
   */
  sync(view: TerminalView): void;
  dispose(): void;
}

export type TerminalScreenFactory = (ctx: TerminalScreenContext) => TerminalScreen;

/** Escape text for innerHTML */
export function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}
