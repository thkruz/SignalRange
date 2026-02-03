import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { ModalConfirm } from '@app/engine/ui/modal-confirm';
import { html } from '@app/engine/utils/development/formatter';
import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { syncManager } from '@app/sync/storage';
import { Auth } from './auth';
import { getUserDataService } from './user-data-service';

export class ModalProfile extends DraggableModal {
  private static readonly id = 'modal-profile';
  private static instance_: ModalProfile | null = null;

  protected width: string | null = '600px';

  private userEmail: string = '';
  private userName: string = '';

  private constructor() {
    if (ModalProfile.instance_) {
      throw new Error('Use getInstance() instead of new.');
    }

    super(ModalProfile.id, { title: 'User Profile', width: '600px' });
  }

  static getInstance(): ModalProfile {
    this.instance_ ??= new ModalProfile();

    return this.instance_;
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="profile-modal">
        <!-- Left Section: Profile Info -->
        <div class="profile-modal__section">
          <div class="profile-form">
            <div class="profile-form__field">
              <label class="profile-form__label">Name</label>
              <p class="profile-form__text" id="profile-name">${this.userName || 'Not set'}</p>
            </div>
            <div class="profile-form__field">
              <label class="profile-form__label">Email</label>
              <p class="profile-form__text" id="profile-email">${this.userEmail || 'Loading...'}</p>
            </div>
            <div class="profile-stats-grid">
              <div class="profile-stat-card">
                <span class="profile-stat-card__value" id="profile-score">--</span>
                <span class="profile-stat-card__label">Total Score</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-card__value" id="profile-completed">--</span>
                <span class="profile-stat-card__label">Completed</span>
              </div>
            </div>
          </div>
          <div class="profile-actions">
            <button type="button" id="logout-btn" class="profile-actions__btn profile-actions__btn--secondary">
              Logout
            </button>
            <button type="button" id="clear-progress-btn" class="profile-actions__btn profile-actions__btn--danger">
              Clear Progress
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="profile-modal__divider"></div>

        <!-- Right Section: Achievements -->
        <div class="profile-modal__section profile-achievements-section">
          <div class="profile-achievements-placeholder">
            <h3 class="achievements-title">Achievements</h3>
            <div class="achievements-grid-wrapper">
              <div class="achievements-grid">
                ${new Array(15).fill('<div class="achievement-tile achievement-tile--placeholder"></div>').join('\n              ')}
              </div>
              <div class="coming-soon-banner">Coming Soon</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected async onOpen(): Promise<void> {
    super.onOpen();
    await this.loadUserProfile();
    this.loadProgressStats();
    this.initializeButtons();
  }

  private async loadUserProfile(): Promise<void> {
    try {
      const user = await Auth.getCurrentUser();
      const profile = await Auth.getUserProfile();

      if (user) {
        this.userEmail = user.email || 'Unknown';
        this.userName = profile?.full_name || profile?.name || user.user_metadata?.name || 'Not set';

        // Update DOM if modal is already open
        const emailEl = this.boxEl?.querySelector('#profile-email');
        const nameEl = this.boxEl?.querySelector('#profile-name');

        if (emailEl) {
          emailEl.textContent = this.userEmail;
        }
        if (nameEl) {
          nameEl.textContent = this.userName;
        }
      }
    } catch (error) {
      errorManagerInstance.error(error as Error, 'Failed to load user profile');
    }
  }

  private async loadProgressStats(): Promise<void> {
    try {
      const userDataService = getUserDataService();
      const response = await userDataService.getAllScenariosProgress();

      const scoreEl = this.boxEl?.querySelector('#profile-score');
      const completedEl = this.boxEl?.querySelector('#profile-completed');

      if (scoreEl) {
        scoreEl.textContent = response.summary.totalScore.toLocaleString();
      }
      if (completedEl) {
        completedEl.textContent = `${response.summary.completedScenarioCount} scenarios`;
      }
    } catch {
      // Progress stats are non-critical, silently fail
    }
  }

  private initializeButtons(): void {
    const logoutBtn = this.boxEl?.querySelector('#logout-btn') as HTMLButtonElement;
    const clearProgressBtn = this.boxEl?.querySelector('#clear-progress-btn') as HTMLButtonElement;

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.handleLogout();
      });
    }

    if (clearProgressBtn) {
      clearProgressBtn.addEventListener('click', () => {
        this.handleClearProgress();
      });
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      const { error } = await Auth.signOut();

      if (error) {
        errorManagerInstance.error(error, 'Logout failed');
      } else {
        errorManagerInstance.info('Logged out successfully');
        this.close();
      }
    } catch (error) {
      errorManagerInstance.error(error as Error, 'Logout error');
    }
  }

  private handleClearProgress(): void {
    const confirmModal = ModalConfirm.getInstance();

    confirmModal.open(
      async () => {
        await this.performClearProgress();
      },
      {
        title: 'Clear All Progress?',
        message:
          'Are you sure you want to clear all your progress? This will delete all your saved checkpoints and progress data. This action cannot be undone.',
        confirmText: 'Clear Progress',
        cancelText: 'Cancel',
        isDestructive: true,
      },
    );
  }

  private async performClearProgress(): Promise<void> {
    try {
      const userDataService = getUserDataService();

      // Delete all progress and checkpoints using the new bulk delete API
      await userDataService.deleteAllProgress();

      // Clear local sync storage to ensure objectives reset on reload
      await syncManager.clearStorage();

      // Refresh the page to reflect changes
      window.location.reload();

      errorManagerInstance.info('Progress cleared successfully');
    } catch (error) {
      errorManagerInstance.error(error as Error, 'Failed to clear progress');
    }
  }

  open(): void {
    super.open();
  }
}
