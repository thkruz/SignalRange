/**
 * @file locate-pulse - A one-time pulse on the world object an objective first needs
 * @description A condition row may name a `locate` target (for example `kit:logbook`). The first time the row's
 * objective becomes active, elements tagged `data-locate="<target>"` glow until the player opens one of them, and the
 * pulse never returns for that objective. It reuses the red pencil-ring look of the Logbook's `is-due` tab and the
 * quiz indicator's pulse keyframes (locate-pulse.css), and stands still under prefers-reduced-motion.
 *
 * Host surfaces tag their element with `data-locate`; a click on it clears the pulse. A host whose element can also be
 * clicked to put the object away (the Logbook tray item) adds `data-locate-manual` and calls `LocatePulse.opened`. Elements that appear later
 * (a tray item shown by a refresh) are picked up by `LocatePulse.sync`, which hosts may call after they render.
 */

import type { Objective } from './objective-types';
import './locate-pulse.css';

export const LOCATE_ATTR = 'data-locate';
export const PULSE_CLASS = 'locate-pulse';
/** Marks an element whose host clears the pulse itself (`LocatePulse.opened`), because a click on it is not always an opening */
export const MANUAL_ATTR = 'data-locate-manual';

export class LocatePulse {
  private static instance_: LocatePulse | null = null;

  /** `objectiveId|target` pairs that already fired, so a pulse is once per objective */
  private readonly fired_ = new Set<string>();
  /** Targets pulsing now */
  private readonly pending_ = new Set<string>();
  private readonly boundClick_ = (event: Event): void => this.onClick_(event);
  private readonly root_: Document;

  private constructor(root: Document) {
    this.root_ = root;
    root.addEventListener('click', this.boundClick_, true);
  }

  static getInstance(root: Document = document): LocatePulse {
    if (!LocatePulse.instance_) LocatePulse.instance_ = new LocatePulse(root);

    return LocatePulse.instance_;
  }

  static destroy(): void {
    LocatePulse.instance_?.dispose();
    LocatePulse.instance_ = null;
  }

  /** A host opened a target (for elements marked `data-locate-manual`): its pulse stops */
  static opened(target: string): void {
    LocatePulse.instance_?.clear(target);
  }

  /** Re-tag elements a host just rendered; does nothing before any objective has named a target */
  static syncIfActive(): void {
    LocatePulse.instance_?.sync();
  }

  /** The targets an objective's shown or hidden rows name, without repeats */
  static targetsOf(objective: Pick<Objective, 'conditions'>): string[] {
    const targets = new Set<string>();

    for (const condition of objective.conditions) {
      const target = condition.locate?.trim();

      if (target) targets.add(target);
    }

    return [...targets];
  }

  /** An objective became active: start the pulse for each of its targets that has not fired for it yet */
  objectiveActivated(objective: Pick<Objective, 'id' | 'conditions'>): void {
    let started = false;

    for (const target of LocatePulse.targetsOf(objective)) {
      const key = `${objective.id}|${target}`;

      if (this.fired_.has(key)) continue;
      this.fired_.add(key);
      this.pending_.add(target);
      started = true;
    }
    if (started) this.sync();
  }

  /** The targets pulsing now */
  pendingTargets(): readonly string[] {
    return [...this.pending_];
  }

  /** The player opened a target: its pulse stops */
  clear(target: string): void {
    if (this.pending_.delete(target)) this.sync();
  }

  /** Put the pulse class on every tagged element whose target is pending, and take it off the rest */
  sync(): void {
    for (const el of this.root_.querySelectorAll<HTMLElement>(`[${LOCATE_ATTR}]`)) {
      el.classList.toggle(PULSE_CLASS, this.pending_.has(el.getAttribute(LOCATE_ATTR) ?? ''));
    }
  }

  dispose(): void {
    this.root_.removeEventListener('click', this.boundClick_, true);
    this.pending_.clear();
    this.fired_.clear();
    for (const el of this.root_.querySelectorAll<HTMLElement>(`.${PULSE_CLASS}`)) el.classList.remove(PULSE_CLASS);
  }

  private onClick_(event: Event): void {
    const el = event.target instanceof Element ? event.target.closest(`[${LOCATE_ATTR}]`) : null;

    if (el?.hasAttribute(MANUAL_ATTR)) return;
    const target = el?.getAttribute(LOCATE_ATTR);

    if (target) this.clear(target);
  }
}
