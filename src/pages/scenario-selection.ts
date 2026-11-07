import { CampaignManager } from '@app/campaigns/campaign-manager';
import { CampaignData } from '@app/campaigns/campaign-types';
import { getReleaseStage, renderReleaseCallout } from '@app/campaigns/release-stage';
import { ModalConfirm } from '@app/engine/ui/modal-confirm';
import { html } from '@app/engine/utils/development/formatter';
import { qs, qsa } from '@app/engine/utils/query-selector';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import { ScenarioData } from '@app/ScenarioData';
import { getNextPrerequisiteScenario, isScenarioLocked, SCENARIOS } from '@app/scenario-manager';
import { clearPersistedStore } from '@app/sync/storage';
import { selectionProgressCache } from '@app/user-account/selection-progress-cache';
import { getUserDataService } from '@app/user-account/user-data-service';
import { getAssetUrl } from '@app/utils/asset-url';
import { BasePage } from './base-page';
import { selectionArtworkPosition } from './selection-artwork';
import { animateSelection, selectionKeyboard, selectionText, updateSelectionDetail, updateSelectionList } from './selection-browser';
import { renderSelectionCrew } from './selection-crew';
import { SelectionLoadingScreen } from './selection-loading-screen';
import { selectionPhases } from './selection-phases';
import { selectionStatusIcon } from './selection-status-icon';
import './selection-browser.css';
import './scenario-selection.css';

declare global {
  interface Window {
    UNLOCK_ALL_SCENARIOS?: boolean;
  }
}

/**
 * Scenario selection page implementation
 */
export class ScenarioSelectionPage extends BasePage {
  id = 'scenario-selection-page';
  private static instance_: ScenarioSelectionPage;
  private readonly scenarioCheckpoints_: Map<string, boolean> = new Map();
  /** Scenarios with completedAt set - used for prerequisite checks (ever completed) */
  private completedScenarioIds_: string[] = [];
  /** Scenarios with score > 0 - used for UI display (currently showing as completed) */
  private currentlyCompletedScenarioIds_: string[] = [];
  /**
   * True while the progress and checkpoint probe is in flight: the cards'
   * action area shows a disabled loading button instead of a Start that
   * flips to Continue a few seconds later (nats-r3-s15-F3)
   */
  private isProgressLoading_ = false;
  /** Set once a probe has answered; until then the lock state is unknown too */
  private hasProgressLoaded_ = false;
  /** Bumped per probe so only the latest one writes the cards */
  private progressLoadToken_ = 0;
  private progressLoad_: Promise<void> = Promise.resolve();
  /** Set once auth is ready; shows the not-saved warning in the header */
  private isSignedOut_ = false;
  private selectedScenarioId_: string | null = null;
  private readonly expandedPhases_ = new Map<string, number | null>();
  private readonly loadingScreen_: SelectionLoadingScreen;
  private currentCampaignId_: string | null = null;
  private currentCampaign_: CampaignData | null = null;

  private constructor() {
    super();
    // Initialize the page immediately so it can be shown
    this.init_('body-content-container', 'add');
    this.loadingScreen_ = new SelectionLoadingScreen(this.dom_, () => void this.loadCheckpointsAndUpdate_());
    selectionProgressCache.onAccountChanged(() => {
      if (this.dom_.style.display === 'flex') void this.loadCheckpointsAndUpdate_();
    });
  }

  static getInstance(): ScenarioSelectionPage {
    if (!this.instance_) {
      // Progress loads when the page is shown, not on creation: the router
      // creates this page on every navigation (hideAll), and probing every
      // scenario's checkpoint from the home page logged one 404 per scenario
      this.instance_ = new ScenarioSelectionPage();
    }

    return this.instance_;
  }

  /**
   * Set the campaign to display scenarios for
   */
  setCampaign(campaignId: string | null): void {
    if (campaignId !== this.currentCampaignId_) {
      ++this.progressLoadToken_;
      this.selectedScenarioId_ = null;
    }
    this.currentCampaignId_ = campaignId;
    if (campaignId) {
      const campaignManager = CampaignManager.getInstance();
      this.currentCampaign_ = campaignManager.getCampaign(campaignId) || null;
    } else {
      this.currentCampaign_ = null;
    }
    // Re-render with new campaign filter
    this.updateScenarioCards_();
  }

  /**
   * Get scenarios to display (filtered by campaign if set)
   */
  private getScenariosToDisplay_(): ScenarioData[] {
    if (this.currentCampaignId_ && this.currentCampaign_) {
      return this.currentCampaign_.scenarios;
    }
    // Fallback to all scenarios if no campaign is set
    return SCENARIOS;
  }

  /** Resolves when the latest progress and checkpoint probe has answered and the cards are final */
  whenProgressLoaded(): Promise<void> {
    return this.progressLoad_;
  }

  /**
   * Load progress and checkpoint status, then render the final card buttons.
   * The cards show a loading state until this answers.
   */
  private loadCheckpointsAndUpdate_(): Promise<void> {
    const token = ++this.progressLoadToken_;
    this.loadingScreen_.begin();
    this.isProgressLoading_ = true;
    this.updateScenarioCards_();
    this.progressLoad_ = this.probeProgress_(token)
      .then(() => {
        if (token !== this.progressLoadToken_) return;
        this.isProgressLoading_ = false;
        this.hasProgressLoaded_ = true;
        this.selectedScenarioId_ = null;
        this.expandedPhases_.delete(this.currentCampaignId_ ?? '');
        this.updateScenarioCards_();
        const list = qs<HTMLElement>('.scenario-grid', this.dom_);
        list.scrollTop = 0;
        this.loadingScreen_.finish();
        list.querySelector<HTMLElement>('.selection-item[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest' });
      })
      .catch((error) => {
        if (token !== this.progressLoadToken_) return;
        Logger.error('Failed to load mission progress:', error);
        this.isProgressLoading_ = false;
        this.loadingScreen_.fail();
      });
    return this.progressLoad_;
  }

  /**
   * Fetch all progress in one call, then probe checkpoints for the scenarios
   * on screen only (the progress payload carries no checkpoint flag, and the
   * backend has no list call, so a probe per displayed scenario is the floor)
   */
  private async probeProgress_(token: number): Promise<void> {
    const { App } = await import('@app/app');
    await App.authReady;
    if (token !== this.progressLoadToken_) return;
    this.isSignedOut_ = selectionProgressCache.isSignedOut;
    this.loadingScreen_.update(this.isSignedOut_ ? 'Preparing available missions...' : 'Downloading your progress...');
    const progressResponse = await selectionProgressCache.getProgress();
    if (token !== this.progressLoadToken_) return;
    this.scenarioCheckpoints_.clear();
    this.completedScenarioIds_ = [];
    this.currentlyCompletedScenarioIds_ = [];
    if (!progressResponse) return;
    for (const progress of progressResponse.scenarios) {
      if (progress.completedAt) this.completedScenarioIds_.push(progress.scenarioId);
      if (progress.score > 0) this.currentlyCompletedScenarioIds_.push(progress.scenarioId);
    }
    this.loadingScreen_.update('Checking saved missions...');
    const checkpoints = await Promise.all(
      this.getScenariosToDisplay_().map(async (scenario) => ({
        scenarioId: scenario.id,
        hasCheckpoint: await selectionProgressCache.getCheckpoint(scenario.id),
      }))
    );
    if (token !== this.progressLoadToken_) return;
    for (const checkpoint of checkpoints) {
      if (checkpoint.hasCheckpoint) this.scenarioCheckpoints_.set(checkpoint.scenarioId, true);
    }
  }

  /**
   * Update the scenario cards in the DOM with current checkpoint data
   */
  private updateScenarioCards_(): void {
    const scenarioGrid = qs<HTMLElement>('.scenario-grid', this.dom_);
    const scenarios = this.getScenariosToDisplay_();
    if (!scenarios.some((scenario) => scenario.id === this.selectedScenarioId_)) {
      const suggested =
        scenarios.find(
          (scenario) =>
            scenario.missionType !== 'Sandbox' &&
            !scenario.isDisabled &&
            !this.completedScenarioIds_.includes(scenario.id) &&
            !isScenarioLocked(scenario, this.completedScenarioIds_)
        ) ??
        scenarios.find((scenario) => scenario.missionType !== 'Sandbox') ??
        scenarios[0];
      this.selectedScenarioId_ = suggested?.id ?? null;
    }
    const phases = selectionPhases(this.currentCampaignId_, scenarios);
    const campaignKey = this.currentCampaignId_ ?? '';
    const expanded = this.expandedPhases_.has(campaignKey)
      ? this.expandedPhases_.get(campaignKey)
      : phases.findIndex((phase) => phase.scenarios.some((scenario) => scenario.id === this.selectedScenarioId_));
    updateSelectionList(
      scenarioGrid,
      phases
        .map((phase, index) => {
          const completed = phase.scenarios.filter((scenario) => this.completedScenarioIds_.includes(scenario.id)).length;
          const panelId = `selection-phase-panel-${index}`;
          return html`<section class="selection-phase" aria-label="${phase.title}">
          <h2><button type="button" class="selection-phase-toggle" id="selection-phase-heading-${index}" data-phase-index="${index}" data-selection-id="phase-${index}" aria-expanded="${String(expanded === index)}" aria-controls="${panelId}">
            <span>${phase.title}</span><span class="selection-phase-count" aria-label="${completed} of ${phase.scenarios.length} completed">${completed}/${phase.scenarios.length}</span>
            <svg class="selection-phase-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button></h2>
          <div class="selection-phase-missions" id="${panelId}" role="region" aria-labelledby="selection-phase-heading-${index}" ${expanded === index ? '' : 'hidden'}>
            ${phase.scenarios.map((scenario) => this.renderScenarioRow_(scenario)).join('')}
          </div>
        </section>`;
        })
        .join('')
    );
    this.updateHeader_();
    this.renderSelectedScenario_();
  }

  private renderScenarioRow_(scenario: ScenarioData): string {
    const locked = !window.UNLOCK_ALL_SCENARIOS && isScenarioLocked(scenario, this.completedScenarioIds_);
    const complete = this.completedScenarioIds_.includes(scenario.id);
    const checkpoint = this.scenarioCheckpoints_.get(scenario.id);
    const pending = this.isProgressLoading_ && !this.hasProgressLoaded_;
    const status = scenario.isDisabled
      ? 'Coming soon'
      : pending
        ? 'Checking progress'
        : locked
          ? 'Locked'
          : complete
            ? 'Completed'
            : checkpoint
              ? 'Checkpoint available'
              : 'Available';
    const icon =
      !scenario.isDisabled && !pending
        ? locked
          ? selectionStatusIcon('locked')
          : complete
            ? selectionStatusIcon('completed')
            : checkpoint
              ? selectionStatusIcon('checkpoint')
              : ''
        : '';
    return html`<button type="button" class="selection-item scenario-list-item" data-selection-id="${scenario.id}" data-scenario-id="${scenario.id}"
      aria-pressed="${String(scenario.id === this.selectedScenarioId_)}" aria-controls="scenario-detail">
      <span class="selection-item-number">${scenario.number === 0 ? '—' : String(scenario.number).padStart(2, '0')}</span>
      <span><span class="selection-item-title">${selectionText(scenario.title)}</span>
      <span class="selection-item-subtitle">${selectionText(scenario.duration)} &middot; ${selectionText(scenario.difficulty)}</span>
      ${icon ? '' : `<span class="selection-item-status ${scenario.isDisabled ? 'coming-soon-banner' : ''}">${status}</span>`}</span>${icon}
    </button>`;
  }

  private renderSelectedScenario_(): void {
    const detail = qs<HTMLElement>('#scenario-detail', this.dom_);
    const scenario = this.getScenariosToDisplay_().find((item) => item.id === this.selectedScenarioId_);
    const scroll = detail.querySelector('.selection-briefing')?.scrollTop ?? 0;
    updateSelectionDetail(detail, scenario ? this.renderScenarioCard_(scenario) : '<p class="selection-empty">No missions available.</p>');
    const briefing = detail.querySelector('.selection-briefing');
    if (briefing) briefing.scrollTop = scroll;
    this.attachScenarioCardListeners_();
  }

  private handleSelection_(event: Event): void {
    const phaseToggle = (event.target as Element).closest<HTMLButtonElement>('.selection-phase-toggle');
    if (phaseToggle) {
      const expanded = phaseToggle.getAttribute('aria-expanded') !== 'true';
      this.expandedPhases_.set(this.currentCampaignId_ ?? '', expanded ? Number(phaseToggle.dataset.phaseIndex) : null);
      this.dom_.querySelectorAll<HTMLButtonElement>('.selection-phase-toggle').forEach((toggle) => {
        const open = toggle === phaseToggle && expanded;
        toggle.setAttribute('aria-expanded', String(open));
        const panel = this.dom_.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`);
        if (panel) panel.hidden = !open;
      });
      phaseToggle.scrollIntoView({ block: 'nearest' });
      return;
    }
    const row = (event.target as HTMLElement).closest<HTMLElement>('.scenario-list-item');
    if (!row) return;
    if (row.dataset.scenarioId === this.selectedScenarioId_) return;
    this.selectedScenarioId_ = row.dataset.scenarioId ?? null;
    this.dom_.querySelectorAll<HTMLElement>('.scenario-list-item').forEach((item) => item.setAttribute('aria-pressed', String(item === row)));
    this.renderSelectedScenario_();
    const detail = qs<HTMLElement>('#scenario-detail', this.dom_);
    const briefing = detail.querySelector('.selection-briefing');
    if (briefing) briefing.scrollTop = 0;
    animateSelection(detail);
  }

  private updateHeader_(): void {
    const title = qs<HTMLElement>('.scenario-selection-header h1', this.dom_);
    title.textContent = this.currentCampaign_?.title ?? 'Training Scenarios';
    const subtitle = qs<HTMLElement>('.scenario-selection-header .subtitle', this.dom_);
    subtitle.textContent = this.currentCampaign_?.subtitle ?? 'Select a scenario to begin';
    const progressEl = qs<HTMLElement>('.campaign-progress', this.dom_);
    if (this.currentCampaign_) {
      const progress = CampaignManager.getInstance().getCampaignProgress(this.currentCampaign_.id, this.completedScenarioIds_);
      const complete = progress.totalScenarios > 0 && progress.completedScenarios.length >= progress.totalScenarios;
      progressEl.textContent = `${progress.completedScenarios.length} of ${progress.totalScenarios} complete`;
      progressEl.classList.toggle('campaign-complete-banner', complete);
      if (complete) progressEl.textContent = 'Campaign complete · Replay any mission';
    } else progressEl.textContent = '';
    qs<HTMLElement>('.login-warning', this.dom_).hidden = !this.isSignedOut_;
  }

  /**
   * Attach event listeners to scenario cards and buttons
   */
  private attachScenarioCardListeners_(): void {
    // Add click handlers for Continue buttons
    const continueButtons = qsa('.btn-continue', this.dom_);
    continueButtons.forEach((btn) => {
      btn.addEventListener('click', this.handleContinueScenario_.bind(this));
    });

    // Add click handlers for Start Fresh buttons
    const startFreshButtons = qsa('.btn-start-fresh', this.dom_);
    startFreshButtons.forEach((btn) => {
      btn.addEventListener('click', this.handleStartFresh_.bind(this));
    });

    // Add click handlers for Play Again buttons
    const playAgainButtons = qsa('.btn-play-again', this.dom_);
    playAgainButtons.forEach((btn) => {
      btn.addEventListener('click', this.handlePlayAgain_.bind(this));
    });

    // Add click handlers for Play Again buttons
    const startButtons = qsa('.btn-start', this.dom_);
    startButtons.forEach((btn) => {
      btn.addEventListener('click', this.handlePlayAgain_.bind(this));
    });
  }

  protected html_ = html`
    <div id="${this.id}" class="selection-page scenario-selection-page">
      <header class="selection-heading scenario-selection-header"><div>
        <div class="selection-eyebrow">Mission Selection</div>
        <h1>Training Scenarios</h1><div class="subtitle">Select a scenario to begin</div>
        <div class="selection-status-bar"><span class="login-warning" hidden>Guest session &middot; Your progress won't be saved. Sign in to save progress and unlock further missions.</span></div>
      </div><button type="button" class="back-button"><span aria-hidden="true">&larr;</span> Back to Campaigns</button></header>
      <div class="selection-workspace">
        <aside class="selection-sidebar" aria-label="Mission browser">
          <div class="selection-sidebar-heading">Mission roster <span class="campaign-progress"></span></div>
          <div class="selection-list scenario-grid"></div>
          <div class="selection-sidebar-footer">&uarr; &darr; Browse &nbsp; &middot; &nbsp; Select to view briefing</div>
        </aside>
        <section class="selection-detail" id="scenario-detail" aria-label="Mission briefing"></section>
      </div>
    </div>
  `;

  private renderScenarioCard_(scenario: ScenarioData): string {
    const hasCheckpoint = this.scenarioCheckpoints_.get(scenario.id);
    // Use completedScenarioIds_ (based on completedAt) for prerequisite checks and badge
    // UNLOCK_ALL_SCENARIOS bypasses lock check for dev/testing
    // Before the first probe answers, the completed list is empty and every card would read Locked
    const isLockStateKnown = this.hasProgressLoaded_ || !this.isProgressLoading_;
    const isLocked = window.UNLOCK_ALL_SCENARIOS || !isLockStateKnown ? false : isScenarioLocked(scenario, this.completedScenarioIds_);
    const isDisabledOrLocked = scenario.isDisabled || isLocked;
    // hasEverCompleted = has completedAt (for badge display)
    const hasEverCompleted = this.completedScenarioIds_.includes(scenario.id);
    // isCurrentlyCompleted = has score > 0 (for button: "Play Again" vs "Start")
    // After Play Again reset, score is 0 so this shows "Start" instead of "Play Again"
    const isCurrentlyCompleted = this.currentlyCompletedScenarioIds_.includes(scenario.id);

    let availabilityStatus = '';
    if (scenario.isDisabled) {
      availabilityStatus = '<span class="coming-soon-banner">Coming soon</span>';
    } else if (isLocked) {
      const nextPrereqScenario = getNextPrerequisiteScenario(scenario, this.completedScenarioIds_);
      availabilityStatus = `<div class="selection-unlock-status">${selectionStatusIcon('locked')}<span class="locked-requirement">Complete ${nextPrereqScenario ? `<strong>${selectionText(nextPrereqScenario.title)}</strong>` : 'the previous mission'} to unlock.</span></div>`;
    }

    let actionButtons = '';
    if (!isDisabledOrLocked && this.isProgressLoading_) {
      actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-card-loading" data-scenario-id="${scenario.id}" disabled aria-busy="true">
            <span class="btn-card-loading-spinner" aria-hidden="true"></span> Loading
          </button>
          </div>
        `;
    } else if (!isDisabledOrLocked) {
      // A completed scenario (the card says Completed) offers PLAY AGAIN
      // only: never CONTINUE (Phase 29 D16, nats-r4-s24-F2) and never RESTART
      // LEVEL, which implies an unfinished run (nats-r5-s24-F1). Both start
      // fresh. RESTART LEVEL is for a checkpoint on an uncompleted scenario.
      if (hasEverCompleted || isCurrentlyCompleted) {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-play-again" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
            Play Again
          </button>
          </div>
        `;
      } else if (hasCheckpoint) {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-continue" data-scenario-id="${scenario.id}">
            Continue mission
          </button>
          <button type="button" class="btn-start-fresh" data-scenario-id="${scenario.id}">
            Restart Level
          </button>
          </div>
        `;
      } else {
        actionButtons = `
          <div class="scenario-checkpoint-actions">
          <button type="button" class="btn-start" data-scenario-id="${scenario.id}" data-scenario-url="${scenario.url}">
            Begin mission
          </button>
          </div>
        `;
      }
    }

    let progressBanner = '';
    if (this.isProgressLoading_ && !this.hasProgressLoaded_) {
      progressBanner = '';
    } else if (hasEverCompleted && !isDisabledOrLocked) {
      progressBanner = `
        <div class="completed-banner">
          ${selectionStatusIcon('completed')}
          Completed
        </div>
      `;
    } else if (hasCheckpoint && !isDisabledOrLocked && !this.isProgressLoading_) {
      progressBanner = `
        <div class="checkpoint-banner">
          ${selectionStatusIcon('checkpoint')}
          Checkpoint Available
        </div>
      `;
    }

    return html`
      <article class="scenario-card ${isDisabledOrLocked ? 'disabled' : ''}" data-scenario-url="${scenario.url}" data-scenario-id="${scenario.id}" data-scenario="${selectionText(scenario.title)}" aria-labelledby="scenario-detail-title">
        <div class="selection-art scenario-image">
          <img style="object-position: ${selectionArtworkPosition(scenario.imageUrl)}" src="${getAssetUrl('/assets/campaigns/' + scenario.imageUrl)}" alt="${selectionText(scenario.title)}" onerror="this.onerror=null; this.src='/images/placeholder.png'" />
          <span class="selection-art-caption">${scenario.number === 0 ? 'Free play' : `Mission ${String(scenario.number).padStart(2, '0')}`}</span>
        </div>
        <div class="selection-briefing">
          <div class="selection-detail-label scenario-number">${scenario.number === 0 ? 'Sandbox' : `Scenario ${scenario.number}`}</div>
          <h2 id="scenario-detail-title" class="scenario-title">${selectionText(scenario.title)}</h2>
          <div class="scenario-subtitle">${selectionText(scenario.subtitle)}</div>
          <div class="selection-meta scenario-badges"><span class="badge duration">${scenario.duration}</span><span class="badge difficulty-${scenario.difficulty}">${scenario.difficulty}</span></div>
          <div class="selection-description scenario-description">${scenario.description}</div>
          ${renderSelectionCrew(scenario)}
          <div class="scenario-equipment"><div class="scenario-equipment-title">Equipment Configuration</div>
            <div class="equipment-list">${scenario.equipment.map((item) => `<span class="equipment-item">${selectionText(item)}</span>`).join('')}</div>
          </div>
          ${this.currentCampaign_ ? renderReleaseCallout(getReleaseStage(this.currentCampaign_)) : ''}
        </div>
        <div class="selection-actions">
          <div class="selection-action-status" role="status">${progressBanner || (this.isProgressLoading_ ? 'Checking saved progress...' : availabilityStatus || 'Ready when you are')}</div>
          ${actionButtons || `<button type="button" class="selection-primary" disabled>${scenario.isDisabled ? 'Coming soon' : 'Mission locked'}</button>`}
        </div>
      </article>
    `;
  }

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);

    return parentDom;
  }

  hide(): void {
    ++this.progressLoadToken_;
    this.loadingScreen_.cancel();
    super.hide();
  }

  show(): void {
    super.show();
    // Refresh scenario data when page is shown to reflect any completion updates
    this.loadCheckpointsAndUpdate_().catch((error) => {
      Logger.error('Failed to refresh scenario data:', error);
    });
  }

  /**
   * Refresh the scenario cards without reloading checkpoint data.
   * Used by dev menu to immediately reflect unlock state changes.
   */
  refreshCards(): void {
    this.updateScenarioCards_();
  }

  private handleBackToCampaigns_(): void {
    Router.getInstance().navigate('/');
  }

  protected addEventListeners_(): void {
    qs<HTMLButtonElement>('.back-button', this.dom_).addEventListener('click', this.handleBackToCampaigns_.bind(this));
    this.dom_.addEventListener('click', this.handleSelection_.bind(this));
    this.dom_.addEventListener('keydown', selectionKeyboard);
  }

  /**
   * Handle Continue from Checkpoint button click
   */
  private handleContinueScenario_(event: Event): void {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioId = button.dataset.scenarioId;

    if (scenarioId && this.currentCampaignId_) {
      // Use absolute path to ensure correct routing
      const absolutePath = `/campaigns/${this.currentCampaignId_}/scenarios/${scenarioId}`;
      Router.getInstance().navigate(absolutePath, { continueFromCheckpoint: true });
    }
  }

  /**
   * Handle Start Fresh button click
   */
  private async handleStartFresh_(event: Event): Promise<void> {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioId = button.dataset.scenarioId;

    if (!scenarioId || !this.currentCampaignId_) {
      return;
    }

    // Show confirmation modal
    ModalConfirm.getInstance().open(
      async () => {
        try {
          // Clear the checkpoint using direct API
          const userDataService = getUserDataService();
          await userDataService.deleteCheckpoint(scenarioId);

          // Clear local equipment state so scenario starts with default equipment settings
          await clearPersistedStore();

          Logger.info(`Checkpoint cleared for scenario: ${scenarioId}`);

          // Navigate to scenario with forceReplay to skip completion checks
          // Use absolute path to ensure correct routing
          const absolutePath = `/campaigns/${this.currentCampaignId_}/scenarios/${scenarioId}`;
          Router.getInstance().navigate(absolutePath, { forceReplay: true });
        } catch (error) {
          Logger.error('Failed to clear checkpoint:', error);
          alert('Failed to clear checkpoint. Please try again.');
        }
      },
      {
        title: 'Start Fresh?',
        message: '<p>Starting fresh will clear your saved checkpoint for this scenario. Your achievements will be preserved.</p><p>Are you sure you want to continue?</p>',
        confirmText: 'Start Fresh',
        cancelText: 'Cancel',
        isDestructive: true,
      }
    );
  }

  /**
   * Handle Play Again button click for completed scenarios
   * Resets score/objectives but preserves completion status so prerequisites stay unlocked
   */
  private async handlePlayAgain_(event: Event): Promise<void> {
    event.stopPropagation(); // Prevent card selection
    const button = event.currentTarget as HTMLElement;
    const scenarioId = button.dataset.scenarioId;

    if (!scenarioId || !this.currentCampaignId_) {
      return;
    }

    // Reset progress (preserves completedAt) and clear checkpoint for fresh start
    // Use individual .catch() so errors don't prevent other cleanup
    const userDataService = getUserDataService();

    await Promise.all([
      userDataService.resetScenarioForReplay(scenarioId).catch((error) => {
        Logger.warn(`resetScenarioForReplay failed: ${error.message}`);
      }),
      userDataService.deleteCheckpoint(scenarioId).catch((error) => {
        Logger.warn(`deleteCheckpoint failed (may not exist): ${error.message}`);
      }),
    ]);

    // Clear local equipment state so scenario starts with default equipment settings
    // This must always run regardless of API call results
    await clearPersistedStore();
    Logger.info(`Cleared local state for Play Again: ${scenarioId}`);

    // Use absolute path to ensure correct routing
    const absolutePath = `/campaigns/${this.currentCampaignId_}/scenarios/${scenarioId}`;
    Router.getInstance().navigate(absolutePath, { forceReplay: true });
  }
}
