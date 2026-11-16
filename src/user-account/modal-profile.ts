import { CampaignManager } from '@app/campaigns/campaign-manager';
import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { ModalConfirm } from '@app/engine/ui/modal-confirm';
import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { setMenuPause } from '@app/game-menu/menu-pause';
import { syncManager } from '@app/sync/storage';
import { type AchievementProgress, achievementCatalog, evaluateAchievements } from './achievement-catalog';
import { achievementToast } from './achievement-toast';
import { Auth } from './auth';
import { type AchievementFilter, renderAchievements, renderServiceRecord } from './profile-record';
import { selectionProgressCache } from './selection-progress-cache';
import { getUserDataService } from './user-data-service';
import './profile.css';

type ProfileTab = 'record' | 'achievements' | 'account';
const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'record', label: 'Service record' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'account', label: 'Account' },
];

export class ModalProfile extends DraggableModal {
  private static readonly id = 'modal-profile';
  private static instance_: ModalProfile | null = null;
  protected width: string | null = 'min(880px, calc(var(--mc-viewport-width, 100vw) - 32px))';
  private activeTab_: ProfileTab = 'record';
  private filter_: AchievementFilter = 'all';
  private achievements_: AchievementProgress[] = [];
  private loadGeneration_ = 0;
  private returnFocus_: HTMLElement | null = null;
  private accountId_: string | null = null;

  private constructor() {
    super(ModalProfile.id, { title: 'Operator profile' });
    Auth.onAuthStateChange((event, user) => {
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && user?.id !== this.accountId_)) this.close();
    });
  }

  static getInstance(): ModalProfile {
    this.instance_ ??= new ModalProfile();
    return this.instance_;
  }

  protected getModalContentHtml(): string {
    return `<div class="operator-profile">
      <header class="profile-identity"><div id="profile-initials" aria-hidden="true">—</div>
        <div><span class="profile-eyebrow">SignalRange operator</span><h1 id="profile-name">Loading profile…</h1></div>
      </header>
      <div class="profile-totals" aria-label="Service totals">
        <div><strong id="profile-score">—</strong><span>Total score</span></div>
        <div><strong id="profile-completed">—</strong><span>Missions completed</span></div>
        <div><strong id="profile-earned">—</strong><span>Achievements earned</span></div>
      </div>
      <div class="profile-tabs" role="tablist" aria-label="Profile sections">${TABS.map((tab) => `<button type="button" role="tab" id="profile-tab-${tab.id}" aria-controls="profile-panel-${tab.id}" aria-selected="${tab.id === this.activeTab_}" tabindex="${tab.id === this.activeTab_ ? 0 : -1}" data-profile-tab="${tab.id}">${tab.label}</button>`).join('')}</div>
      <div class="profile-status" id="profile-status" role="status"><span>Loading your service record…</span>
        <button type="button" id="profile-retry" hidden>Retry</button></div>
      <div class="profile-panels" id="profile-panels" hidden>
        <section role="tabpanel" id="profile-panel-record" aria-labelledby="profile-tab-record" tabindex="0"></section>
        <section role="tabpanel" id="profile-panel-achievements" aria-labelledby="profile-tab-achievements" tabindex="0" hidden>
          <div class="profile-achievement-heading"><h2>Achievement collection</h2><span id="profile-award-count"></span></div>
          <p class="profile-note">Earned from your saved mission results. Clear progress resets these achievements.</p>
          <div class="profile-filters" role="group" aria-label="Filter achievements">${(['all', 'earned', 'locked'] as const).map((filter) => `<button type="button" data-achievement-filter="${filter}" aria-pressed="${filter === 'all'}">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join('')}</div>
          <div id="profile-achievements"></div>
        </section>
        <section role="tabpanel" id="profile-panel-account" aria-labelledby="profile-tab-account" tabindex="0" hidden>
          <h2>Account details</h2><dl class="profile-account-details"><dt>Email</dt><dd id="profile-email">—</dd><dt>Member since</dt><dd id="profile-member-since">—</dd></dl>
          <p class="profile-note">Mission results and checkpoints are saved to your account.</p>
          <div class="profile-notification-setting">
            <label for="profile-achievement-style">Achievement notifications</label>
            <select id="profile-achievement-style">
              <option value="compact">Compact (Steam-style)</option>
              <option value="card">Detailed card (original)</option>
            </select>
          </div>
          <div class="profile-account-actions"><button type="button" id="logout-btn">Log out</button></div>
          <div class="profile-reset"><h2>Reset service record</h2><p>This removes saved checkpoints, mission progress, and the achievements earned from those results.</p>
            <button type="button" id="clear-progress-btn">Clear progress</button></div>
        </section>
      </div>
    </div>`;
  }

  protected override onOpen(): void {
    super.onOpen();
    // The persistent modal creates its DOM once. Refresh data on every open below.
    this.boxEl?.querySelectorAll<HTMLButtonElement>('[data-profile-tab]').forEach((button) => {
      button.onclick = () => this.selectTab_(button.dataset.profileTab as ProfileTab);
      button.onkeydown = (event) => {
        const index = TABS.findIndex((tab) => tab.id === this.activeTab_);
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
        else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = TABS.length - 1;
        else return;
        event.preventDefault();
        this.selectTab_(TABS[next].id);
        this.boxEl?.querySelector<HTMLButtonElement>(`#profile-tab-${this.activeTab_}`)?.focus();
      };
    });
    this.boxEl?.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]').forEach((button) => {
      button.onclick = () => {
        this.filter_ = button.dataset.achievementFilter as AchievementFilter;
        this.renderAwards_();
      };
    });
    this.boxEl!.querySelector<HTMLButtonElement>('#logout-btn')!.onclick = () => void this.handleLogout_();
    this.boxEl!.querySelector<HTMLButtonElement>('#clear-progress-btn')!.onclick = () => this.handleClearProgress_();
    this.boxEl!.querySelector<HTMLButtonElement>('#profile-retry')!.onclick = () => void this.loadProfile_();
    this.boxEl!.querySelector<HTMLSelectElement>('#profile-achievement-style')!.onchange = (event) => {
      achievementToast.setStyle((event.target as HTMLSelectElement).value === 'card' ? 'card' : 'compact');
    };
    this.boxEl!.addEventListener('keydown', (event) => this.handleKeydown_(event));
    const close = this.boxEl!.querySelector<HTMLElement>('#modal-profile-close')!;
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', 'Close profile');
    close.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>';
    close.tabIndex = 0;
    close.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.close();
      }
    };
    const dialog = this.boxEl!.querySelector('#modal-profile')!;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Operator profile');
    this.draggie?.disable();
  }

  override open(): void {
    setMenuPause('profile', true);
    this.returnFocus_ = document.activeElement as HTMLElement | null;
    super.open();
    const achievementStyle = this.boxEl?.querySelector<HTMLSelectElement>('#profile-achievement-style');
    if (achievementStyle) achievementStyle.value = achievementToast.style;
    this.selectTab_(this.activeTab_);
    this.boxEl?.querySelector<HTMLButtonElement>(`#profile-tab-${this.activeTab_}`)?.focus();
    void this.loadProfile_();
  }

  override close(): void {
    setMenuPause('profile', false);
    ++this.loadGeneration_;
    super.close();
    this.returnFocus_?.focus();
  }

  private handleKeydown_(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.boxEl!.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), select:not(:disabled), [tabindex="0"]')].filter(
      (element) => !element.closest('[hidden]')
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  private selectTab_(tab: ProfileTab): void {
    this.activeTab_ = tab;
    for (const entry of TABS) {
      const selected = entry.id === tab;
      const button = this.boxEl?.querySelector<HTMLButtonElement>(`#profile-tab-${entry.id}`);
      button?.setAttribute('aria-selected', String(selected));
      if (button) button.tabIndex = selected ? 0 : -1;
      const panel = this.boxEl?.querySelector<HTMLElement>(`#profile-panel-${entry.id}`);
      if (panel) panel.hidden = !selected;
    }
  }

  private async loadProfile_(): Promise<void> {
    const generation = ++this.loadGeneration_;
    const status = this.boxEl!.querySelector<HTMLElement>('#profile-status')!;
    const panels = this.boxEl!.querySelector<HTMLElement>('#profile-panels')!;
    const retry = this.boxEl!.querySelector<HTMLButtonElement>('#profile-retry')!;
    status.hidden = false;
    panels.hidden = true;
    retry.hidden = true;
    status.querySelector('span')!.textContent = 'Loading your service record…';
    this.setText_('profile-name', 'Loading profile…');
    for (const id of ['profile-initials', 'profile-score', 'profile-completed', 'profile-earned', 'profile-email', 'profile-member-since']) this.setText_(id, '—');
    try {
      // Read the local auth session and shared menu cache, avoiding duplicate account downloads.
      const [user, progress] = await Promise.all([Auth.initializeAuth(), selectionProgressCache.getProgress()]);
      if (generation !== this.loadGeneration_) return;
      if (!user || !progress) throw new Error('Sign in to view your service record.');
      this.accountId_ = user.id;
      const name = String(user.user_metadata?.full_name || user.user_metadata?.name || 'Operator');
      this.setText_('profile-name', name);
      this.setText_(
        'profile-initials',
        name
          .split(/\s+/u)
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      );
      this.setText_('profile-email', user.email || 'Not provided');
      this.setText_('profile-member-since', new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
      this.setText_('profile-score', progress.summary.totalScore.toLocaleString());
      this.setText_('profile-completed', String(progress.summary.completedScenarioCount));
      const campaigns = CampaignManager.getInstance().getAllCampaigns();
      this.achievements_ = evaluateAchievements(achievementCatalog(campaigns), progress.scenarios);
      this.renderAwards_();
      this.boxEl!.querySelector('#profile-panel-record')!.innerHTML = renderServiceRecord(campaigns, progress);
      status.hidden = true;
      panels.hidden = false;
    } catch {
      if (generation !== this.loadGeneration_) return;
      this.setText_('profile-name', 'Operator profile');
      status.querySelector('span')!.textContent = 'Your service record could not be loaded. Check your connection and try again.';
      retry.hidden = false;
    }
  }

  private setText_(id: string, value: string): void {
    const element = this.boxEl?.querySelector(`#${id}`);
    if (element) element.textContent = value;
  }

  private renderAwards_(): void {
    const earned = this.achievements_.filter((achievement) => achievement.unlockedAt).length;
    this.setText_('profile-earned', `${earned} / ${this.achievements_.length}`);
    this.setText_('profile-award-count', `${earned} of ${this.achievements_.length} earned`);
    this.boxEl!.querySelector('#profile-achievements')!.innerHTML = renderAchievements(this.achievements_, this.filter_);
    this.boxEl
      ?.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]')
      .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.achievementFilter === this.filter_)));
  }

  private async handleLogout_(): Promise<void> {
    try {
      const { error } = await Auth.signOut();
      if (error) throw error;
      this.close();
    } catch (error) {
      errorManagerInstance.error(error as Error, 'Logout failed');
    }
  }

  private handleClearProgress_(): void {
    ModalConfirm.getInstance().open(() => void this.performClearProgress_(), {
      title: 'Clear All Progress?',
      message: 'This will delete all your saved checkpoints, mission progress, and achievements earned from those results. This action cannot be undone.',
      confirmText: 'Clear Progress',
      cancelText: 'Cancel',
      isDestructive: true,
    });
  }

  private async performClearProgress_(): Promise<void> {
    try {
      await getUserDataService().deleteAllProgress();
      await syncManager.clearStorage();
      window.location.reload();
    } catch (error) {
      errorManagerInstance.error(error as Error, 'Failed to clear progress');
    }
  }
}
