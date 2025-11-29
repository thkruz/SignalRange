import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";
import { EventBus } from "@app/events/event-bus";
import { Events, AlarmStateChangedData, AggregatedAlarm } from "@app/events/events";

/**
 * GlobalCommandBar
 *
 * Displays AOS countdown and a dynamic alarm ticker.
 * Subscribes to ALARM_STATE_CHANGED events to update the ticker display.
 *
 * Ticker behavior:
 * - Updates are queued and applied at animation loop start (not mid-scroll)
 * - Animation speed scales with content length
 * - Width is max(container width, content width)
 */
export class GlobalCommandBar {
  readonly id = 'global-command-bar-container';
  protected dom_: HTMLElement | null = null;
  private tickerEl_: HTMLElement | null = null;
  private tickerContainerEl_: HTMLElement | null = null;
  private tickerWrapEl_: HTMLElement | null = null;
  private readonly boundOnAlarmStateChanged_: (data: AlarmStateChangedData) => void;
  private readonly boundOnAnimationIteration_: () => void;

  /** Queued update to apply at next animation loop */
  private pendingUpdate_: { alarms: AggregatedAlarm[]; severity: string } | null = null;

  /** Pixels per second for ticker scroll speed */
  private readonly SCROLL_SPEED_ = 100;

  /** Minimum animation duration in seconds */
  private readonly MIN_DURATION_ = 8;

  constructor(private readonly parentContainerId_: string) {
    this.boundOnAlarmStateChanged_ = this.onAlarmStateChanged_.bind(this);
    this.boundOnAnimationIteration_ = this.onAnimationIteration_.bind(this);
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
        <!-- Alarm Ticker -->
        <div id="alarm-ticker" class="command-bar-ticker healthy">
          <div id="ticker-wrap" class="ticker-wrap">
            <div id="ticker-content" class="ticker-move text-[10px] font-mono text-green-400">
              <span class="ticker-item"><i class="fa-solid fa-circle-check mr-1"></i> SYSTEM STABLE</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: User & System Status -->
      <div class="command-bar-right">
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
      </div>
    </header>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.tickerEl_ = qs('#ticker-content', parentDom);
    this.tickerContainerEl_ = qs('#alarm-ticker', parentDom);
    this.tickerWrapEl_ = qs('#ticker-wrap', parentDom);

    // Listen for animation iteration to apply queued updates
    this.tickerEl_?.addEventListener('animationiteration', this.boundOnAnimationIteration_);

    // Set initial animation duration
    this.updateAnimationDuration_();
  }

  private subscribeToAlarms_(): void {
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
  }

  private onAlarmStateChanged_(data: AlarmStateChangedData): void {
    // Queue the update for next animation loop
    this.pendingUpdate_ = {
      alarms: data.alarms,
      severity: data.highestSeverity
    };

    // If this is the first update or animation isn't running, apply immediately
    if (!this.tickerEl_?.style.animationDuration || this.tickerEl_.style.animationDuration === '0s') {
      this.applyPendingUpdate_();
    }
  }

  /**
   * Called when animation completes one iteration - apply any pending updates
   */
  private onAnimationIteration_(): void {
    if (this.pendingUpdate_) {
      this.applyPendingUpdate_();
    }
  }

  /**
   * Apply the pending update to the ticker
   */
  private applyPendingUpdate_(): void {
    if (!this.pendingUpdate_ || !this.tickerEl_ || !this.tickerContainerEl_) return;

    const { alarms, severity } = this.pendingUpdate_;
    this.pendingUpdate_ = null;

    // Update container class for background color
    this.tickerContainerEl_.classList.remove('alarm', 'warn', 'healthy', 'info');

    if (alarms.length === 0) {
      // System stable - no alarms
      this.tickerEl_.innerHTML = `<span class="ticker-item text-green-400"><i class="fa-solid fa-circle-check mr-1"></i> SYSTEM STABLE</span>`;
      this.tickerEl_.className = 'ticker-move text-[10px] font-mono text-green-400';
      this.tickerContainerEl_.classList.add('healthy');
    } else {
      // Build ticker items - format: VT-01(RF1): MESSAGE
      const color = this.getColorClass_(severity);
      const icon = this.getIcon_(severity);
      this.tickerEl_.innerHTML = alarms.map(alarm =>
        `<span class="ticker-item ${color}"><i class="${icon} mr-1"></i> ${alarm.assetId}(${alarm.equipmentType}${alarm.equipmentIndex + 1}): ${alarm.message}</span>`
      ).join('');

      this.tickerEl_.className = `ticker-move text-[10px] font-mono ${color}`;

      // Set container background based on severity
      if (severity === 'error') this.tickerContainerEl_.classList.add('alarm');
      else if (severity === 'warning') this.tickerContainerEl_.classList.add('warn');
      else if (severity === 'info') this.tickerContainerEl_.classList.add('info');
    }

    // Update animation duration and width after content change
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => this.updateAnimationDuration_());
  }

  /**
   * Calculate and set animation duration based on content width
   * Also ensures ticker width is at least container width
   */
  private updateAnimationDuration_(): void {
    if (!this.tickerEl_ || !this.tickerWrapEl_) return;

    // Get the container width
    const containerWidth = this.tickerWrapEl_.offsetWidth;

    // Temporarily remove animation to measure natural content width
    this.tickerEl_.style.animation = 'none';
    this.tickerEl_.style.width = 'auto';

    // Force reflow and get actual content width
    const contentWidth = (this.tickerEl_.offsetWidth, this.tickerEl_.scrollWidth);

    // Width should be max(containerWidth, contentWidth)
    const effectiveWidth = Math.max(containerWidth, contentWidth);
    this.tickerEl_.style.width = `${effectiveWidth}px`;

    // Calculate duration based on total distance to travel
    // Animation goes from translateX(100%) to translateX(-100%)
    // So total distance is 2 * effectiveWidth
    const totalDistance = 2 * effectiveWidth;
    const duration = Math.max(this.MIN_DURATION_, totalDistance / this.SCROLL_SPEED_);

    // Restore animation with new duration
    this.tickerEl_.style.animation = '';
    this.tickerEl_.style.animationDuration = `${duration}s`;

    // Ensure the animation class is applied
    if (!this.tickerEl_.classList.contains('ticker-move')) {
      this.tickerEl_.classList.add('ticker-move');
    }
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
    this.tickerEl_?.removeEventListener('animationiteration', this.boundOnAnimationIteration_);
  }
}
