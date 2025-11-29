import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { AggregatedAlarm, AlarmStateChangedData, Events } from "@app/events/events";

/**
 * GlobalCommandBar
 *
 * Displays AOS countdown and a static alarm bar.
 * Subscribes to ALARM_STATE_CHANGED events to update the display immediately.
 *
 * Static alarm bar shows:
 * - Severity count badges (errors, warnings, info)
 * - Top 3 most severe alarms inline
 * - "+N more" overflow indicator
 */
export class GlobalCommandBar {
  readonly id = 'global-command-bar-container';
  protected dom_: HTMLElement | null = null;
  private alarmBarEl_: HTMLElement | null = null;
  private countsEl_: HTMLElement | null = null;
  private messagesEl_: HTMLElement | null = null;
  private readonly boundOnAlarmStateChanged_: (data: AlarmStateChangedData) => void;

  /** Maximum number of alarms to show inline */
  private readonly MAX_INLINE_ALARMS_ = 3;

  constructor(private readonly parentContainerId_: string) {
    this.boundOnAlarmStateChanged_ = this.onAlarmStateChanged_.bind(this);
    this.init_();
    this.subscribeToAlarms_();
  }

  private readonly html_ = html`
    <!-- 1. GLOBAL COMMAND BAR (Top) -->
    <header id="global-command-bar-container" class="app-shell-header shadow-lg">

      <!-- Left: Branding & Clock -->
      <div class="command-bar-left">
        <i class="fa-solid fa-earth-americas text-blue-500 text-xl mr-3"></i>
        <div>
          <div class="font-bold tracking-wide text-white">ORBITAL<span class="text-blue-500">OPS</span></div>
          <div class="text-[10px] text-slate-400 font-mono" id="utc-clock">Loading...</div>
        </div>
      </div>

      <div id="${this.id}" class="command-bar-center">
        <!-- AOS Countdown -->
        <div class="aos-countdown">
          <div class="absolute left-4 flex items-center gap-2 text-xs text-slate-500">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">PASS ID: 9942</span>
            <span>SAT: GALAXY-19</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-xs text-slate-400 font-medium tracking-widest">NEXT AOS IN</span>
            <span class="text-2xl font-mono font-bold text-white tracking-widest">00:14:32</span>
            <span class="text-[10px] text-slate-500">EL 12.5° RISING</span>
          </div>
        </div>
        <!-- Static Alarm Bar -->
        <div id="alarm-bar" class="command-bar-alarm-bar healthy">
          <div id="alarm-counts" class="alarm-counts"></div>
          <div id="alarm-messages" class="alarm-messages">
            <span class="alarm-stable text-green-400">
              <i class="fa-solid fa-circle-check mr-1"></i> SYSTEM STABLE
            </span>
          </div>
        </div>
      </div>

      <!-- Right: User & System Status -->
      <!-- <div class="command-bar-right">
          <div class="text-right">
              <div class="text-[10px] text-slate-400">NETWORK STATUS</div>
              <div class="flex gap-1">
                  <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  <span class="h-2 w-2 rounded-full bg-slate-700"></span>
              </div>
          </div>
          <div class="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
              <i class="fa-solid fa-user text-slate-400"></i>
          </div>
      </div> -->
    </header>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.alarmBarEl_ = qs('#alarm-bar', parentDom);
    this.countsEl_ = qs('#alarm-counts', parentDom);
    this.messagesEl_ = qs('#alarm-messages', parentDom);
  }

  private subscribeToAlarms_(): void {
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
  }

  private onAlarmStateChanged_(data: AlarmStateChangedData): void {
    // Apply immediately - no queuing needed for static display
    this.renderStaticAlarms_(data.alarms, data.highestSeverity);
  }

  /**
   * Render the static alarm bar with counts and top alarms
   */
  private renderStaticAlarms_(alarms: AggregatedAlarm[], severity: string): void {
    if (!this.alarmBarEl_ || !this.countsEl_ || !this.messagesEl_) return;

    // Count by severity
    const counts = { error: 0, warning: 0, info: 0 };
    alarms.forEach(a => {
      if (a.severity in counts) {
        counts[a.severity as keyof typeof counts]++;
      }
    });

    // Update count badges
    this.renderCountBadges_(counts);

    // Update container class for background color
    this.alarmBarEl_.classList.remove('alarm', 'warn', 'healthy', 'info');

    if (alarms.length === 0) {
      // System stable
      this.messagesEl_.innerHTML = `
        <span class="alarm-stable text-green-400">
          <i class="fa-solid fa-circle-check mr-1"></i> SYSTEM STABLE
        </span>
      `;
      this.alarmBarEl_.classList.add('healthy');
    } else {
      // Get top alarms by severity
      const topAlarms = this.getTopAlarms_(alarms, this.MAX_INLINE_ALARMS_);
      const overflowCount = alarms.length - topAlarms.length;

      this.renderAlarmMessages_(topAlarms, overflowCount);

      // Set container background based on severity
      if (severity === 'error') this.alarmBarEl_.classList.add('alarm');
      else if (severity === 'warning') this.alarmBarEl_.classList.add('warn');
      else if (severity === 'info') this.alarmBarEl_.classList.add('info');
    }
  }

  /**
   * Render severity count badges
   */
  private renderCountBadges_(counts: { error: number; warning: number; info: number }): void {
    if (!this.countsEl_) return;

    const badges: string[] = [];

    if (counts.error > 0) {
      badges.push(`
        <span class="alarm-count error" title="${counts.error} Error${counts.error > 1 ? 's' : ''}">
          <i class="fa-solid fa-circle-exclamation"></i> ${counts.error}
        </span>
      `);
    }

    if (counts.warning > 0) {
      badges.push(`
        <span class="alarm-count warning" title="${counts.warning} Warning${counts.warning > 1 ? 's' : ''}">
          <i class="fa-solid fa-triangle-exclamation"></i> ${counts.warning}
        </span>
      `);
    }

    if (counts.info > 0) {
      badges.push(`
        <span class="alarm-count info" title="${counts.info} Info">
          <i class="fa-solid fa-circle-info"></i> ${counts.info}
        </span>
      `);
    }

    this.countsEl_.innerHTML = badges.join('');
  }

  /**
   * Get top N alarms sorted by severity (errors first)
   */
  private getTopAlarms_(alarms: AggregatedAlarm[], limit: number): AggregatedAlarm[] {
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 };

    return [...alarms]
      .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
      .slice(0, limit);
  }

  /**
   * Render alarm messages with overflow indicator
   */
  private renderAlarmMessages_(alarms: AggregatedAlarm[], overflowCount: number): void {
    if (!this.messagesEl_) return;

    const items = alarms.map((alarm, index) => {
      const color = this.getColorClass_(alarm.severity);
      const icon = this.getIcon_(alarm.severity);
      const separator = index > 0 ? '<span class="alarm-separator">•</span>' : '';
      return `${separator}<span class="alarm-item ${color}"><i class="${icon} mr-1"></i>${alarm.assetId}(${alarm.equipmentType}${alarm.equipmentIndex + 1}): ${alarm.message}</span>`;
    });

    if (overflowCount > 0) {
      items.push(`<span class="alarm-overflow">+${overflowCount} more</span>`);
    }

    this.messagesEl_.innerHTML = items.join('');
  }

  private getColorClass_(severity: string): string {
    switch (severity) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      default: return 'text-green-400';
    }
  }

  private getIcon_(severity: string): string {
    switch (severity) {
      case 'error': return 'fa-solid fa-circle-exclamation';
      case 'warning': return 'fa-solid fa-triangle-exclamation';
      case 'info': return 'fa-solid fa-circle-info';
      default: return 'fa-solid fa-circle-check';
    }
  }

  dispose(): void {
    EventBus.getInstance().off(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
  }
}
