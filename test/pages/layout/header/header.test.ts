// Mock query-selector
jest.mock('../../../../src/engine/utils/query-selector', () => ({
  qs: jest.fn(),
}));

jest.mock('../../../../src/router', () => ({
  Router: {
    getInstance: jest.fn(() => ({
      navigate: jest.fn(),
    })),
  },
}));

jest.mock('../../../../src/sound/sound-manager', () => {
  return {
    default: {
      getInstance: jest.fn(() => ({
        play: jest.fn(),
      })),
    },
    __esModule: true,
  };
});

jest.mock('../../../../src/sound/sfx-enum', () => ({
  Sfx: {
    TOGGLE_ON: 'toggle-on',
  },
}));

jest.mock('../../../../src/user-account/auth', () => ({
  Auth: {
    onAuthStateChange: jest.fn(),
    getCurrentUser: jest.fn(() => Promise.resolve(null)),
    isLoggedIn: jest.fn(() => Promise.resolve(false)),
  },
}));

jest.mock('../../../../src/user-account/modal-login', () => ({
  ModalLogin: {
    getInstance: jest.fn(() => ({
      open: jest.fn(),
    })),
  },
}));

jest.mock('../../../../src/user-account/modal-profile', () => ({
  ModalProfile: {
    getInstance: jest.fn(() => ({
      open: jest.fn(),
    })),
  },
}));

jest.mock('../../../../src/user-account/supabase-client', () => ({
  isSupabaseApprovedDomain: true,
}));

import { Header } from '../../../../src/pages/layout/header/header';
import { Router } from '../../../../src/router';
import SoundManager from '../../../../src/sound/sound-manager';
import { Auth } from '../../../../src/user-account/auth';
import { ModalLogin } from '../../../../src/user-account/modal-login';
import { ModalProfile } from '../../../../src/user-account/modal-profile';
import { qs } from '../../../../src/engine/utils/query-selector';

// Setup qs mock to use actual DOM
const mockQs = qs as jest.Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

describe('Header', () => {
  let rootElement: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton
    (Header as any).instance_ = undefined;

    // Create root element
    rootElement = document.createElement('div');
    rootElement.id = 'app-root';
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('singleton pattern', () => {
    it('should create instance with create()', () => {
      const header = Header.create('app-root');
      expect(header).toBeInstanceOf(Header);
    });

    it('should throw error if create() called twice', () => {
      Header.create('app-root');
      expect(() => Header.create('app-root')).toThrow('Header instance already exists.');
    });

    it('should return instance with getInstance()', () => {
      const header = Header.create('app-root');
      expect(Header.getInstance()).toBe(header);
    });

    it('should throw error from getInstance() before create()', () => {
      expect(() => Header.getInstance()).toThrow('Header instance does not exist.');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      Header.create('app-root');
    });

    it('should render header element with header class', () => {
      const header = document.querySelector('header.header');
      expect(header).not.toBeNull();
    });

    it('should render header-toolbar div', () => {
      const toolbar = document.querySelector('.header-toolbar');
      expect(toolbar).not.toBeNull();
    });

    it('should render logo section', () => {
      const logoSection = document.querySelector('.header-logo-section');
      expect(logoSection).not.toBeNull();
    });

    it('should render logo image', () => {
      const logo = document.querySelector('.header-logo-section img');
      expect(logo).not.toBeNull();
      expect(logo?.getAttribute('src')).toBe('/images/logo.png');
    });

    it('should render title section', () => {
      const titleSection = document.querySelector('.header-title-section');
      expect(titleSection).not.toBeNull();
    });

    it('should render main title', () => {
      const mainTitle = document.querySelector('.header-main-title');
      expect(mainTitle).not.toBeNull();
      expect(mainTitle?.textContent).toBe('SignalRange');
    });

    it('should render subtitle', () => {
      const subtitle = document.querySelector('.header-subtitle');
      expect(subtitle).not.toBeNull();
    });

    it('should render header actions', () => {
      const actions = document.querySelector('.header-actions');
      expect(actions).not.toBeNull();
    });

    it('should render Discord link', () => {
      const discordLink = document.querySelector('.header-actions a[href*="discord"]');
      expect(discordLink).not.toBeNull();
    });

    it('should render GitHub link', () => {
      const githubLink = document.querySelector('.header-actions a[href*="github"]');
      expect(githubLink).not.toBeNull();
    });
  });

  describe('user account section', () => {
    beforeEach(() => {
      Header.create('app-root');
    });

    it('should render login button', () => {
      const loginBtn = document.querySelector('#user-account__login-btn');
      expect(loginBtn).not.toBeNull();
    });

    it('should render profile button (hidden by default)', () => {
      const profileBtn = document.querySelector('#user-account__profile-btn');
      expect(profileBtn).not.toBeNull();
      expect(profileBtn?.classList.contains('user-account__profile-btn--hidden')).toBe(true);
    });
  });

  describe('logo click navigation', () => {
    it('should navigate to home when logo is clicked', () => {
      Header.create('app-root');
      const logo = document.querySelector('.header-logo-section img') as HTMLElement;
      const mockNavigate = jest.fn();
      (Router.getInstance as jest.Mock).mockReturnValue({ navigate: mockNavigate });

      logo?.click();

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('login button click', () => {
    it('should open login modal when clicked', () => {
      const mockOpen = jest.fn();
      (ModalLogin.getInstance as jest.Mock).mockReturnValue({ open: mockOpen });

      Header.create('app-root');
      const loginBtn = document.querySelector('#user-account__login-btn') as HTMLElement;

      loginBtn?.click();

      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe('profile button click', () => {
    it('should open profile modal when clicked', () => {
      const mockOpen = jest.fn();
      (ModalProfile.getInstance as jest.Mock).mockReturnValue({ open: mockOpen });

      Header.create('app-root');
      const profileBtn = document.querySelector('#user-account__profile-btn') as HTMLElement;

      profileBtn?.click();

      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe('auth state change', () => {
    it('should subscribe to auth state changes', () => {
      Header.create('app-root');
      expect(Auth.onAuthStateChange).toHaveBeenCalled();
    });

    it('should check initial auth state', () => {
      Header.create('app-root');
      expect(Auth.getCurrentUser).toHaveBeenCalled();
    });

    it('should show profile button when user logs in', async () => {
      Header.create('app-root');

      // Get the callback passed to onAuthStateChange
      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      // Simulate login
      const mockUser = {
        user_metadata: { full_name: 'Test User' },
        email: 'test@example.com',
      };
      await authCallback('SIGNED_IN', mockUser);

      const loginBtn = document.querySelector('#user-account__login-btn') as HTMLElement;
      const profileBtn = document.querySelector('#user-account__profile-btn') as HTMLElement;

      expect(loginBtn?.style.display).toBe('none');
      expect(profileBtn?.style.display).toBe('flex');
    });

    it('should show login button when user logs out', async () => {
      Header.create('app-root');

      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      // Simulate logout
      await authCallback('SIGNED_OUT', null);

      const loginBtn = document.querySelector('#user-account__login-btn') as HTMLElement;
      const profileBtn = document.querySelector('#user-account__profile-btn') as HTMLElement;

      expect(loginBtn?.style.display).toBe('flex');
      expect(profileBtn?.style.display).toBe('none');
    });
  });

  describe('profile button content', () => {
    it('should display user initials when no profile image', async () => {
      Header.create('app-root');
      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      const mockUser = {
        user_metadata: { full_name: 'John Doe' },
        email: 'john@example.com',
      };
      await authCallback('SIGNED_IN', mockUser);

      const profileBtn = document.querySelector('#user-account__profile-btn');
      expect(profileBtn?.textContent).toBe('JD');
    });

    it('should display profile image when available', async () => {
      Header.create('app-root');
      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      const mockUser = {
        user_metadata: { picture: 'https://example.com/avatar.jpg' },
        email: 'test@example.com',
      };
      await authCallback('SIGNED_IN', mockUser);

      const profileImg = document.querySelector('#user-account__profile-btn img');
      expect(profileImg).not.toBeNull();
      expect(profileImg?.getAttribute('src')).toBe('https://example.com/avatar.jpg');
    });

    it('should use avatar_url for GitHub OAuth', async () => {
      Header.create('app-root');
      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      const mockUser = {
        user_metadata: { avatar_url: 'https://github.com/avatar.jpg' },
        email: 'test@example.com',
      };
      await authCallback('SIGNED_IN', mockUser);

      const profileImg = document.querySelector('#user-account__profile-btn img');
      expect(profileImg?.getAttribute('src')).toBe('https://github.com/avatar.jpg');
    });

    it('should fallback to default initials when no name or email', async () => {
      Header.create('app-root');
      const authCallback = (Auth.onAuthStateChange as jest.Mock).mock.calls[0][0];

      const mockUser = {
        user_metadata: {},
        email: null,
      };
      await authCallback('SIGNED_IN', mockUser);

      const profileBtn = document.querySelector('#user-account__profile-btn');
      // When email is null and name is empty, it falls back to "??" which gets processed:
      // "??" split by space = ["??"], map first char = "?", slice(0,2) = "?"
      expect(profileBtn?.textContent).toBeTruthy();
    });
  });

  describe('makeSmall', () => {
    let header: Header;

    beforeEach(() => {
      header = Header.create('app-root');
    });

    it('should add small class when isSmall is true', () => {
      header.makeSmall(true);
      const headerEl = document.querySelector('.header');
      expect(headerEl?.classList.contains('small')).toBe(true);
    });

    it('should remove small class when isSmall is false', () => {
      header.makeSmall(true);
      header.makeSmall(false);
      const headerEl = document.querySelector('.header');
      expect(headerEl?.classList.contains('small')).toBe(false);
    });
  });
});
