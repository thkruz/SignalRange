import { DraggableModal } from '@app/engine/ui/draggable-modal';
import { html } from '@app/engine/utils/development/formatter';
import { errorManagerInstance } from '@app/engine/utils/errorManager';
import { hideEl } from '@app/engine/utils/get-el';
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
  {
    id: 'discord-signin-btn',
    provider: 'discord',
    icon: '/images/discord-white.png',
    text: 'Continue with Discord',
    cssClass: 'oauth-btn oauth-btn--discord',
  }
] as OAuthButton[];

export class ModalLogin extends DraggableModal {
  private static readonly id = 'modal-login';
  private static readonly isEmailSignInEnabled = true;
  private static instance_: ModalLogin | null = null;
  private isSignUpMode_ = true;

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
      ${this.renderEmailForm()}
      <div class="auth-divider">
        <span class="auth-divider__text">or continue with</span>
      </div>
      <div class="oauth-section">
        ${this.renderOAuthButtons()}
      </div>
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
      <div style="padding: var(--user-account-spacing-lg);">
        <form id="auth-form" class="auth-form">
          <div class="auth-form__field">
            <input
              type="email"
              id="auth-email"
              name="email"
              placeholder="Email"
              class="auth-form__input keyboard-priority"
              autocomplete="email"
              required
            />
          </div>

          <div class="auth-form__field">
            <input
              type="password"
              id="auth-password"
              name="password"
              placeholder="Password"
              minlength="6"
              class="auth-form__input keyboard-priority"
              autocomplete="new-password"
              required
            />
          </div>

          <div id="auth-error" class="auth-form__error"></div>

          <div class="auth-form__actions">
            <button type="submit" id="auth-submit" class="auth-form__btn auth-form__btn--primary">Sign Up</button>
          </div>

          <p class="auth-toggle">
            <span id="auth-toggle-text">Already have an account?</span>
            <a href="#" id="auth-toggle-link" class="auth-toggle-link">Sign in</a>
          </p>
        </form>
      </div>
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
    const authForm = this.getElement('auth-form') as HTMLFormElement;
    const toggleLink = this.getElement('auth-toggle-link') as HTMLAnchorElement;

    if (toggleLink) {
      toggleLink.addEventListener('click', (event) => {
        event.preventDefault();
        this.isSignUpMode_ = !this.isSignUpMode_;
        this.updateAuthModeUI_();
      });
    }

    if (authForm) {
      authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const emailInput = this.getElement('auth-email') as HTMLInputElement;
        const passwordInput = this.getElement('auth-password') as HTMLInputElement;
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (this.isSignUpMode_) {
          this.handleSignUp(email, password);
        } else {
          this.handleEmailLogin(email, password);
        }
      });
    }
  }

  private updateAuthModeUI_(): void {
    this.clearError_();

    const submitBtn = this.getElement('auth-submit') as HTMLButtonElement;
    const toggleText = this.getElement('auth-toggle-text') as HTMLSpanElement;
    const toggleLink = this.getElement('auth-toggle-link') as HTMLAnchorElement;
    const passwordInput = this.getElement('auth-password') as HTMLInputElement;

    if (submitBtn) {
      submitBtn.textContent = this.isSignUpMode_ ? 'Sign Up' : 'Sign In';
    }
    if (toggleText) {
      toggleText.textContent = this.isSignUpMode_ ? 'Already have an account?' : "Don't have an account?";
    }
    if (toggleLink) {
      toggleLink.textContent = this.isSignUpMode_ ? 'Sign in' : 'Sign up';
    }
    if (passwordInput) {
      passwordInput.setAttribute('autocomplete', this.isSignUpMode_ ? 'new-password' : 'current-password');
    }
  }

  private async handleOAuthSignIn(buttonConfig: OAuthButton): Promise<void> {
    const button = this.getElement(buttonConfig.id) as HTMLButtonElement;

    try {
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

  private showError_(message: string): void {
    const errorEl = this.getElement('auth-error');

    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  private clearError_(): void {
    const errorEl = this.getElement('auth-error');

    if (errorEl) {
      errorEl.style.display = 'none';
    }
  }

  private getUserFriendlyError_(message: string): string {
    if (message.includes('Invalid login credentials')) {
      return 'Invalid email or password';
    }
    if (message.includes('Email not confirmed')) {
      return 'Please confirm your email before signing in';
    }
    if (message.includes('already registered')) {
      return 'An account with this email already exists';
    }

    return message;
  }

  private setSubmitLoading_(isLoading: boolean): void {
    const submitBtn = this.getElement('auth-submit') as HTMLButtonElement;

    if (!submitBtn) return;

    submitBtn.disabled = isLoading;
    if (isLoading) {
      submitBtn.textContent = this.isSignUpMode_ ? 'Signing up...' : 'Signing in...';
    } else {
      submitBtn.textContent = this.isSignUpMode_ ? 'Sign Up' : 'Sign In';
    }
  }

  private async handleSignUp(email: string, password: string): Promise<void> {
    if (!email || !password) {
      return;
    }

    this.clearError_();
    this.setSubmitLoading_(true);
    try {
      await this.signUp_(email, password);
      errorManagerInstance.info('Sign up successful! Check email for confirmation.');
      hideEl(this.boxEl!);
    } catch (error) {
      const message = (error as Error).message;

      this.showError_(this.getUserFriendlyError_(message));
      errorManagerInstance.warn(`Sign up failed: ${message}`);
    } finally {
      this.setSubmitLoading_(false);
    }
  }

  private async handleEmailLogin(email: string, password: string): Promise<void> {
    this.clearError_();
    this.setSubmitLoading_(true);
    try {
      await this.login_(email, password);
      hideEl(this.boxEl!);
    } catch (error) {
      const message = (error as Error).message;

      this.showError_(this.getUserFriendlyError_(message));
      errorManagerInstance.warn(`Login failed: ${message}`);
    } finally {
      this.setSubmitLoading_(false);
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
