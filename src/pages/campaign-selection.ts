import { CampaignManager } from '@app/campaigns/campaign-manager';
import { CampaignData } from '@app/campaigns/campaign-types';
import { getReleaseStage, renderReleaseBadge, renderReleaseCardNotice } from '@app/campaigns/release-stage';
import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { findContinueMission } from '@app/game-menu/continue-mission';
import { Logger } from '@app/logging/logger';
import { Router } from '@app/router';
import { selectionProgressCache } from '@app/user-account/selection-progress-cache';
import { getAssetUrl } from '@app/utils/asset-url';
import { BasePage } from './base-page';
import { selectionArtworkPosition } from './selection-artwork';
import { animateSelection, selectionKeyboard, selectionText, updateSelectionDetail, updateSelectionList } from './selection-browser';
import { SelectionLoadingScreen } from './selection-loading-screen';
import { selectionStatusIcon } from './selection-status-icon';
import './selection-browser.css';
import './campaign-selection.css';

export class CampaignSelectionPage extends BasePage {
  id = 'campaign-selection-page';
  private static instance_: CampaignSelectionPage;
  private completedScenarioIds_: string[] = [];
  private selectedCampaignId_: string | null = null;
  private readonly loadingScreen_: SelectionLoadingScreen;
  private progressLoadToken_ = 0;

  private constructor() {
    super();
    this.init_('body-content-container', 'add');
    this.loadingScreen_ = new SelectionLoadingScreen(this.dom_, () => void this.loadUserDataAndUpdate_());
    this.updateCampaignCards_();
    selectionProgressCache.onAccountChanged(() => {
      if (this.dom_.style.display === 'flex') void this.loadUserDataAndUpdate_();
    });
  }

  static getInstance(): CampaignSelectionPage {
    if (!this.instance_) {
      this.instance_ = new CampaignSelectionPage();
    }
    return this.instance_;
  }

  private async loadUserDataAndUpdate_(): Promise<void> {
    const token = ++this.progressLoadToken_;
    this.loadingScreen_.begin();
    try {
      const { App } = await import('@app/app');
      await App.authReady;
      if (token !== this.progressLoadToken_) return;
      const isLoggedIn = !selectionProgressCache.isSignedOut;
      this.loadingScreen_.update(isLoggedIn ? 'Downloading your progress...' : 'Preparing available campaigns...');
      const progress = await selectionProgressCache.getProgress();
      if (token !== this.progressLoadToken_) return;
      this.updateLoginWarning_(!isLoggedIn);
      this.completedScenarioIds_ = (progress?.scenarios ?? []).filter((s) => s.completedAt).map((s) => s.scenarioId);
      this.updateCampaignCards_();
      const next = isLoggedIn
        ? await findContinueMission(
            progress?.scenarios ?? [],
            CampaignManager.getInstance()
              .getAllCampaigns()
              .filter((campaign) => !this.isLocked_(campaign)),
            (id) => selectionProgressCache.getCheckpoint(id),
            (id) => selectionProgressCache.getSavedCheckpoint(id),
            Boolean(window.UNLOCK_ALL_SCENARIOS || window.DEVELOPER_MODE)
          )
        : null;
      if (token !== this.progressLoadToken_) return;
      const resume = this.dom_.querySelector<HTMLButtonElement>('#campaign-continue')!;
      resume.hidden = !next;
      if (next) {
        const completed = next.checkpoint?.state.objectiveStates?.filter((objective) => objective.isCompleted).length ?? 0;
        const total = next.mission.objectives?.length ?? 0;
        const saved = next.checkpoint ? new Date(next.checkpoint.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
        const detail = saved ? `${completed} / ${total} objectives &middot; Saved ${selectionText(saved)}` : 'Next unlocked mission';
        resume.innerHTML = `<span class="continue-label">${next.checkpoint ? 'Resume mission' : 'Continue campaign'}</span><span class="continue-copy"><strong>${selectionText(next.mission.title)}</strong><span>${selectionText(next.campaign.title)} &middot; ${detail}</span></span><span aria-hidden="true">&#8594;</span>`;
        resume.onclick = () =>
          Router.getInstance().navigate(`/campaigns/${next.campaign.id}/scenarios/${next.mission.id}`, next.checkpoint ? { continueFromCheckpoint: true } : undefined);
      }
      this.loadingScreen_.finish();
      this.prefetchSelectedCampaign_();
    } catch (error) {
      if (token !== this.progressLoadToken_) return;
      Logger.error('Failed to load user progress:', error);
      this.loadingScreen_.fail();
    }
  }

  private updateLoginWarning_(show: boolean): void {
    const warning = this.dom_.querySelector<HTMLElement>('.login-warning');
    if (warning) warning.hidden = !show;
  }

  private isLocked_(campaign: CampaignData): boolean {
    const manager = CampaignManager.getInstance();
    return (
      !!campaign.isLocked ||
      (!window.UNLOCK_ALL_SCENARIOS && manager.isCampaignLocked(campaign, manager.getCompletedCampaigns(this.completedScenarioIds_), this.completedScenarioIds_))
    );
  }

  private updateCampaignCards_(): void {
    const campaigns = CampaignManager.getInstance().getAllCampaigns();
    if (!campaigns.some((c) => c.id === this.selectedCampaignId_)) this.selectedCampaignId_ = campaigns[0]?.id ?? null;
    const list = qs<HTMLElement>('.campaign-grid', this.dom_);
    updateSelectionList(list, campaigns.map((campaign, index) => this.renderCampaignRow_(campaign, index)).join(''));
    this.renderSelectedCampaign_();
  }

  private renderCampaignRow_(campaign: CampaignData, index: number): string {
    const progress = CampaignManager.getInstance().getCampaignProgress(campaign.id, this.completedScenarioIds_);
    const locked = this.isLocked_(campaign);
    const state = campaign.isDisabled
      ? 'Coming Soon'
      : locked
        ? 'Locked'
        : progress.isCompleted
          ? 'Campaign completed'
          : `${progress.completedScenarios.length} / ${progress.totalScenarios} complete`;
    const icon = !campaign.isDisabled && (locked || progress.isCompleted) ? selectionStatusIcon(locked ? 'locked' : 'completed', state) : '';
    const statusClass = campaign.isDisabled ? 'coming-soon-banner' : 'progress-banner';
    return html`<button type="button" class="selection-item campaign-card ${campaign.isDisabled ? 'disabled' : ''} ${locked ? 'locked' : ''}"
      data-campaign-id="${campaign.id}" data-selection-id="${campaign.id}" aria-pressed="${String(this.selectedCampaignId_ === campaign.id)}" aria-controls="campaign-detail">
      <span class="selection-item-number">${String(index + 1).padStart(2, '0')}</span>
      <span><span class="selection-item-title">${selectionText(campaign.title)}</span>
      <span class="selection-item-subtitle">${selectionText(campaign.subtitle)}</span>
      ${icon ? '' : `<span class="selection-item-status ${statusClass}">${state}</span>`}</span>${icon}
    </button>`;
  }

  private renderSelectedCampaign_(): void {
    const campaign = CampaignManager.getInstance()
      .getAllCampaigns()
      .find((c) => c.id === this.selectedCampaignId_);
    const detail = qs<HTMLElement>('#campaign-detail', this.dom_);
    const scroll = detail.querySelector('.selection-briefing')?.scrollTop ?? 0;
    updateSelectionDetail(detail, campaign ? this.renderCampaignCard_(campaign) : '<p class="selection-empty">No campaigns available.</p>');
    const briefing = detail.querySelector('.selection-briefing');
    if (briefing) briefing.scrollTop = scroll;
    detail.querySelector('.selection-primary')?.addEventListener('click', this.handleEnterCampaign_.bind(this));
  }

  private renderCampaignCard_(campaign: CampaignData): string {
    const manager = CampaignManager.getInstance();
    const progress = manager.getCampaignProgress(campaign.id, this.completedScenarioIds_);
    const locked = this.isLocked_(campaign);
    const prerequisite = locked ? manager.getNextPrerequisiteScenarioForCampaign(campaign, this.completedScenarioIds_) : null;
    const status = campaign.isDisabled
      ? campaign.disabledText || 'Coming soon'
      : locked
        ? prerequisite
          ? `Complete ${prerequisite.title} to unlock.`
          : campaign.lockedText || 'Complete the prerequisite campaign to unlock.'
        : progress.isCompleted
          ? 'Campaign complete. Revisit any mission.'
          : `${progress.completedScenarios.length} of ${progress.totalScenarios} missions completed`;
    const stage = getReleaseStage(campaign);
    return html`<article aria-labelledby="campaign-detail-title">
      <div class="selection-art campaign-image"><img style="object-position: ${selectionArtworkPosition(campaign.imageUrl)}" src="${getAssetUrl('/assets/campaigns/' + campaign.imageUrl)}" alt="${selectionText(campaign.title)}" onerror="this.onerror=null; this.src='/images/placeholder.png'" />
        <span class="selection-art-caption">${selectionText(campaign.campaignType)}</span>
      </div>
      <div class="selection-briefing">
        <div class="selection-detail-label">Campaign overview</div>
        <h2 class="campaign-title" id="campaign-detail-title">${selectionText(campaign.title)}</h2>
        <div class="campaign-subtitle">${selectionText(campaign.subtitle)}</div>
        <div class="selection-meta campaign-badges">${renderReleaseBadge(stage)}
          <span class="badge duration">${campaign.totalDuration}</span><span class="badge difficulty-${campaign.difficulty}">${campaign.difficulty}</span>
          <span class="campaign-info-item">${campaign.scenarios.filter((s) => s.missionType !== 'Sandbox').length} missions</span>
        </div>
        <div class="selection-description campaign-description">${campaign.description}</div>
        ${renderReleaseCardNotice(stage)}
      </div>
      <div class="selection-actions">
        <span class="selection-action-status" role="status">${selectionText(status)}</span>
        <button type="button" class="selection-primary" ${campaign.isDisabled || locked ? 'disabled' : ''}>${campaign.isDisabled ? 'Coming soon' : locked ? 'Campaign locked' : 'Enter campaign'} <span aria-hidden="true">→</span></button>
      </div>
    </article>`;
  }

  protected html_ = html`<div id="${this.id}" class="selection-page campaign-selection-page">
    <header class="selection-heading campaign-selection-header"><div>
      <div class="selection-eyebrow">Signal Range / Operations</div>
      <h1>Campaigns</h1><div class="subtitle">Choose your next assignment</div>
      <div class="selection-status-bar"><span class="login-warning" hidden>Guest session · Play NATS Mission 1 free. Sign in to save progress and unlock further missions.</span></div>
    </div></header>
    <button id="campaign-continue" class="campaign-continue" data-sound="back" type="button" hidden></button>
    <div class="selection-workspace">
      <aside class="selection-sidebar" aria-label="Campaign browser">
        <div class="selection-sidebar-heading">Available campaigns <span aria-hidden="true">01 / SELECT</span></div>
        <div class="selection-list campaign-grid"></div>
        <div class="selection-sidebar-footer">↑ ↓ Browse &nbsp; · &nbsp; Select to view briefing</div>
      </aside>
      <section class="selection-detail" id="campaign-detail" aria-label="Campaign briefing"></section>
    </div>
  </div>`;

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parent = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parent);
    return parent;
  }

  hide(): void {
    ++this.progressLoadToken_;
    this.loadingScreen_.cancel();
    super.hide();
  }

  show(): void {
    super.show();
    void this.loadUserDataAndUpdate_();
  }

  protected addEventListeners_(): void {
    this.dom_.addEventListener('click', this.handleCampaignClick_.bind(this));
    this.dom_.addEventListener('keydown', selectionKeyboard);
  }

  private prefetchSelectedCampaign_(): void {
    const campaign = CampaignManager.getInstance()
      .getAllCampaigns()
      .find((item) => item.id === this.selectedCampaignId_);
    if (campaign && !campaign.isDisabled && !this.isLocked_(campaign)) {
      void selectionProgressCache.prefetch(campaign.scenarios.map((scenario) => scenario.id)).catch(() => {});
    }
  }

  private handleCampaignClick_(event: Event): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.selection-item');
    if (!row || row.dataset.campaignId === this.selectedCampaignId_) return;
    this.selectedCampaignId_ = row.dataset.campaignId ?? null;
    this.dom_.querySelectorAll<HTMLElement>('.selection-item').forEach((item) => item.setAttribute('aria-pressed', String(item === row)));
    this.renderSelectedCampaign_();
    this.prefetchSelectedCampaign_();
    const detail = qs<HTMLElement>('#campaign-detail', this.dom_);
    const briefing = detail.querySelector('.selection-briefing');
    if (briefing) briefing.scrollTop = 0;
    animateSelection(detail);
  }

  private handleEnterCampaign_(): void {
    const campaign = CampaignManager.getInstance()
      .getAllCampaigns()
      .find((c) => c.id === this.selectedCampaignId_);
    if (!campaign || campaign.isDisabled || this.isLocked_(campaign)) return;
    Router.getInstance().navigate(`/campaigns/${campaign.id}`);
  }
}
