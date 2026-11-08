import { CampaignManager } from '@app/campaigns/campaign-manager';
import { CampaignHeaderIdentity } from '@app/campaigns/campaign-types';
import { activeChromeVariant } from '@app/campaigns/chrome-variant';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { AggregatedAlarm, AlarmStateChangedData, Events, SimulatedTimeTickData, TimeSkipEndedData } from '@app/events/events';
import { t7e } from '@app/locales/i18n';
import type { TimeSkipOffer } from '@app/objectives/objective-types';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { selectionText } from '@app/pages/selection-browser';
import { LoadoutModal } from '@app/sandbox/loadout-modal';
import { SandboxLoadoutService } from '@app/sandbox/sandbox-loadout';
import { ScenarioManager } from '@app/scenario-manager';
import { AlarmService } from '@app/services/alarm-service';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SkipTarget, TimeSkipController } from '@app/simulation/time-skip-controller';
import { SoundEvents } from '@app/sound/sound-events';
import { glyph, severityGlyph } from './glyphs';
import { formatAstroClock, formatDtg, formatDuration, formatDurationCompact } from './time-skip-format';
import { TimeSkipModal } from './time-skip-modal';
import { TimeSkipOverlay } from './time-skip-overlay';
import './global-command-bar.css';

/**
 * GlobalCommandBar
 *
 * Displays mission identity, simulation time, timers, and alarm status.
 * Subscribes to ALARM_STATE_CHANGED events to update the display immediately.
 *
 * The summary shows the highest-priority alarm; the disclosure lists all
 * tiers and stations, including live alarm details. Empty state is shown
 * only when no alarm of any severity is active.
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
  private readonly boundOnAssetSelected_: (data: { type: 'ground-station' | 'satellite'; id: string }) => void;
  /** Ground station selected in the asset tree, if any: the ticker says how much of its list is elsewhere */
  private selectedStationId_: string | null = null;
  private lastAlarms_: AlarmStateChangedData | null = null;
  private readonly boundOnSimulatedTimeTick_: (data: SimulatedTimeTickData) => void;
  private timerUpdateInterval_: number | null = null;
  private clockEl_: HTMLElement | null = null;
  private scenarioInfoEl_: HTMLElement | null = null;

  /** Maximum number of alarms to show inline */
  private readonly MAX_INLINE_ALARMS_ = 1;
  private readonly alarmListeners_ = new AbortController();

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
   * Whether any objective declares a timeSkip (Phase 27 Q4): the "Skip N min"
   * control renders hidden and shows while that objective's wait is on offer.
   */
  private readonly isObjectiveSkipEnabled_ = GlobalCommandBar.readObjectiveSkipEnabled_();

  /**
   * Sandboxes carry no authored mission, so their equipment is the operator's
   * to choose: the loadout control renders only there (see LoadoutModal).
   * Declared before html_ for the same reason isTimeSkipEnabled_ is.
   */
  private readonly isSandbox_ = GlobalCommandBar.readIsSandbox_();

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
  private readonly timerLabels_ =
    this.chromeVariant_ === 'tactical' || this.chromeVariant_ === 'astro' ? { objective: 'TASK', scenario: 'MSN' } : { objective: 'OBJECTIVE', scenario: 'MISSION' };

  private timeSkipBtn_: HTMLButtonElement | null = null;
  private objectiveSkipBtn_: HTMLButtonElement | null = null;
  private timeSkipOverlay_: TimeSkipOverlay | null = null;
  private skipTarget_: SkipTarget | null = null;
  private skipTooClose_: { satelliteName: string; untilAosMs: number } | null = null;
  private lastSkipTargetComputeMs_ = 0;
  private readonly boundOnTimeSkipEnded_: (data: TimeSkipEndedData) => void;
  private readonly boundOnObjectiveChanged_ = (): void => this.onObjectiveChanged_();
  private readonly boundOnMuteClick_ = (): void => this.toggleAlarmMute_();
  private muteBtn_: HTMLButtonElement | null = null;

  constructor(private readonly parentContainerId_: string) {
    this.boundOnAlarmStateChanged_ = this.onAlarmStateChanged_.bind(this);
    this.boundOnAssetSelected_ = this.onAssetSelected_.bind(this);
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
      icon: 'globe',
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

  /** Whether the active scenario is a sandbox (equipment is swappable). */
  private static readIsSandbox_(): boolean {
    try {
      return SandboxLoadoutService.isSandboxScenario(ScenarioManager.getInstance().data);
    } catch {
      // ScenarioManager not initialized (menus) - no scenario, no loadout.
      return false;
    }
  }

  /** Whether any objective of the scenario offers a timeSkip. */
  private static readObjectiveSkipEnabled_(): boolean {
    try {
      return (ScenarioManager.getInstance().data?.objectives ?? []).some((objective) => objective.timeSkip !== undefined);
    } catch {
      // ScenarioManager not initialized (menus, sandbox boot) - no scenario, no skip.
      return false;
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
    <header id="global-command-bar-container" class="app-shell-header">
      <div class="mission-heading-row">

      <!-- Left: Branding & Clock -->
      <div class="command-bar-left">
        <div>
          <div class="mission-station" title="${selectionText(this.gsbDomain_ || `${this.headerIdentity_.name}${this.headerIdentity_.nameAccent}`)}">${selectionText(this.headerIdentity_.name)}<span>${selectionText(this.headerIdentity_.nameAccent)}</span></div>
        </div>
      </div>

      <div class="command-bar-center">
        <!-- AOS Countdown -->
        <div class="aos-countdown">
          <div id="scenario-info">
            <span>Mission</span>
          </div>
          <!-- Skip and loadout controls live here, not beside the clock: a
               "Skip to 10:00" label squeezed the date/time out of the 256 px
               brand block (nats-r3-s10-F3), and with the clock on one line the
               sandbox LOADOUT button overflowed under this bar -->
          <div class="command-bar-skip-controls">
            <button id="mission-pause-control" class="time-skip-btn" type="button" title="Pause mission (Escape)">Pause</button>
            ${
              this.isTimeSkipEnabled_
                ? html`
              <button id="time-skip-control" class="time-skip-btn" type="button" disabled>
                ${glyph('forward')}
                <span id="time-skip-control-label">Skip</span>
              </button>
            `
                : ''
            }
            ${
              this.isObjectiveSkipEnabled_
                ? html`
              <button id="objective-skip-control" class="time-skip-btn" type="button" style="display: none;">
                ${glyph('forward')}
                <span id="objective-skip-control-label">Skip</span>
              </button>
            `
                : ''
            }
            ${
              this.isSandbox_
                ? html`
              <button id="loadout-control" class="loadout-btn" type="button" title="${t7e('loadout.buttonTitle')}">
                ${glyph('dish')}
                <span>${t7e('loadout.button')}</span>
              </button>
            `
                : ''
            }
          </div>
        </div>
      </div>
      </div>
      <div class="mission-status-row">
        <time id="utc-clock" class="mission-clock" tabindex="0">${this.clockPlaceholder_()}</time>
        <div id="alarm-bar" class="command-bar-alarm-bar healthy">
          <button id="alarm-summary" type="button" aria-expanded="false" aria-controls="mission-alarm-panel" title="View all active alarms">
            <span id="alarm-counts" class="alarm-counts"></span>
            <span id="alarm-messages" class="alarm-messages"><span class="alarm-stable">${severityGlyph('ok')} No active alarms</span></span>
            <svg class="alarm-disclosure" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          <button id="alarm-mute-btn" type="button" class="alarm-mute-btn" aria-pressed="false"></button>
        </div>
      </div>
      <section id="mission-alarm-panel" aria-label="Active alarms" hidden>
        <div class="mission-alarm-heading"><h2>Active alarms <span id="mission-alarm-total">0</span></h2>
          <button id="mission-alarm-close" type="button" aria-label="Close alarms">Close</button></div>
        <p class="mission-alarm-scope">All stations · Highest severity first</p>
        <ul id="mission-alarm-list"><li class="mission-alarm-empty">No active alarms</li></ul>
      </section>

      <!-- Right: Timer Displays -->
      <div class="command-bar-right">
          <div id="objective-timer-display" class="timer-display" style="display: none;">
              <div class="timer-label">${this.timerLabels_.objective}</div>
              <div class="timer-value" id="objective-timer-value">--:--</div>
          </div>
          <div id="scenario-timer-display" class="timer-display" style="display: none;">
              <div class="timer-label">${this.timerLabels_.scenario}<span id="scenario-timer-hold" class="timer-hold-tag" hidden>HOLD</span></div>
              <div class="timer-value" id="scenario-timer-value">--:--</div>
          </div>
      </div>
    </header>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    parentDom?.querySelector('#mission-pause-control')?.addEventListener('click', async () => {
      const { GameMenu } = await import('@app/game-menu/game-menu');
      GameMenu.getInstance().openPause();
    });
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.alarmBarEl_ = qs('#alarm-bar', parentDom);
    this.countsEl_ = qs('#alarm-counts', parentDom);
    this.messagesEl_ = qs('#alarm-messages', parentDom);
    this.muteBtn_ = parentDom?.querySelector<HTMLButtonElement>('#alarm-mute-btn') ?? null;
    this.muteBtn_?.addEventListener('click', this.boundOnMuteClick_);
    this.renderAlarmMute_();
    this.setupAlarmPanel_();
    this.objectiveTimerEl_ = parentDom?.querySelector('#objective-timer-display') ?? null;
    this.scenarioTimerEl_ = parentDom?.querySelector('#scenario-timer-display') ?? null;
    this.clockEl_ = parentDom?.querySelector('#utc-clock') ?? null;
    this.scenarioInfoEl_ = parentDom?.querySelector('#scenario-info') ?? null;
    this.updateScenarioInfo_();
    this.initTimeSkip_(parentDom);
    this.initLoadout_(parentDom);
  }

  /** Mount the loadout control. No-op outside a sandbox scenario. */
  private initLoadout_(parentDom: HTMLElement | null): void {
    if (!this.isSandbox_) {
      return;
    }

    parentDom?.querySelector<HTMLButtonElement>('#loadout-control')?.addEventListener('click', () => {
      LoadoutModal.getInstance().show();
    });
  }

  /**
   * Mount the skip control and the fast-forward overlay. No-op unless the
   * scenario declared settings.timeSkip.
   */
  private initTimeSkip_(parentDom: HTMLElement | null): void {
    if (!this.isTimeSkipEnabled_ && !this.isObjectiveSkipEnabled_) {
      return;
    }

    this.timeSkipBtn_ = parentDom?.querySelector<HTMLButtonElement>('#time-skip-control') ?? null;
    this.timeSkipBtn_?.addEventListener('click', () => this.handleTimeSkipClick_());
    this.objectiveSkipBtn_ = parentDom?.querySelector<HTMLButtonElement>('#objective-skip-control') ?? null;
    this.objectiveSkipBtn_?.addEventListener('click', () => {
      TimeSkipController.getInstance().startObjectiveSkip();
      this.refreshObjectiveSkipControl_();
    });
    this.timeSkipOverlay_ = new TimeSkipOverlay();
    EventBus.getInstance().on(Events.TIME_SKIP_ENDED, this.boundOnTimeSkipEnded_);
    this.refreshTimeSkipControl_(true);
    this.refreshObjectiveSkipControl_();
  }

  /**
   * Show the "Skip N min" control while an objective wait is on offer
   * (Phase 27 Q4), disabled with the reason when it cannot run right now.
   */
  private refreshObjectiveSkipControl_(): void {
    if (!this.objectiveSkipBtn_) {
      return;
    }

    const controller = TimeSkipController.getInstance();
    const offer = controller.findObjectiveSkip();
    this.objectiveSkipBtn_.style.display = offer && !controller.isSkipping ? '' : 'none';
    if (!offer) {
      return;
    }

    const blockedReason = controller.getObjectiveSkipBlockedReason(offer.objectiveId);
    const buttonText = GlobalCommandBar.objectiveSkipText(offer);
    this.objectiveSkipBtn_.disabled = blockedReason !== null;
    this.objectiveSkipBtn_.title = blockedReason ?? GlobalCommandBar.objectiveSkipTitle(offer);
    const labelEl = this.objectiveSkipBtn_.querySelector('#objective-skip-control-label');
    if (labelEl) {
      labelEl.textContent = buttonText;
    }
  }

  /**
   * Button text for an objective skip (Phase 28 D1): where it lands on the
   * station clock when the hold ends on the clock ("Skip to 10:00"), else how
   * long it covers ("Skip 7 min", "Skip 40 s").
   */
  static objectiveSkipText(offer: TimeSkipOffer): string {
    if (offer.landsAtMs !== null) {
      const clock = new Date(Math.round(offer.landsAtMs / 1000) * 1000).toISOString().slice(11, 19);

      return `Skip to ${clock.endsWith(':00') ? clock.slice(0, 5) : clock}`;
    }
    if (offer.deltaMs < 60_000) {
      return `Skip ${Math.ceil(offer.deltaMs / 1000)} s`;
    }

    return `Skip ${Math.ceil(offer.deltaMs / 60_000)} min`;
  }

  /**
   * Tooltip for an objective skip (Phase 29 D15, nats-r4-s10-F3): "Skip to
   * 10:00, the end of the standby. The mission clock is held while you wait,
   * so waiting and skipping score the same." A label that does not start with
   * an article gets "the".
   */
  static objectiveSkipTitle(offer: TimeSkipOffer): string {
    const label = offer.label.trim();
    const what = /^(?:the|a|an|this|that|your|our)\s/iu.test(label) ? label : `the ${label}`;

    return `${GlobalCommandBar.objectiveSkipText(offer)}, the end of ${what}. The mission clock is held while you wait, so waiting and skipping score the same.`;
  }

  private handleTimeSkipClick_(): void {
    // Never reuse the cached target: it is up to SKIP_TARGET_RECOMPUTE_MS old,
    // and the modal prints its wait (D6).
    const target = GlobalCommandBar.resolveSkipTarget_(TimeSkipController.getInstance());
    this.skipTarget_ = target;
    this.lastSkipTargetComputeMs_ = getSimulatedNowMs();

    if (target) {
      TimeSkipModal.getInstance().showConfirmation(target);
    }
  }

  /** The next-pass skip, else the way back after a missed pass (D4). */
  private static resolveSkipTarget_(controller: TimeSkipController): SkipTarget | null {
    return controller.findTarget() ?? controller.findRecoveryTarget();
  }

  /** Tooltip for the pass-skip button (D4, D6). */
  static skipButtonTitle(target: SkipTarget | null, tooClose: { satelliteName: string; untilAosMs: number } | null): string {
    if (target?.recovery) {
      return `Pass missed: skip to next ${target.satelliteName} pass`;
    }
    if (target) {
      return `Advance to ${target.satelliteName} AOS`;
    }
    if (tooClose) {
      return `Next contact ${tooClose.satelliteName} in ${formatDuration(tooClose.untilAosMs)}, too close to skip`;
    }

    return 'No upcoming contact to skip to';
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
      this.skipTarget_ = GlobalCommandBar.resolveSkipTarget_(controller);
      this.skipTooClose_ = this.skipTarget_ ? null : controller.findTooCloseContact();
    }

    this.timeSkipBtn_.disabled = this.skipTarget_ === null;
    this.timeSkipBtn_.title = GlobalCommandBar.skipButtonTitle(this.skipTarget_, this.skipTooClose_);

    if (labelEl) {
      // Count down from the live clock, not from the value cached at predict
      // time, so the label stays truthful between recomputes.
      labelEl.textContent = this.skipTarget_ ? `Skip ${formatDurationCompact(this.skipTarget_.targetMs - nowMs)}` : 'Skip';
    }
  }

  private updateScenarioInfo_(): void {
    if (!this.scenarioInfoEl_) return;

    try {
      const scenarioData = ScenarioManager.getInstance().data;
      const number = scenarioData.number;
      const title = scenarioData.title;
      this.scenarioInfoEl_.textContent = `${number > 0 ? `${String(number).padStart(2, '0')} · ` : ''}${title}`;
      this.scenarioInfoEl_.title = this.scenarioInfoEl_.textContent;
    } catch {
      // ScenarioManager not initialized yet - keep placeholder
    }
  }

  private subscribeToAlarms_(): void {
    EventBus.getInstance().on(Events.OBJECTIVE_ACTIVATED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().on(Events.OBJECTIVE_COMPLETED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().on(Events.OBJECTIVES_ALL_COMPLETED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().on(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
    EventBus.getInstance().on(Events.ASSET_SELECTED, this.boundOnAssetSelected_);
  }

  private onAssetSelected_(data: { type: 'ground-station' | 'satellite'; id: string }): void {
    this.selectedStationId_ = data.type === 'ground-station' ? data.id : null;
    if (this.lastAlarms_) {
      this.renderStaticAlarms_(this.lastAlarms_.alarms, this.lastAlarms_.highestSeverity);
    }
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
        return '--:--:-- UTC';
    }
  }

  /**
   * `WED` - day of the week on the scenario clock (UTC, like the rest of the
   * clock). Briefs open with "Wednesday, 1430"; without the weekday the HUD
   * could not confirm it (nats-r2-s05-F3, s19-F7).
   */
  private static weekday_(timestampMs: number): string {
    return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(timestampMs).getUTCDay()] ?? '---';
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
        this.clockEl_.textContent = Number.isFinite(data.timestampMs) ? `${new Date(data.timestampMs).toISOString().slice(11, 19)} UTC` : '--:--:-- UTC';
    }
    this.clockEl_.title = `Simulation time: ${GlobalCommandBar.weekday_(data.timestampMs)} ${data.timeFormatted} UTC`;
    this.clockEl_.setAttribute('aria-label', this.clockEl_.title);
    if (Number.isFinite(data.timestampMs)) this.clockEl_.setAttribute('datetime', new Date(data.timestampMs).toISOString());
  }

  /** Alarm tone mute toggle: stays muted until the operator turns tones back on. */
  private toggleAlarmMute_(): void {
    SoundEvents.setAlarmsMuted(!SoundEvents.alarmsMuted);
    this.renderAlarmMute_();
  }

  private renderAlarmMute_(): void {
    const btn = this.muteBtn_;
    if (!btn) {
      return;
    }
    const muted = SoundEvents.alarmsMuted;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />${muted ? '<path d="m3 3 18 18" />' : ''}</svg><span>${muted ? 'Muted' : 'Mute'}</span>`;
    btn.title = muted ? 'Unmute alarm tones' : 'Mute alarm tones; alarms remain visible';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(muted));
    btn.classList.toggle('alarm-mute-btn--muted', muted);
  }

  private setupAlarmPanel_(): void {
    const summary = this.dom_!.querySelector<HTMLButtonElement>('#alarm-summary')!;
    const panel = this.dom_!.querySelector<HTMLElement>('#mission-alarm-panel')!;
    const close = panel.querySelector<HTMLButtonElement>('#mission-alarm-close')!;
    const setOpen = (open: boolean, restoreFocus = false): void => {
      panel.hidden = !open;
      summary.setAttribute('aria-expanded', String(open));
      if (open) close.focus({ preventScroll: true });
      else if (restoreFocus) summary.focus({ preventScroll: true });
    };
    const options = { signal: this.alarmListeners_.signal };
    summary.addEventListener('click', () => setOpen(Boolean(panel.hidden)), options);
    close.addEventListener('click', () => setOpen(false, true), options);
    document.addEventListener(
      'click',
      (event) => {
        if (!panel.hidden && !panel.contains(event.target as Node) && !summary.contains(event.target as Node)) setOpen(false);
      },
      options
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false, true);
        }
      },
      options
    );
  }

  private renderAlarmPanel_(alarms: AggregatedAlarm[]): void {
    const list = this.dom_?.querySelector('#mission-alarm-list');
    const total = this.dom_?.querySelector('#mission-alarm-total');
    if (!list || !total) return;
    total.textContent = String(alarms.length);
    list.innerHTML = alarms.length
      ? this.getTopAlarms_(alarms, alarms.length)
          .map((alarm) => {
            const detail = AlarmService.detailOf(alarm);
            return `<li class="mission-alarm-entry" data-severity="${selectionText(alarm.severity)}">
        ${severityGlyph(alarm.severity)}<div><div class="mission-alarm-source">${selectionText(alarm.assetId)} · ${selectionText(alarm.equipmentType)}${alarm.equipmentIndex + 1} · ${selectionText(alarm.severity)}</div>
        <p>${selectionText(alarm.message)}</p>${detail ? `<p class="mission-alarm-detail">${selectionText(detail)}</p>` : ''}</div></li>`;
          })
          .join('')
      : '<li class="mission-alarm-empty">No active alarms</li>';
  }

  private onAlarmStateChanged_(data: AlarmStateChangedData): void {
    // Apply immediately - no queuing needed for static display
    this.lastAlarms_ = data;
    this.renderStaticAlarms_(data.alarms, data.highestSeverity);
  }

  /**
   * Render the static alarm bar with counts and top alarms
   */
  private renderStaticAlarms_(alarms: AggregatedAlarm[], severity: string): void {
    if (!this.alarmBarEl_ || !this.countsEl_ || !this.messagesEl_) return;

    // Count by severity
    const counts = { error: 0, warning: 0, info: 0 };
    alarms.forEach((a) => {
      if (a.severity in counts) {
        counts[a.severity as keyof typeof counts]++;
      }
    });

    // Update count badges
    this.renderCountBadges_(counts);
    this.renderAlarmPanel_(alarms);

    // Update container class for background color
    this.alarmBarEl_.classList.remove('alarm', 'warn', 'healthy', 'info');

    if (alarms.length === 0) {
      // System stable
      this.messagesEl_.innerHTML = `
        <span class="alarm-stable text-green-400">
          ${severityGlyph('ok', 'me-1')} No active alarms
        </span>
      `;
      this.alarmBarEl_.classList.add('healthy');
      this.messagesEl_.removeAttribute('title');
    } else {
      // Get top alarms by severity
      const topAlarms = this.getTopAlarms_(alarms, this.MAX_INLINE_ALARMS_);
      const overflowCount = alarms.length - topAlarms.length;

      this.renderAlarmMessages_(topAlarms, overflowCount);
      // Every name, for the ones "+N more" hides
      this.messagesEl_.title = alarms.map((a) => GlobalCommandBar.alarmTooltipLine(a)).join('\n');

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

    const alwaysVisible = false;
    const badges: string[] = [];

    if (counts.error > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count error ${counts.error === 0 ? 'zero' : ''}" title="${counts.error} Error${counts.error > 1 ? 's' : ''}">
          ${severityGlyph('error')} ${counts.error} error${counts.error === 1 ? '' : 's'}
        </span>
      `);
    }

    if (counts.warning > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count warning ${counts.warning === 0 ? 'zero' : ''}" title="${counts.warning} Warning${counts.warning > 1 ? 's' : ''}">
          ${severityGlyph('warning')} ${counts.warning} warning${counts.warning === 1 ? '' : 's'}
        </span>
      `);
    }

    if (counts.info > 0 || alwaysVisible) {
      badges.push(`
        <span class="alarm-count info ${counts.info === 0 ? 'zero' : ''}" title="${counts.info} Info">
          ${severityGlyph('info')} ${counts.info} info
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

    return [...alarms].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)).slice(0, limit);
  }

  /**
   * One tooltip line: "VT-01(ANT1): RAIN FADE - fade 0.7 dB". The live value
   * of a fixed-label alarm rides here, not in the ticker label
   */
  static alarmTooltipLine(alarm: AggregatedAlarm): string {
    const detail = AlarmService.detailOf(alarm);
    return `${alarm.assetId}(${alarm.equipmentType}${alarm.equipmentIndex + 1}): ${alarm.message}${detail ? ` - ${detail}` : ''}`;
  }

  /**
   * Render alarm messages with overflow indicator
   */
  private renderAlarmMessages_(alarms: AggregatedAlarm[], overflowCount: number): void {
    if (!this.messagesEl_) return;

    const items = alarms.map((alarm, index) => {
      const color = this.getColorClass_(alarm.severity);
      const separator = index > 0 ? '<span class="alarm-separator">•</span>' : '';
      return `${separator}<span class="alarm-item ${color}">${selectionText(alarm.assetId)}(${selectionText(alarm.equipmentType)}${alarm.equipmentIndex + 1}): ${selectionText(alarm.message)}</span>`;
    });

    if (overflowCount > 0) {
      items.push(`<span class="alarm-overflow">+${overflowCount} more</span>`);
    }

    // The ticker lists every operational station; the Dashboard and Quick
    // Stats list the selected one. Say how many other-station alarms the
    // ticker does not already name, so the two counts are not read as a
    // contradiction (s08-F2, s16-F2) and a listed row is never counted twice
    // (nats-r5-s21-F1)
    const listed = new Set<AggregatedAlarm>(alarms);
    const elsewhere = this.selectedStationId_ ? (this.lastAlarms_?.alarms ?? []).filter((a) => a.assetId !== this.selectedStationId_ && !listed.has(a)).length : 0;
    if (elsewhere > 0) {
      items.push(`<span class="alarm-overflow alarm-other-stations">(${elsewhere} on other stations)</span>`);
    }

    this.messagesEl_.innerHTML = items.join('');
  }

  private getColorClass_(severity: string): string {
    switch (severity) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-green-400';
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
    this.refreshObjectiveSkipControl_();

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
        this.renderMissionClockHold_(objectivesManager);

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
        // No time limit: a blank clock face, with the reason on hover
        if (valueEl) {
          valueEl.textContent = '--:--';
        }
        this.scenarioTimerEl_.title = 'No time limit';
        this.scenarioTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-failed');
        this.scenarioTimerEl_.classList.add('timer-unlimited');
      }
    }

    // Update objective timer - find the first active objective with a running timer
    if (this.objectiveTimerEl_) {
      let activeObjectiveTimer: { time: number; title: string } | null = null;
      let failedObjective: { title: string } | null = null;
      let passedObjective: { title: string } | null = null;
      let overtimeObjective: { title: string } | null = null;
      let heldObjective: { title: string } | null = null;
      if (objectivesManager) {
        // Check for quiz passed state first
        if (objectivesManager.isQuizPassed()) {
          const passedId = objectivesManager.getPassedObjectiveId();
          const passedState = objectivesManager.getObjectiveStates().find((s) => s.objective.id === passedId);
          if (passedState) {
            passedObjective = { title: passedState.objective.title };
          }
        } else {
          const states = objectivesManager.getObjectiveStates();
          // A non-fatal objective whose time ran out stays open in overtime
          const overtimeState = states.find((s) => s.timedOut && s.isActive && !s.isCompleted && !s.isFailed);
          if (overtimeState) {
            overtimeObjective = { title: overtimeState.objective.title };
          }
          for (const state of states) {
            // Check for failed objectives first
            if (state.isFailed && state.objective.timeLimitSeconds !== undefined) {
              failedObjective = { title: state.objective.title };
              break; // Show failed state
            }
            // Active objectives only, the same rows the checklist shows a
            // countdown on, so the HUD and the row never disagree (nats-r3-s24-F2)
            if (state.isActive && state.isTimerRunning && !state.isCompleted && !state.isFailed && state.timeRemainingSeconds !== undefined) {
              // Q1: the timed work is done (only questions remain), so the
              // clock is stopped; do not show a frozen countdown as if live
              if (objectivesManager.isObjectiveCountdownHeld(state.objective.id)) {
                heldObjective ??= { title: state.objective.title };
                continue;
              }
              activeObjectiveTimer = {
                time: state.timeRemainingSeconds,
                title: state.objective.title,
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
      } else if (overtimeObjective) {
        // Time ran out on a non-fatal objective: it still has to be done
        if (valueEl) {
          valueEl.textContent = 'Overdue';
        }
        this.objectiveTimerEl_.title = `Time ran out on ${overtimeObjective.title}. Points were deducted; finish it to carry on.`;
        this.objectiveTimerEl_.classList.add('timer-urgent');
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-unlimited', 'timer-failed', 'timer-passed');
      } else {
        // No active timed objective: a blank clock face, with the reason on hover
        if (valueEl) {
          valueEl.textContent = '--:--';
        }
        this.objectiveTimerEl_.title = heldObjective ? this.heldObjectiveTitle_(objectivesManager, heldObjective) : 'No time limit';
        this.objectiveTimerEl_.classList.remove('timer-warning', 'timer-urgent', 'timer-failed', 'timer-passed');
        this.objectiveTimerEl_.classList.add('timer-unlimited');
      }
    }
  }

  /**
   * Phase 28 D1: show HOLD beside the MISSION timer while an objective's wait
   * holds it, so a frozen countdown reads as intentional.
   */
  private renderMissionClockHold_(objectivesManager: ObjectivesManager): void {
    const tagEl = this.scenarioTimerEl_?.querySelector<HTMLElement>('#scenario-timer-hold');
    if (!tagEl || !this.scenarioTimerEl_) {
      return;
    }
    const hold = objectivesManager.getMissionClockHold();
    tagEl.hidden = hold === null;
    this.scenarioTimerEl_.classList.toggle('timer-held', hold !== null);
    this.scenarioTimerEl_.title = hold ? `Mission clock held for the ${hold.label} (${hold.title}): waiting costs no time bonus` : '';
  }

  /** Tooltip for an objective whose countdown is held (Q1 questions, or its D1 wait) */
  private heldObjectiveTitle_(objectivesManager: ObjectivesManager, heldObjective: { title: string }): string {
    const hold = objectivesManager.getMissionClockHold();
    if (hold && hold.title === heldObjective.title) {
      return `Waiting out the ${hold.label}: no time limit`;
    }

    return `No time limit on the questions for ${heldObjective.title}`;
  }

  /**
   * Repaint the timers the moment an objective starts or ends, rather than on
   * the next 1 s tick: the checklist re-renders on OBJECTIVE_ACTIVATED, and a
   * HUD a second behind showed the previous step's countdown beside the new
   * step's row (nats-r3-s24-F2).
   */
  private onObjectiveChanged_(): void {
    this.updateTimerDisplays_();
  }

  dispose(): void {
    this.alarmListeners_.abort();
    EventBus.getInstance().off(Events.OBJECTIVE_ACTIVATED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().off(Events.OBJECTIVE_COMPLETED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().off(Events.OBJECTIVES_ALL_COMPLETED, this.boundOnObjectiveChanged_);
    EventBus.getInstance().off(Events.ALARM_STATE_CHANGED, this.boundOnAlarmStateChanged_);
    this.muteBtn_?.removeEventListener('click', this.boundOnMuteClick_);
    EventBus.getInstance().off(Events.ASSET_SELECTED, this.boundOnAssetSelected_);
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
