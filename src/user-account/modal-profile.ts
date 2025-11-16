import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { Sfx } from '@app/sound/sfx-enum';
import { Auth } from './auth';
import SoundManager from '@app/sound/sound-manager';

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
              <label class="profile-form__label">Email:</label>
              <p class="profile-form__text" id="profile-email">${this.userEmail || 'Loading...'}</p>
            </div>
            <div class="profile-form__field">
              <label class="profile-form__label">Name:</label>
              <p class="profile-form__text" id="profile-name">${this.userName || 'Not set'}</p>
            </div>
          </div>
          <div class="profile-actions">
            <button type="button" id="logout-btn" class="profile-actions__btn profile-actions__btn--secondary">
              Logout
            </button>
          </div>
        </div>

        <!-- Divider -->
        <div class="profile-modal__divider"></div>

        <!-- Right Section: Additional Info -->
        <div class="profile-modal__section">
          <div class="profile-form">
            <div class="profile-form__field">
              <label class="profile-form__label">Account Type:</label>
              <p class="profile-form__text">Free</p>
            </div>
            <div class="profile-form__field">
              <label class="profile-form__label">Shared Account:</label>
              <p class="profile-form__text">SignalRange shares user accounts with KeepTrack</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  protected async onOpen(): Promise<void> {
    super.onOpen();
    await this.loadUserProfile();
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

  private initializeButtons(): void {
    const logoutBtn = this.boxEl?.querySelector('#logout-btn') as HTMLButtonElement;

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await this.handleLogout();
      });
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      SoundManager.getInstance().play(Sfx.TOGGLE_OFF);

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

  open(): void {
    super.open();
  }
}
