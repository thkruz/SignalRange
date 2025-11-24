import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { hideEl } from '@app/engine/utils/get-el';
import { Sfx } from '@app/sound/sfx-enum';
import SoundManager from '@app/sound/sound-manager';
import { Auth, UserProfile } from './auth';

type OAuthProvider = 'google' | 'linkedin_oidc' | 'github' | 'facebook';

interface OAuthButton {
  id: string;
  provider: OAuthProvider;
  icon: string;
  text: string;
  cssClass: string;
}

const oauthButtons = [
  {
    id: 'google-signin-btn',
    provider: 'google',
    icon: '/images/google.png',
    text: 'Continue with Google',
    cssClass: 'oauth-btn oauth-btn--google',
  },
  {
    id: 'linkedin-signin-btn',
    provider: 'linkedin_oidc',
    icon: '/images/linkedin-white.png',
    text: 'Continue with LinkedIn',
    cssClass: 'oauth-btn oauth-btn--linkedin',
  },
  {
    id: 'github-signin-btn',
    provider: 'github',
    icon: '/images/github-white.png',
    text: 'Continue with GitHub',
    cssClass: 'oauth-btn oauth-btn--github',
  },
  {
    id: 'facebook-signin-btn',
    provider: 'facebook',
    icon: '/images/facebook-white.png',
    text: 'Continue with Facebook',
    cssClass: 'oauth-btn oauth-btn--facebook',
  },
] as OAuthButton[];

export class ModalLogin extends DraggableModal {
  private static readonly id = 'modal-login';
  private static readonly isEmailSignInEnabled = false;
  private static instance_: ModalLogin | null = null;

  private constructor() {
    if (ModalLogin.instance_) {
      throw new Error('Use getInstance() instead of new.');
    }

    super(ModalLogin.id, { title: 'Login / Sign Up', width: '320px' });
  }

  static getInstance(): ModalLogin {
    this.instance_ ??= new ModalLogin();

    return this.instance_;
  }

  protected getModalContentHtml(): string {
    return html`
      <div class="oauth-section">
        ${this.renderOAuthButtons()}
      </div>
      ${this.renderEmailForm()}
    `;
  }

  private renderOAuthButtons(): string {
    return oauthButtons
      .map(
        (button) => `
        <button type="button" id="${button.id}" class="${button.cssClass}">
          <img src="${button.icon}" alt="${button.provider} Logo" class="oauth-btn__icon" />
          <span class="oauth-btn__text">${button.text}</span>
        </button>
      `,
      )
      .join('');
  }

  private renderEmailForm(): string {
    if (!ModalLogin.isEmailSignInEnabled) {
      return '';
    }

    return `
      <div class="auth-divider">
        <span class="auth-divider__text">or</span>
      </div>

      <form id="login-form" class="auth-form">
        <div class="auth-form__field">
          <label for="email" class="auth-form__label">Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            class="auth-form__input keyboard-priority"
            autoComplete="username"
            required
          />
        </div>

        <div class="auth-form__field">
          <label for="password" class="auth-form__label">Password:</label>
          <input
            type="password"
            id="password"
            name="password"
            class="auth-form__input keyboard-priority"
            autoComplete="current-password"
            required
          />
        </div>

        <div class="auth-form__actions">
          <button type="submit" class="auth-form__btn auth-form__btn--primary">Login</button>
          <button type="button" id="signup-btn" class="auth-form__btn auth-form__btn--secondary">
            Sign Up
          </button>
        </div>
      </form>
    `;
  }

  protected onOpen(): void {
    super.onOpen();
    this.initializeOAuthButtons();

    if (ModalLogin.isEmailSignInEnabled) {
      this.initializeEmailForm();
    }
  }

  private initializeOAuthButtons(): void {
    oauthButtons.forEach((buttonConfig) => {
      const button = this.getElement(buttonConfig.id) as HTMLButtonElement;

      if (button) {
        button.addEventListener('click', () => this.handleOAuthSignIn(buttonConfig));
      }
    });
  }

  private initializeEmailForm(): void {
    const loginForm = this.getElement('login-form') as HTMLFormElement;
    const signupBtn = this.getElement('signup-btn') as HTMLButtonElement;
    const emailInput = this.getElement('email') as HTMLInputElement;
    const passwordInput = this.getElement('password') as HTMLInputElement;

    if (signupBtn) {
      signupBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleSignUp(emailInput.value.trim(), passwordInput.value.trim());
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleEmailLogin(emailInput.value.trim(), passwordInput.value.trim());
      });
    }
  }

  private async handleOAuthSignIn(buttonConfig: OAuthButton): Promise<void> {
    const button = this.getElement(buttonConfig.id) as HTMLButtonElement;

    try {
      SoundManager.getInstance().play(Sfx.TOGGLE_ON);

      this.setButtonLoading(button, buttonConfig.provider);

      const { user } = await Auth.signInWithOAuthProvider(buttonConfig.provider, `${buttonConfig.provider} Sign In`);

      if (user) {
        this.close();
      }
    } catch (error) {
      this.handleOAuthError(error as Error, button, buttonConfig);
    }
  }

  private setButtonLoading(button: HTMLButtonElement, provider: string): void {
    button.disabled = true;
    const textElement = button.querySelector('.oauth-btn__text');

    if (textElement) {
      textElement.textContent = `Opening ${this.capitalizeProvider(provider)}...`;
    }
  }

  private handleOAuthError(error: Error, button: HTMLButtonElement, buttonConfig: OAuthButton): void {
    errorManagerInstance.warn(`${buttonConfig.provider} sign in failed: ${error.message}`);
    button.disabled = false;
    const textElement = button.querySelector('.oauth-btn__text');

    if (textElement) {
      textElement.textContent = buttonConfig.text;
    }
  }

  private capitalizeProvider(provider: string): string {
    const providerNames: Record<string, string> = {
      google: 'Google',
      linkedin_oidc: 'LinkedIn',
      github: 'GitHub',
      facebook: 'Facebook',
    };

    return providerNames[provider] || provider;
  }

  private async handleSignUp(email: string, password: string): Promise<void> {
    if (!email || !password) {
      return;
    }

    try {
      await this.signUp_(email, password);
      errorManagerInstance.info('Sign up successful! Check email for confirmation.');
      hideEl(this.boxEl!);
    } catch (error) {
      errorManagerInstance.warn(`Sign up failed: ${(error as Error).message}`);
    }
  }

  private async handleEmailLogin(email: string, password: string): Promise<void> {
    try {
      await this.login_(email, password);
      SoundManager.getInstance().play(Sfx.POWER_ON);
      hideEl(this.boxEl!);
    } catch (error) {
      errorManagerInstance.warn(`Login failed: ${(error as Error).message}`);
    }
  }

  private getElement(id: string): HTMLElement | null {
    return this.boxEl?.querySelector(`#${id}`) || null;
  }

  private async signUp_(email: string, password: string): Promise<boolean> {
    const initialProfile: UserProfile = {};
    const { error } = await Auth.signUp(email, password, initialProfile);

    if (error) {
      throw error;
    }

    return true;
  }

  private async login_(email: string, password: string): Promise<boolean> {
    if (!email || !password) {
      errorManagerInstance.warn('No email or password provided for login.');

      return false;
    }

    const { error } = await Auth.signIn(email, password);

    if (error) {
      throw error;
    }

    // Get the user profile from Supabase metadata
    // const profile = await Auth.getUserProfile();

    return true;
  }

  open(): void {
    super.open();
  }
}
