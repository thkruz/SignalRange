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
});
