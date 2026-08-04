import { CampaignManager } from "@app/campaigns/campaign-manager";
import { CampaignHeaderIdentity } from "@app/campaigns/campaign-types";
import { activeChromeVariant } from "@app/campaigns/chrome-variant";
import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { AggregatedAlarm, AlarmStateChangedData, Events, SimulatedTimeTickData, TimeSkipEndedData } from "@app/events/events";
import { ObjectivesManager } from "@app/objectives/objectives-manager";
import { ScenarioManager } from "@app/scenario-manager";
import { getSimulatedNowMs } from "@app/simulation/sim-time";
import { SkipTarget, TimeSkipController } from "@app/simulation/time-skip-controller";
import { formatAstroClock, formatDtg, formatDurationCompact } from "./time-skip-format";
import { TimeSkipModal } from "./time-skip-modal";
import { TimeSkipOverlay } from "./time-skip-overlay";

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

  /**
   * Re-predicting passes is an SGP4 sweep over the whole planning horizon, so
   * the skip control resolves its target on this cadence (simulated ms) and
   * only re-renders the countdown in between.
   */
  private static readonly SKIP_TARGET_RECOMPUTE_MS = 30_000;

  /**
   * Opt-in per scenario (settings.timeSkip). Declared before html_ so the
   * template can leave the control out entirely rather than hide it.
   */
  private readonly isTimeSkipEnabled_ = GlobalCommandBar.readTimeSkipEnabled_();

  /**
   * Resolved before html_ (declaration order is initialization order) so the
   * template can inline the wordmark rather than patch it after mount.
   */
  private readonly headerIdentity_ = GlobalCommandBar.readHeaderIdentity_();

  /**
   * Campaign title for the astro variant's Global-Status-Bar "domain" line
   * (the micro-label above the wordmark, e.g. 9TH ELECTRONIC WARFARE
   * SQUADRON). Empty for every other variant, which renders nothing.
   */
  private readonly gsbDomain_ = GlobalCommandBar.readGsbDomain_();

  /**
   * Chrome variant of the active campaign. Everything else the variant changes
   * is CSS; the two things it changes here - clock format and timer wording -
   * are content, so they have to be resolved in the component. Declared before
   * html_ for the same reason headerIdentity_ is.
   */
  private readonly chromeVariant_ = activeChromeVariant();

  /**
   * Military watch floors label the clocks by task, not by narrative. Same
   * timers, same behavior, different plate. Both military variants share the
   * labels - the wording belongs to the crew, not to the console vendor.
   */
  private readonly timerLabels_ = this.chromeVariant_ === 'tactical' || this.chromeVariant_ === 'astro'
    ? { objective: 'TASK', scenario: 'MSN' }
    : { objective: 'OBJECTIVE', scenario: 'MISSION' };

  private timeSkipBtn_: HTMLButtonElement | null = null;
  private timeSkipOverlay_: TimeSkipOverlay | null = null;
  private skipTarget_: SkipTarget | null = null;
  private lastSkipTargetComputeMs_ = 0;
  private readonly boundOnTimeSkipEnded_: (data: TimeSkipEndedData) => void;

  constructor(private readonly parentContainerId_: string) {
    this.boundOnAlarmStateChanged_ = this.onAlarmStateChanged_.bind(this);
    this.boundOnSimulatedTimeTick_ = this.onSimulatedTimeTick_.bind(this);
    this.boundOnTimeSkipEnded_ = this.onTimeSkipEnded_.bind(this);
    this.init_();
    this.subscribeToAlarms_();
    this.subscribeToSimulatedTime_();
    this.startTimerUpdates_();
  }

  /**
   * Wordmark/icon for the active campaign. The bar used to hardcode
   * ORBITAL/OPS + a globe for every campaign, which misnames stations that are
   * not an ops floor (Campaign 3 is a backyard). Falls back to the historic
   * values so a campaign that omits headerIdentity is unchanged.
   */
  private static readHeaderIdentity_(): CampaignHeaderIdentity {
    const fallback: CampaignHeaderIdentity = {
      name: 'ORBITAL',
      nameAccent: 'OPS',
      icon: 'fa-solid fa-earth-americas',
    };

    try {
      const scenarioId = ScenarioManager.getInstance().data.id;

      return CampaignManager.getInstance().getCampaignForScenario(scenarioId)?.headerIdentity ?? fallback;
    } catch {
      // ScenarioManager not initialized (menus, sandbox boot) - use the default.
      return fallback;
    }
  }

  /**
   * Domain line for the astro Global Status Bar: the campaign title, upper-
   * cased by CSS. Returns '' outside the astro variant (or outside a
   * scenario), and '' renders nothing.
   */
  private static readGsbDomain_(): string {
    try {
      const scenarioId = ScenarioManager.getInstance().data.id;
      const campaign = CampaignManager.getInstance().getCampaignForScenario(scenarioId);

      return campaign?.chromeVariant === 'astro' ? campaign.title : '';
    } catch {
      // ScenarioManager not initialized (menus, sandbox boot) - no domain line.
      return '';
    }
  }

  /** Whether the scenario opted into the skip control. */
  private static readTimeSkipEnabled_(): boolean {
    try {
      return ScenarioManager.getInstance().settings.timeSkip !== undefined;
    } catch {
      // ScenarioManager not initialized (menus, sandbox boot) - no scenario, no skip.
      return false;
    }
  }

  private readonly html_ = html`
    <!-- 1. GLOBAL COMMAND BAR (Top) -->
    <header id="global-command-bar-container" class="app-shell-header shadow-lg">

      <!-- Left: Branding & Clock -->
      <div class="command-bar-left">
        <i class="${this.headerIdentity_.icon} text-blue-500 text-xl mr-3"></i>
        <div>
          ${this.gsbDomain_ ? html`<div class="astro-gsb-domain">${this.gsbDomain_}</div>` : ''}
          <div class="font-bold tracking-wide text-white">${this.headerIdentity_.name}<span class="text-blue-500">${this.headerIdentity_.nameAccent}</span></div>
          <div class="text-[10px] text-slate-400 font-mono" id="utc-clock">${this.clockPlaceholder_()}</div>
        </div>
        ${this.isTimeSkipEnabled_ ? html`
          <button id="time-skip-control" class="time-skip-btn" type="button" disabled>
            <i class="fa-solid fa-forward"></i>
            <span id="time-skip-control-label">Skip</span>
          </button>
        ` : ''}
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
              <div class="timer-label">${this.timerLabels_.objective}</div>
              <div class="timer-value" id="objective-timer-value">--:--</div>
          </div>
          <div id="scenario-timer-display" class="timer-display" style="display: none;">
              <div class="timer-label">${this.timerLabels_.scenario}</div>
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
    this.initTimeSkip_(parentDom);
  }

  /**
   * Mount the skip control and the fast-forward overlay. No-op unless the
   * scenario declared settings.timeSkip.
   */
  private initTimeSkip_(parentDom: HTMLElement | null): void {
    if (!this.isTimeSkipEnabled_) {
      return;
    }

    this.timeSkipBtn_ = parentDom?.querySelector<HTMLButtonElement>('#time-skip-control') ?? null;
    this.timeSkipBtn_?.addEventListener('click', () => this.handleTimeSkipClick_());
    this.timeSkipOverlay_ = new TimeSkipOverlay();
    EventBus.getInstance().on(Events.TIME_SKIP_ENDED, this.boundOnTimeSkipEnded_);
    this.refreshTimeSkipControl_(true);
  }

  private handleTimeSkipClick_(): void {
    const target = this.skipTarget_ ?? TimeSkipController.getInstance().findTarget();

    if (target) {
      TimeSkipModal.getInstance().showConfirmation(target);
    }
  }

  private onTimeSkipEnded_(_data: TimeSkipEndedData): void {
    // The wait the button was advertising is gone - re-resolve immediately
    // rather than showing a stale countdown until the next recompute.
    this.refreshTimeSkipControl_(true);
  }

  /**
   * Update the skip control's enabled state and countdown.
   *
   * @param force Re-predict passes now instead of waiting for the recompute cadence
   */
  private refreshTimeSkipControl_(force = false): void {
    if (!this.isTimeSkipEnabled_ || !this.timeSkipBtn_) {
      return;
    }

    const controller = TimeSkipController.getInstance();
    const labelEl = this.timeSkipBtn_.querySelector('#time-skip-control-label');

    if (controller.isSkipping) {
      this.timeSkipBtn_.disabled = true;

      return;
    }

    // Resolve the blocked state before predicting anything. Pass prediction is
    // an SGP4 sweep, and while the clock is paused (brief open, boot) there is
    // nothing to predict against - the earlier version burned a sweep per
    // second at the title screen and reported a stale reason.
    const blockedReason = controller.getBlockedReason();

    if (blockedReason !== null) {
      this.timeSkipBtn_.disabled = true;
      this.timeSkipBtn_.title = blockedReason;

      return;
    }

    const nowMs = getSimulatedNowMs();

    if (force || Math.abs(nowMs - this.lastSkipTargetComputeMs_) >= GlobalCommandBar.SKIP_TARGET_RECOMPUTE_MS) {
      this.lastSkipTargetComputeMs_ = nowMs;
      this.skipTarget_ = controller.findTarget();
    }

    this.timeSkipBtn_.disabled = this.skipTarget_ === null;
    this.timeSkipBtn_.title = this.skipTarget_
      ? `Advance to ${this.skipTarget_.satelliteName} AOS`
      : 'No upcoming contact to skip to';

    if (labelEl) {
      // Count down from the live clock, not from the value cached at predict
      // time, so the label stays truthful between recomputes.
      labelEl.textContent = this.skipTarget_
        ? `Skip ${formatDurationCompact(this.skipTarget_.targetMs - nowMs)}`
        : 'Skip';
    }
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

  /** Pre-first-tick clock text, shaped like the variant's format will be. */
  private clockPlaceholder_(): string {
    switch (this.chromeVariant_) {
      case 'tactical':
        return '------Z --- --';
      case 'astro':
        return '---- --- --:--:--';
      default:
        return '-- --- ---- --:--:--';
    }
  }

  /**
   * Paint the clock. The tick already carries a formatted string, but the
   * military variants write the same instant differently (tactical as a
   * date-time group, astro as year/day-of-year) - so they re-format from
   * `timestampMs` rather than having OpsLogManager (and every log line it
   * stamps) learn about chrome variants.
   */
  private onSimulatedTimeTick_(data: SimulatedTimeTickData): void {
    if (!this.clockEl_) {
      return;
    }

    switch (this.chromeVariant_) {
      case 'tactical':
        this.clockEl_.textContent = formatDtg(data.timestampMs);
        break;
      case 'astro':
        this.clockEl_.textContent = formatAstroClock(data.timestampMs);
        break;
      default:
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
   * Render severity count badges.
   *
   * The astro variant renders all three as always-visible monitoring chips
   * the way an Astro Global Status Bar does - a zeroed chip is information
   * ("no criticals"), not noise - with a `zero` class so CSS can mute it.
   * Other variants keep the historic render-only-nonzero ticker badges.
   */
  private renderCountBadges_(counts: { error: number; warning: number; info: number }): void {
    if (!this.countsEl_) return;

    const alwaysVisible = this.chromeVariant_ === 'astro';
    const badges: string[] = [];

    if (counts.error > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count error ${counts.error === 0 ? 'zero' : ''}" title="${counts.error} Error${counts.error > 1 ? 's' : ''}">
          <i class="fa-solid fa-circle-exclamation"></i> ${counts.error}
        </span>
      `);
    }

    if (counts.warning > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count warning ${counts.warning === 0 ? 'zero' : ''}" title="${counts.warning} Warning${counts.warning > 1 ? 's' : ''}">
          <i class="fa-solid fa-triangle-exclamation"></i> ${counts.warning}
        </span>
      `);
    }

    if (counts.info > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count info ${counts.info === 0 ? 'zero' : ''}" title="${counts.info} Info">
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
    // Update every second. Deliberately a real-time interval rather than the
    // SIMULATED_TIME_TICK handler: the scenario clock stops while a brief is
    // open, and the skip control has to keep reporting why it is unavailable
    // during exactly that window.
    this.timerUpdateInterval_ = window.setInterval(() => {
      this.updateTimerDisplays_();
      this.refreshTimeSkipControl_();
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
    EventBus.getInstance().off(Events.TIME_SKIP_ENDED, this.boundOnTimeSkipEnded_);
    this.timeSkipOverlay_?.dispose();
    this.timeSkipOverlay_ = null;
    TimeSkipModal.destroy();

    if (this.timerUpdateInterval_) {
      clearInterval(this.timerUpdateInterval_);
      this.timerUpdateInterval_ = null;
    }
  }
}
