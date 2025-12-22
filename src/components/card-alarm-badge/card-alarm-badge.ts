import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { AlarmStatus } from "@app/equipment/base-equipment";
import './card-alarm-badge.css';

/**
 * CardAlarmBadge - LED indicator for equipment card headers
 * Shows current alarm status with tooltip on hover
 *
 * LED States:
 * - Green: No alarms (system normal)
 * - Amber: Warning condition(s)
 * - Red: Error condition(s)
 * - Blue: Info condition(s)
 * - Gray: Equipment off/inactive
 */
export class CardAlarmBadge {
  private readonly html_: string;
  private readonly uniqueId_: string;
  private dom_?: HTMLElement;
  private ledEl_?: HTMLElement;

  constructor(uniqueId: string) {
    this.uniqueId_ = uniqueId;
    this.html_ = html`
      <div id="${uniqueId}" class="card-alarm-badge">
        <div class="card-alarm-led success" title="System Normal"></div>
      </div>
    `;
  }

  static create(uniqueId: string): CardAlarmBadge {
    return new CardAlarmBadge(uniqueId);
  }

  get html(): string {
    return this.html_;
  }

  private get dom(): HTMLElement {
    this.dom_ ??= qs(`#${this.uniqueId_}`);
    return this.dom_;
  }

  private get ledEl(): HTMLElement {
    this.ledEl_ ??= qs('.card-alarm-led', this.dom);
    return this.ledEl_;
  }

  /**
   * Update badge based on current alarms
   * @param alarms Array of current alarm statuses
   */
  update(alarms: AlarmStatus[]): void {
    const severity = this.getHighestSeverity_(alarms);
    const messages = this.getAlarmMessages_(alarms);

    // Update LED class
    const newClass = `card-alarm-led ${severity}`;
    if (this.ledEl.className !== newClass) {
      this.ledEl.className = newClass;
    }

    // Update tooltip
    const newTitle = messages || 'System Normal';
    if (this.ledEl.title !== newTitle) {
      this.ledEl.title = newTitle;
    }
  }

  /**
   * Get highest severity from alarms
   * Priority: error > warning > info > success
   */
  private getHighestSeverity_(alarms: AlarmStatus[]): string {
    // Filter out 'off' and 'success' for determining if there are actual alarms
    const activeAlarms = alarms.filter(a => a.severity !== 'off' && a.severity !== 'success');

    if (activeAlarms.length === 0) {
      return 'success';
    }

    if (activeAlarms.some(a => a.severity === 'error')) {
      return 'error';
    }
    if (activeAlarms.some(a => a.severity === 'warning')) {
      return 'warning';
    }
    if (activeAlarms.some(a => a.severity === 'info')) {
      return 'info';
    }

    return 'success';
  }

  /**
   * Get alarm messages for tooltip
   */
  private getAlarmMessages_(alarms: AlarmStatus[]): string {
    const activeAlarms = alarms.filter(a =>
      a.severity !== 'off' && a.severity !== 'success' && a.message
    );

    if (activeAlarms.length === 0) {
      return '';
    }

    // Sort by severity (error first)
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
    activeAlarms.sort((a, b) =>
      (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
    );

    return activeAlarms.map(a => a.message).join('\n');
  }

  dispose(): void {
    this.dom_ = undefined;
    this.ledEl_ = undefined;
  }
}
