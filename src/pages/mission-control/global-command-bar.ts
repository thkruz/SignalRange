import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { AggregatedAlarm, AlarmStateChangedData, Events, SimulatedTimeTickData } from "@app/events/events";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { ScenarioManager } from "@app/scenario-manager";

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
  private objectiveTimerEl_: HTMLElement | null = null;
  private scenarioTimerEl_: HTMLElement | null = null;
  private readonly boundOnAlarmStateChanged_: (data: AlarmStateChangedData) => void;
  private readonly boundOnSimulatedTimeTick_: (data: SimulatedTimeTickData) => void;
  private timerUpdateInterval_: number | null = null;
  private clockEl_: HTMLElement | null = null;
  private scenarioInfoEl_: HTMLElement | null = null;

  /** Maximum number of alarms to show inline */
  private readonly MAX_INLINE_ALARMS_ = 3;

  constructor(private readonly parentContainerId_: string) {
    this.boundOnAlarmStateChanged_ = this.onAlarmStateChanged_.bind(this);
    this.boundOnSimulatedTimeTick_ = this.onSimulatedTimeTick_.bind(this);
    this.init_();
    this.subscribeToAlarms_();
    this.subscribeToSimulatedTime_();
    this.startTimerUpdates_();
  }

  private readonly html_ = html`
    <!-- 1. GLOBAL COMMAND BAR (Top) -->
    <header id="global-command-bar-container" class="app-shell-header shadow-lg">

      <!-- Left: Branding & Clock -->
      <div class="command-bar-left">
        <i class="fa-solid fa-earth-americas text-blue-500 text-xl mr-3"></i>
        <div>
          <div class="font-bold tracking-wide text-white">ORBITAL<span class="text-blue-500">OPS</span></div>
          <div class="text-[10px] text-slate-400 font-mono" id="utc-clock">-- --- ---- --:--:--</div>
        </div>
      </div>

      <div id="${this.id}" class="command-bar-center">
        <!-- AOS Countdown -->
        <div class="aos-countdown">
          <div id="scenario-info" class="absolute left-4 flex items-center gap-2 text-xs text-slate-500">
            <span class="px-1.5 py-0.5">SCENARIO --</span>
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

      <!-- Right: Timer Displays -->
      <div class="command-bar-right">
          <div id="objective-timer-display" class="timer-display" style="display: none;">
              <div class="timer-label">OBJECTIVE</div>
              <div class="timer-value" id="objective-timer-value">--:--</div>
          </div>
          <div id="scenario-timer-display" class="timer-display" style="display: none;">
              <div class="timer-label">MISSION</div>
              <div class="timer-value" id="scenario-timer-value">--:--</div>
          </div>
      </div>
    </header>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.alarmBarEl_ = qs('#alarm-bar', parentDom);
    this.countsEl_ = qs('#alarm-counts', parentDom);
    this.messagesEl_ = qs('#alarm-messages', parentDom);
    this.objectiveTimerEl_ = parentDom?.querySelector('#objective-timer-display') ?? null;
    this.scenarioTimerEl_ = parentDom?.querySelector('#scenario-timer-display') ?? null;
    this.clockEl_ = parentDom?.querySelector('#utc-clock') ?? null;
    this.scenarioInfoEl_ = parentDom?.querySelector('#scenario-info') ?? null;
    this.updateScenarioInfo_();
  }

  private updateScenarioInfo_(): void {
    if (!this.scenarioInfoEl_) return;

    try {
      const scenarioData = ScenarioManager.getInstance().data;
      const number = scenarioData.number;
      const title = scenarioData.title;
      this.scenarioInfoEl_.innerHTML = `
        <span class="px-1.5 py-0.5">
          SCENARIO ${number}: ${title}
        </span>
      `;
    } catch {
      // ScenarioManager not initialized yet - keep placeholder
    }
  }

  private subscribeToAlarms_(): void {
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
  }

  private subscribeToSimulatedTime_(): void {
    EventBus.getInstance().on(Events.SIMULATED_TIME_TICK, this.boundOnSimulatedTimeTick_);
  }

  private onSimulatedTimeTick_(data: SimulatedTimeTickData): void {
    if (this.clockEl_) {
      this.clockEl_.textContent = data.timeFormatted;
    }
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

  /**
   * Start the timer update interval
   */
  private startTimerUpdates_(): void {
    // Update every second
    this.timerUpdateInterval_ = window.setInterval(() => {
      this.updateTimerDisplays_();
    }, 1000);

    // Initial update
    this.updateTimerDisplays_();
  }

  /**
   * Update the timer displays based on ObjectivesManager state
   */
  private updateTimerDisplays_(): void {
    let objectivesManager: ObjectivesManager | null = null;
    try {
      objectivesManager = ObjectivesManager.getInstance();
    } catch {
      // ObjectivesManager not initialized yet
    }

    // Update scenario timer
    if (this.scenarioTimerEl_) {
      const valueEl = this.scenarioTimerEl_.querySelector('#scenario-timer-value');
      this.scenarioTimerEl_.style.display = 'flex';

      if (!objectivesManager) {
        // Not initialized yet - show pending state
        if (valueEl) {
          valueEl.textContent = '--:--';
        }
        this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-failed');
      } else if (objectivesManager.hasScenarioTimer()) {
        const timeRemaining = objectivesManager.getScenarioTimeRemaining();

        // Check if scenario timer has expired (time is 0 or less)
        if (timeRemaining <= 0) {
          if (valueEl) {
            valueEl.textContent = 'FAIL';
          }
          this.scenarioTimerEl_.classList.add('timer-failed');
          this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited');
        } else {
          const timeStr = objectivesManager.formatTimeRemaining(timeRemaining);
          if (valueEl) {
            valueEl.textContent = timeStr;
          }

          // Add urgency class
          if (timeRemaining <= 60) {
            this.scenarioTimerEl_.classList.add('timer-urgent');
            this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-unlimited', 'timer-failed');
          } else if (timeRemaining <= 300) {
            this.scenarioTimerEl_.classList.add('timer-warning');
            this.scenarioTimerEl_.classList.remove('timer-urgent', 'timer-unlimited', 'timer-failed');
          } else {
            this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-failed');
          }
        }
      } else {
        // No time limit - show unlimited indicator
        if (valueEl) {
          valueEl.textContent = '∞';
        }
        this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-failed');
        this.scenarioTimerEl_.classList.add('timer-unlimited');
      }
    }

    // Update objective timer - find the first active objective with a running timer
    if (this.objectiveTimerEl_) {
      let activeObjectiveTimer: { time: number; title: string } | null = null;
      let failedObjective: { title: string } | null = null;
      let passedObjective: { title: string } | null = null;

      if (objectivesManager) {
        // Check for quiz passed state first
        if (objectivesManager.isQuizPassed()) {
          const passedId = objectivesManager.getPassedObjectiveId();
          const passedState = objectivesManager.getObjectiveStates().find(s => s.objective.id === passedId);
          if (passedState) {
            passedObjective = { title: passedState.objective.title };
          }
        } else {
          const states = objectivesManager.getObjectiveStates();
          for (const state of states) {
            // Check for failed objectives first
            if (state.isFailed && state.objective.timeLimitSeconds !== undefined) {
              failedObjective = { title: state.objective.title };
              break; // Show failed state
            }
            if (state.isTimerRunning && !state.isCompleted && !state.isFailed &&
              state.timeRemainingSeconds !== undefined) {
              activeObjectiveTimer = {
                time: state.timeRemainingSeconds,
                title: state.objective.title
              };
              break; // Show the first active timed objective
            }
          }
        }
      }

      const valueEl = this.objectiveTimerEl_.querySelector('#objective-timer-value');
      this.objectiveTimerEl_.style.display = 'flex';

      if (!objectivesManager) {
        // Not initialized yet - show pending state
        if (valueEl) {
          valueEl.textContent = '--:--';
        }
        this.objectiveTimerEl_.title = '';
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-failed', 'timer-passed');
      } else if (passedObjective) {
        // Quiz passed - show PASS in green
        if (valueEl) {
          valueEl.textContent = 'PASS';
        }
        this.objectiveTimerEl_.title = `Passed: ${passedObjective.title}`;
        this.objectiveTimerEl_.classList.add('timer-passed');
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-failed');
      } else if (failedObjective) {
        // An objective has failed - show FAIL in red
        if (valueEl) {
          valueEl.textContent = 'FAIL';
        }
        this.objectiveTimerEl_.title = `Failed: ${failedObjective.title}`;
        this.objectiveTimerEl_.classList.add('timer-failed');
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-passed');
      } else if (activeObjectiveTimer) {
        const timeStr = objectivesManager.formatTimeRemaining(activeObjectiveTimer.time);
        if (valueEl) {
          valueEl.textContent = timeStr;
        }
        this.objectiveTimerEl_.title = activeObjectiveTimer.title;

        // Add urgency class
        if (activeObjectiveTimer.time <= 30) {
          this.objectiveTimerEl_.classList.add('timer-urgent');
          this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-unlimited', 'timer-failed', 'timer-passed');
        } else if (activeObjectiveTimer.time <= 60) {
          this.objectiveTimerEl_.classList.add('timer-warning');
          this.objectiveTimerEl_.classList.remove('timer-urgent', 'timer-unlimited', 'timer-failed', 'timer-passed');
        } else {
          this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-unlimited', 'timer-failed', 'timer-passed');
        }
      } else {
        // No active timed objective - show unlimited indicator
        if (valueEl) {
          valueEl.textContent = '∞';
        }
        this.objectiveTimerEl_.title = 'No time limit';
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-failed', 'timer-passed');
        this.objectiveTimerEl_.classList.add('timer-unlimited');
      }
    }
  }

  dispose(): void {
    EventBus.getInstance().off(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
    EventBus.getInstance().off(Events.SIMULATED_TIME_TICK, this.boundOnSimulatedTimeTick_);

    if (this.timerUpdateInterval_) {
      clearInterval(this.timerUpdateInterval_);
      this.timerUpdateInterval_ = null;
    }
  }
}
