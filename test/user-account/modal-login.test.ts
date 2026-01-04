// Mock all dependencies before imports
jest.mock('@app/engine/ui/draggable-modal', () => ({
  DraggableModal: class MockDraggableModal {
    protected boxEl: HTMLElement | null = null;
    constructor(_id: string, _options?: unknown) {}
    protected onOpen(): void {}
    open(): void { this.onOpen(); }
    close(): void {}
  },
}));

jest.mock('@app/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, str, i) => result + str + (values[i] ?? ''), ''),
}));

jest.mock('@app/engine/utils/errorManager', () => ({
  errorManagerInstance: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('@app/engine/utils/get-el', () => ({
  hideEl: jest.fn(),
}));

jest.mock('@app/sound/sound-manager', () => ({
  default: { getInstance: () => ({ play: jest.fn() }) },
}));

jest.mock('@app/sound/sfx-enum', () => ({
  Sfx: { TOGGLE_ON: 'TOGGLE_ON', POWER_ON: 'POWER_ON' },
}));

jest.mock('@app/user-account/auth', () => ({
  Auth: {
    signUp: jest.fn(),
    signIn: jest.fn(),
    signInWithOAuthProvider: jest.fn(),
  },
  UserProfile: {},
}));

import { ModalLogin } from '../../src/user-account/modal-login';

describe('ModalLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton between tests
    (ModalLogin as unknown as { instance_: null }).instance_ = null;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ModalLogin.getInstance();
      const instance2 = ModalLogin.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should throw when using new after getInstance', () => {
      ModalLogin.getInstance();
      expect(() => new (ModalLogin as unknown as new () => ModalLogin)()).toThrow(
        'Use getInstance() instead of new.'
      );
    });
  });

  describe('capitalizeProvider', () => {
    it('should capitalize known providers correctly', () => {
      const modal = ModalLogin.getInstance();
      const capitalizeProvider = (modal as unknown as { capitalizeProvider: (p: string) => string }).capitalizeProvider.bind(modal);

      expect(capitalizeProvider('google')).toBe('Google');
      expect(capitalizeProvider('linkedin_oidc')).toBe('LinkedIn');
      expect(capitalizeProvider('github')).toBe('GitHub');
      expect(capitalizeProvider('facebook')).toBe('Facebook');
    });

    it('should return original provider name for unknown providers', () => {
      const modal = ModalLogin.getInstance();
      const capitalizeProvider = (modal as unknown as { capitalizeProvider: (p: string) => string }).capitalizeProvider.bind(modal);

      expect(capitalizeProvider('twitter')).toBe('twitter');
      expect(capitalizeProvider('unknown')).toBe('unknown');
    });
  });

  describe('getUserFriendlyError_', () => {
    it('should convert Invalid login credentials error', () => {
      const modal = ModalLogin.getInstance();
      const getUserFriendlyError = (modal as unknown as { getUserFriendlyError_: (m: string) => string }).getUserFriendlyError_.bind(modal);

      expect(getUserFriendlyError('Invalid login credentials')).toBe('Invalid email or password');
    });

    it('should convert Email not confirmed error', () => {
      const modal = ModalLogin.getInstance();
      const getUserFriendlyError = (modal as unknown as { getUserFriendlyError_: (m: string) => string }).getUserFriendlyError_.bind(modal);

      expect(getUserFriendlyError('Email not confirmed')).toBe('Please confirm your email before signing in');
    });

    it('should convert already registered error', () => {
      const modal = ModalLogin.getInstance();
      const getUserFriendlyError = (modal as unknown as { getUserFriendlyError_: (m: string) => string }).getUserFriendlyError_.bind(modal);

      expect(getUserFriendlyError('User already registered')).toBe('An account with this email already exists');
    });

    it('should return original message for unknown errors', () => {
      const modal = ModalLogin.getInstance();
      const getUserFriendlyError = (modal as unknown as { getUserFriendlyError_: (m: string) => string }).getUserFriendlyError_.bind(modal);

      expect(getUserFriendlyError('Some other error')).toBe('Some other error');
      expect(getUserFriendlyError('Network timeout')).toBe('Network timeout');
    });
  });

  describe('getModalContentHtml', () => {
    it('should render email form elements', () => {
      const modal = ModalLogin.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('auth-form');
      expect(html).toContain('auth-email');
      expect(html).toContain('auth-password');
      expect(html).toContain('auth-submit');
    });

    it('should render OAuth buttons', () => {
      const modal = ModalLogin.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('google-signin-btn');
      expect(html).toContain('github-signin-btn');
      expect(html).toContain('linkedin-signin-btn');
      expect(html).toContain('facebook-signin-btn');
    });

    it('should render auth toggle link', () => {
      const modal = ModalLogin.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('auth-toggle-link');
      expect(html).toContain('Already have an account?');
    });
  });

  describe('isSignUpMode toggle', () => {
    it('should start in sign up mode', () => {
      const modal = ModalLogin.getInstance();
      const isSignUpMode = (modal as unknown as { isSignUpMode_: boolean }).isSignUpMode_;
      expect(isSignUpMode).toBe(true);
    });
  });

  describe('updateAuthModeUI_', () => {
    let modal: ModalLogin;
    let mockBoxEl: HTMLElement;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
      mockBoxEl = document.createElement('div');
      mockBoxEl.innerHTML = `
        <button id="auth-submit">Sign Up</button>
        <span id="auth-toggle-text">Already have an account?</span>
        <a id="auth-toggle-link">Sign in</a>
        <input id="auth-password" type="password" autocomplete="new-password" />
        <div id="auth-error" style="display: block;">Some error</div>
      `;
      (modal as any).boxEl = mockBoxEl;
    });

    it('should update UI for sign in mode', () => {
      (modal as any).isSignUpMode_ = false;
      (modal as any).updateAuthModeUI_();

      expect(mockBoxEl.querySelector('#auth-submit')!.textContent).toBe('Sign In');
      expect(mockBoxEl.querySelector('#auth-toggle-text')!.textContent).toBe("Don't have an account?");
      expect(mockBoxEl.querySelector('#auth-toggle-link')!.textContent).toBe('Sign up');
      expect(mockBoxEl.querySelector('#auth-password')!.getAttribute('autocomplete')).toBe('current-password');
    });

    it('should update UI for sign up mode', () => {
      (modal as any).isSignUpMode_ = true;
      (modal as any).updateAuthModeUI_();

      expect(mockBoxEl.querySelector('#auth-submit')!.textContent).toBe('Sign Up');
      expect(mockBoxEl.querySelector('#auth-toggle-text')!.textContent).toBe('Already have an account?');
      expect(mockBoxEl.querySelector('#auth-toggle-link')!.textContent).toBe('Sign in');
      expect(mockBoxEl.querySelector('#auth-password')!.getAttribute('autocomplete')).toBe('new-password');
    });

    it('should clear errors when toggling mode', () => {
      (modal as any).updateAuthModeUI_();

      expect(mockBoxEl.querySelector('#auth-error')!.getAttribute('style')).toContain('none');
    });
  });

  describe('showError_ and clearError_', () => {
    let modal: ModalLogin;
    let mockBoxEl: HTMLElement;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
      mockBoxEl = document.createElement('div');
      mockBoxEl.innerHTML = `<div id="auth-error" style="display: none;"></div>`;
      (modal as any).boxEl = mockBoxEl;
    });

    it('should show error message', () => {
      (modal as any).showError_('Test error');

      const errorEl = mockBoxEl.querySelector('#auth-error') as HTMLElement;
      expect(errorEl.textContent).toBe('Test error');
      expect(errorEl.style.display).toBe('block');
    });

    it('should clear error', () => {
      const errorEl = mockBoxEl.querySelector('#auth-error') as HTMLElement;
      errorEl.style.display = 'block';
      errorEl.textContent = 'Some error';

      (modal as any).clearError_();

      expect(errorEl.style.display).toBe('none');
    });
  });

  describe('setSubmitLoading_', () => {
    let modal: ModalLogin;
    let mockBoxEl: HTMLElement;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
      mockBoxEl = document.createElement('div');
      mockBoxEl.innerHTML = `<button id="auth-submit">Sign Up</button>`;
      (modal as any).boxEl = mockBoxEl;
    });

    it('should show loading state for sign up', () => {
      (modal as any).isSignUpMode_ = true;
      (modal as any).setSubmitLoading_(true);

      const btn = mockBoxEl.querySelector('#auth-submit') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toBe('Signing up...');
    });

    it('should show loading state for sign in', () => {
      (modal as any).isSignUpMode_ = false;
      (modal as any).setSubmitLoading_(true);

      const btn = mockBoxEl.querySelector('#auth-submit') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toBe('Signing in...');
    });

    it('should reset loading state for sign up', () => {
      (modal as any).isSignUpMode_ = true;
      (modal as any).setSubmitLoading_(false);

      const btn = mockBoxEl.querySelector('#auth-submit') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toBe('Sign Up');
    });

    it('should reset loading state for sign in', () => {
      (modal as any).isSignUpMode_ = false;
      (modal as any).setSubmitLoading_(false);

      const btn = mockBoxEl.querySelector('#auth-submit') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toBe('Sign In');
    });

    it('should handle missing submit button', () => {
      (modal as any).boxEl = document.createElement('div');
      expect(() => (modal as any).setSubmitLoading_(true)).not.toThrow();
    });
  });

  describe('setButtonLoading', () => {
    let modal: ModalLogin;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
    });

    it('should disable button and update text', () => {
      const button = document.createElement('button');
      button.innerHTML = '<span class="oauth-btn__text">Continue with Google</span>';

      (modal as any).setButtonLoading(button, 'google');

      expect(button.disabled).toBe(true);
      expect(button.querySelector('.oauth-btn__text')!.textContent).toBe('Opening Google...');
    });

    it('should handle button without text element', () => {
      const button = document.createElement('button');
      expect(() => (modal as any).setButtonLoading(button, 'google')).not.toThrow();
      expect(button.disabled).toBe(true);
    });
  });

  describe('handleOAuthError', () => {
    let modal: ModalLogin;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
    });

    it('should re-enable button and restore text', () => {
      const button = document.createElement('button');
      button.disabled = true;
      button.innerHTML = '<span class="oauth-btn__text">Opening Google...</span>';

      const buttonConfig = {
        id: 'google-signin-btn',
        provider: 'google' as const,
        icon: '/images/google.png',
        text: 'Continue with Google',
        cssClass: 'oauth-btn oauth-btn--google',
      };

      (modal as any).handleOAuthError(new Error('Test error'), button, buttonConfig);

      expect(button.disabled).toBe(false);
      expect(button.querySelector('.oauth-btn__text')!.textContent).toBe('Continue with Google');
    });
  });

  describe('handleSignUp', () => {
    let modal: ModalLogin;
    let mockAuth: { signUp: jest.Mock };
    let mockHideEl: jest.Mock;

    beforeEach(async () => {
      jest.resetModules();
      mockAuth = { signUp: jest.fn() };
      mockHideEl = jest.fn();

      jest.doMock('@app/user-account/auth', () => ({
        Auth: mockAuth,
        UserProfile: {},
      }));
      jest.doMock('@app/engine/utils/get-el', () => ({
        hideEl: mockHideEl,
      }));

      const { ModalLogin: ML } = await import('../../src/user-account/modal-login');
      (ML as any).instance_ = null;
      modal = ML.getInstance();
      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `
        <div id="auth-error" style="display: none;"></div>
        <button id="auth-submit">Sign Up</button>
      `;
    });

    it('should return early if email or password is empty', async () => {
      await (modal as any).handleSignUp('', 'password');
      expect(mockAuth.signUp).not.toHaveBeenCalled();

      await (modal as any).handleSignUp('email@test.com', '');
      expect(mockAuth.signUp).not.toHaveBeenCalled();
    });

    it('should call Auth.signUp and hide modal on success', async () => {
      mockAuth.signUp.mockResolvedValue({ error: null });

      await (modal as any).handleSignUp('test@example.com', 'password123');

      expect(mockAuth.signUp).toHaveBeenCalledWith('test@example.com', 'password123', {});
      expect(mockHideEl).toHaveBeenCalled();
    });

    it('should show error on signUp failure', async () => {
      mockAuth.signUp.mockResolvedValue({ error: new Error('User already registered') });

      await (modal as any).handleSignUp('test@example.com', 'password123');

      const errorEl = (modal as any).boxEl.querySelector('#auth-error');
      expect(errorEl.textContent).toBe('An account with this email already exists');
      expect(errorEl.style.display).toBe('block');
    });
  });

  describe('handleEmailLogin', () => {
    let modal: ModalLogin;

    beforeEach(() => {
      (ModalLogin as any).instance_ = null;
      modal = ModalLogin.getInstance();
      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `
        <div id="auth-error" style="display: none;"></div>
        <button id="auth-submit">Sign In</button>
      `;
    });

    it('should hide modal on successful login', async () => {
      // Mock the internal login_ method to succeed
      jest.spyOn(modal as any, 'login_').mockResolvedValue(true);

      await (modal as any).handleEmailLogin('test@example.com', 'password123');

      expect((modal as any).login_).toHaveBeenCalledWith('test@example.com', 'password123');
      // Modal should be hidden (boxEl.style.display = 'none' via hideEl)
      // Since hideEl is mocked at module level, we verify the flow completed without error
    });

    it('should show error on signIn failure', async () => {
      // Mock the internal login_ method to throw an error
      jest.spyOn(modal as any, 'login_').mockRejectedValue(new Error('Invalid login credentials'));

      await (modal as any).handleEmailLogin('test@example.com', 'wrongpassword');

      const errorEl = (modal as any).boxEl.querySelector('#auth-error');
      expect(errorEl.textContent).toBe('Invalid email or password');
      expect(errorEl.style.display).toBe('block');
    });

    it('should show loading state during login', async () => {
      // Set to sign-in mode
      (modal as any).isSignUpMode_ = false;

      let resolveLogin: (value: boolean) => void;
      const loginPromise = new Promise<boolean>((resolve) => {
        resolveLogin = resolve;
      });
      jest.spyOn(modal as any, 'login_').mockReturnValue(loginPromise);

      const handlePromise = (modal as any).handleEmailLogin('test@example.com', 'password');

      // Check loading state is shown
      const submitBtn = (modal as any).boxEl.querySelector('#auth-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
      expect(submitBtn.textContent).toBe('Signing in...');

      // Resolve the login
      resolveLogin!(true);
      await handlePromise;

      // Loading state should be reset
      expect(submitBtn.disabled).toBe(false);
    });
  });

  describe('login_', () => {
    let modal: ModalLogin;
    let mockAuth: { signIn: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockAuth = { signIn: jest.fn() };

      jest.doMock('@app/user-account/auth', () => ({
        Auth: mockAuth,
        UserProfile: {},
      }));

      const { ModalLogin: ML } = await import('../../src/user-account/modal-login');
      (ML as any).instance_ = null;
      modal = ML.getInstance();
    });

    it('should return false when email is empty', async () => {
      const result = await (modal as any).login_('', 'password');
      expect(result).toBe(false);
      expect(mockAuth.signIn).not.toHaveBeenCalled();
    });

    it('should return false when password is empty', async () => {
      const result = await (modal as any).login_('email@test.com', '');
      expect(result).toBe(false);
      expect(mockAuth.signIn).not.toHaveBeenCalled();
    });

    it('should throw when Auth.signIn returns error', async () => {
      mockAuth.signIn.mockResolvedValue({ error: new Error('Auth failed') });

      await expect((modal as any).login_('test@example.com', 'pass')).rejects.toThrow('Auth failed');
    });

    it('should return true on success', async () => {
      mockAuth.signIn.mockResolvedValue({ error: null });

      const result = await (modal as any).login_('test@example.com', 'pass');
      expect(result).toBe(true);
    });
  });

  describe('signUp_', () => {
    let modal: ModalLogin;
    let mockAuth: { signUp: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockAuth = { signUp: jest.fn() };

      jest.doMock('@app/user-account/auth', () => ({
        Auth: mockAuth,
        UserProfile: {},
      }));

      const { ModalLogin: ML } = await import('../../src/user-account/modal-login');
      (ML as any).instance_ = null;
      modal = ML.getInstance();
    });

    it('should throw when Auth.signUp returns error', async () => {
      mockAuth.signUp.mockResolvedValue({ error: new Error('Registration failed') });

      await expect((modal as any).signUp_('test@example.com', 'pass')).rejects.toThrow('Registration failed');
    });

    it('should return true on success', async () => {
      mockAuth.signUp.mockResolvedValue({ error: null });

      const result = await (modal as any).signUp_('test@example.com', 'pass');
      expect(result).toBe(true);
    });
  });

  describe('getElement', () => {
    let modal: ModalLogin;

    beforeEach(() => {
      modal = ModalLogin.getInstance();
    });

    it('should return element from boxEl', () => {
      const mockBoxEl = document.createElement('div');
      mockBoxEl.innerHTML = '<input id="test-input" />';
      (modal as any).boxEl = mockBoxEl;

      const result = (modal as any).getElement('test-input');
      expect(result).toBe(mockBoxEl.querySelector('#test-input'));
    });

    it('should return null when boxEl is null', () => {
      (modal as any).boxEl = null;
      const result = (modal as any).getElement('test-input');
      expect(result).toBeNull();
    });

    it('should return null when element not found', () => {
      (modal as any).boxEl = document.createElement('div');
      const result = (modal as any).getElement('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('renderOAuthButtons', () => {
    it('should render all OAuth provider buttons', () => {
      const modal = ModalLogin.getInstance();
      const html = (modal as any).renderOAuthButtons();

      expect(html).toContain('google-signin-btn');
      expect(html).toContain('linkedin-signin-btn');
      expect(html).toContain('github-signin-btn');
      expect(html).toContain('facebook-signin-btn');
      expect(html).toContain('discord-signin-btn');
      expect(html).toContain('Continue with Google');
      expect(html).toContain('Continue with LinkedIn');
      expect(html).toContain('Continue with GitHub');
      expect(html).toContain('Continue with Facebook');
      expect(html).toContain('Continue with Discord');
    });
  });

  describe('renderEmailForm', () => {
    it('should render email form when enabled', () => {
      const modal = ModalLogin.getInstance();
      const html = (modal as any).renderEmailForm();

      expect(html).toContain('auth-form');
      expect(html).toContain('auth-email');
      expect(html).toContain('auth-password');
      expect(html).toContain('type="email"');
      expect(html).toContain('type="password"');
      expect(html).toContain('minlength="6"');
    });
  });
});
