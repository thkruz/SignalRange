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

jest.mock('@app/engine/ui/modal-confirm', () => ({
  ModalConfirm: {
    getInstance: () => ({ open: jest.fn() }),
  },
}));

jest.mock('@app/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, str, i) => result + str + (values[i] ?? ''), ''),
}));

jest.mock('@app/engine/utils/errorManager', () => ({
  errorManagerInstance: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('@app/sound/sound-manager', () => ({
  default: { getInstance: () => ({ play: jest.fn() }) },
}));

jest.mock('@app/sound/sfx-enum', () => ({
  Sfx: { TOGGLE_OFF: 'TOGGLE_OFF' },
}));

jest.mock('@app/sync/storage', () => ({
  syncManager: { clearStorage: jest.fn() },
}));

jest.mock('@app/user-account/auth', () => ({
  Auth: {
    getCurrentUser: jest.fn(),
    getUserProfile: jest.fn(),
    signOut: jest.fn(),
  },
}));

jest.mock('@app/user-account/user-data-service', () => ({
  getUserDataService: () => ({
    getAllScenariosProgress: jest.fn().mockResolvedValue({
      summary: { totalScore: 0, completedScenarioCount: 0 },
    }),
    deleteAllProgress: jest.fn(),
  }),
}));

import { ModalProfile } from '../../src/user-account/modal-profile';

describe('ModalProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton between tests
    (ModalProfile as unknown as { instance_: null }).instance_ = null;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ModalProfile.getInstance();
      const instance2 = ModalProfile.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should throw when using new after getInstance', () => {
      ModalProfile.getInstance();
      expect(() => new (ModalProfile as unknown as new () => ModalProfile)()).toThrow(
        'Use getInstance() instead of new.'
      );
    });
  });

  describe('getModalContentHtml', () => {
    it('should render profile name field', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('profile-name');
      expect(html).toContain('Name');
    });

    it('should render profile email field', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('profile-email');
      expect(html).toContain('Email');
    });

    it('should render stats grid', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('profile-score');
      expect(html).toContain('profile-completed');
      expect(html).toContain('Total Score');
      expect(html).toContain('Completed');
    });

    it('should render logout button', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('logout-btn');
      expect(html).toContain('Logout');
    });

    it('should render clear progress button', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('clear-progress-btn');
      expect(html).toContain('Clear Progress');
    });

    it('should render achievements section', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      expect(html).toContain('Achievements');
      expect(html).toContain('Coming Soon');
      expect(html).toContain('achievement-tile');
    });

    it('should render 15 achievement placeholders', () => {
      const modal = ModalProfile.getInstance();
      const html = (modal as unknown as { getModalContentHtml: () => string }).getModalContentHtml();

      const placeholderCount = (html.match(/achievement-tile--placeholder/g) || []).length;
      expect(placeholderCount).toBe(15);
    });
  });

  describe('default state', () => {
    it('should initialize with empty userName', () => {
      const modal = ModalProfile.getInstance();
      const userName = (modal as unknown as { userName: string }).userName;
      expect(userName).toBe('');
    });

    it('should initialize with empty userEmail', () => {
      const modal = ModalProfile.getInstance();
      const userEmail = (modal as unknown as { userEmail: string }).userEmail;
      expect(userEmail).toBe('');
    });
  });

  describe('modal configuration', () => {
    it('should have correct modal id', () => {
      expect((ModalProfile as unknown as { id: string }).id).toBe('modal-profile');
    });

    it('should have 600px width', () => {
      const modal = ModalProfile.getInstance();
      const width = (modal as unknown as { width: string }).width;
      expect(width).toBe('600px');
    });
  });

  describe('loadUserProfile', () => {
    let modal: ModalProfile;
    let mockAuth: { getCurrentUser: jest.Mock; getUserProfile: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockAuth = {
        getCurrentUser: jest.fn(),
        getUserProfile: jest.fn(),
      };

      jest.doMock('@app/user-account/auth', () => ({
        Auth: mockAuth,
      }));

      const { ModalProfile: MP } = await import('../../src/user-account/modal-profile');
      (MP as any).instance_ = null;
      modal = MP.getInstance();
      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `
        <p id="profile-email">Loading...</p>
        <p id="profile-name">Not set</p>
      `;
    });

    it('should update DOM with user email and name', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: { name: 'Test User' },
      });
      mockAuth.getUserProfile.mockResolvedValue({ full_name: 'Full Name' });

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-email').textContent).toBe('test@example.com');
      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Full Name');
    });

    it('should use user_metadata name when full_name not available', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: { name: 'Metadata Name' },
      });
      mockAuth.getUserProfile.mockResolvedValue({});

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Metadata Name');
    });

    it('should set "Not set" when no name available', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: {},
      });
      mockAuth.getUserProfile.mockResolvedValue({});

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Not set');
    });

    it('should set "Unknown" when no email available', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: null,
        user_metadata: {},
      });
      mockAuth.getUserProfile.mockResolvedValue({});

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-email').textContent).toBe('Unknown');
    });

    it('should handle null user gracefully', async () => {
      mockAuth.getCurrentUser.mockResolvedValue(null);
      mockAuth.getUserProfile.mockResolvedValue(null);

      await (modal as any).loadUserProfile();

      // Should not throw, and DOM should remain unchanged
      expect((modal as any).boxEl.querySelector('#profile-email').textContent).toBe('Loading...');
    });

    it('should handle errors gracefully', async () => {
      mockAuth.getCurrentUser.mockRejectedValue(new Error('Network error'));

      await expect((modal as any).loadUserProfile()).resolves.not.toThrow();
    });
  });

  describe('loadProgressStats', () => {
    let modal: ModalProfile;
    let mockUserDataService: { getAllScenariosProgress: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockUserDataService = {
        getAllScenariosProgress: jest.fn(),
      };

      jest.doMock('@app/user-account/user-data-service', () => ({
        getUserDataService: () => mockUserDataService,
      }));

      const { ModalProfile: MP } = await import('../../src/user-account/modal-profile');
      (MP as any).instance_ = null;
      modal = MP.getInstance();
      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `
        <span id="profile-score">--</span>
        <span id="profile-completed">--</span>
      `;
    });

    it('should update stats from user data service', async () => {
      mockUserDataService.getAllScenariosProgress.mockResolvedValue({
        summary: { totalScore: 12500, completedScenarioCount: 5 },
      });

      await (modal as any).loadProgressStats();

      expect((modal as any).boxEl.querySelector('#profile-score').textContent).toBe('12,500');
      expect((modal as any).boxEl.querySelector('#profile-completed').textContent).toBe('5 scenarios');
    });

    it('should handle zero stats', async () => {
      mockUserDataService.getAllScenariosProgress.mockResolvedValue({
        summary: { totalScore: 0, completedScenarioCount: 0 },
      });

      await (modal as any).loadProgressStats();

      expect((modal as any).boxEl.querySelector('#profile-score').textContent).toBe('0');
      expect((modal as any).boxEl.querySelector('#profile-completed').textContent).toBe('0 scenarios');
    });

    it('should silently fail on error', async () => {
      mockUserDataService.getAllScenariosProgress.mockRejectedValue(new Error('API error'));

      await expect((modal as any).loadProgressStats()).resolves.not.toThrow();
      // Stats should remain unchanged
      expect((modal as any).boxEl.querySelector('#profile-score').textContent).toBe('--');
    });
  });

  describe('handleLogout', () => {
    it('should exist as a method on the modal', () => {
      const modal = ModalProfile.getInstance();
      expect(typeof (modal as any).handleLogout).toBe('function');
    });

    it('should not throw when called', async () => {
      const modal = ModalProfile.getInstance();
      // The method should handle errors gracefully
      await expect((modal as any).handleLogout()).resolves.not.toThrow();
    });
  });

  describe('handleClearProgress', () => {
    let modal: ModalProfile;
    let mockConfirmModal: { open: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockConfirmModal = { open: jest.fn() };

      jest.doMock('@app/engine/ui/modal-confirm', () => ({
        ModalConfirm: {
          getInstance: () => mockConfirmModal,
        },
      }));

      const { ModalProfile: MP } = await import('../../src/user-account/modal-profile');
      (MP as any).instance_ = null;
      modal = MP.getInstance();
    });

    it('should open confirmation modal with correct options', () => {
      (modal as any).handleClearProgress();

      expect(mockConfirmModal.open).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          title: 'Clear All Progress?',
          confirmText: 'Clear Progress',
          cancelText: 'Cancel',
          isDestructive: true,
        })
      );
    });

    it('should include warning message about data loss', () => {
      (modal as any).handleClearProgress();

      const options = mockConfirmModal.open.mock.calls[0][1];
      expect(options.message).toContain('cannot be undone');
      expect(options.message).toContain('delete all your saved checkpoints');
    });
  });

  describe('performClearProgress', () => {
    it('should exist as a method on the modal', () => {
      const modal = ModalProfile.getInstance();
      expect(typeof (modal as any).performClearProgress).toBe('function');
    });

    it('should not throw when called (errors are caught internally)', async () => {
      const modal = ModalProfile.getInstance();
      // The method catches all errors internally and logs them
      await expect((modal as any).performClearProgress()).resolves.not.toThrow();
    });
  });

  describe('initializeButtons', () => {
    let modal: ModalProfile;
    let mockHandleLogout: jest.Mock;
    let mockHandleClearProgress: jest.Mock;

    beforeEach(() => {
      modal = ModalProfile.getInstance();
      mockHandleLogout = jest.fn();
      mockHandleClearProgress = jest.fn();
      (modal as any).handleLogout = mockHandleLogout;
      (modal as any).handleClearProgress = mockHandleClearProgress;

      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `
        <button id="logout-btn">Logout</button>
        <button id="clear-progress-btn">Clear Progress</button>
      `;
    });

    it('should attach click handler to logout button', () => {
      (modal as any).initializeButtons();

      const logoutBtn = (modal as any).boxEl.querySelector('#logout-btn');
      logoutBtn.click();

      expect(mockHandleLogout).toHaveBeenCalled();
    });

    it('should attach click handler to clear progress button', () => {
      (modal as any).initializeButtons();

      const clearBtn = (modal as any).boxEl.querySelector('#clear-progress-btn');
      clearBtn.click();

      expect(mockHandleClearProgress).toHaveBeenCalled();
    });

    it('should handle missing buttons gracefully', () => {
      (modal as any).boxEl = document.createElement('div');

      expect(() => (modal as any).initializeButtons()).not.toThrow();
    });
  });

  describe('profile name fallback chain', () => {
    let modal: ModalProfile;
    let mockAuth: { getCurrentUser: jest.Mock; getUserProfile: jest.Mock };

    beforeEach(async () => {
      jest.resetModules();
      mockAuth = {
        getCurrentUser: jest.fn(),
        getUserProfile: jest.fn(),
      };

      jest.doMock('@app/user-account/auth', () => ({
        Auth: mockAuth,
      }));

      const { ModalProfile: MP } = await import('../../src/user-account/modal-profile');
      (MP as any).instance_ = null;
      modal = MP.getInstance();
      (modal as any).boxEl = document.createElement('div');
      (modal as any).boxEl.innerHTML = `<p id="profile-name">Not set</p>`;
    });

    it('should prefer full_name from profile', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: { name: 'Metadata Name' },
      });
      mockAuth.getUserProfile.mockResolvedValue({
        full_name: 'Full Name',
        name: 'Profile Name',
      });

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Full Name');
    });

    it('should fallback to name from profile', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: { name: 'Metadata Name' },
      });
      mockAuth.getUserProfile.mockResolvedValue({
        name: 'Profile Name',
      });

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Profile Name');
    });

    it('should fallback to user_metadata name', async () => {
      mockAuth.getCurrentUser.mockResolvedValue({
        email: 'test@example.com',
        user_metadata: { name: 'Metadata Name' },
      });
      mockAuth.getUserProfile.mockResolvedValue({});

      await (modal as any).loadUserProfile();

      expect((modal as any).boxEl.querySelector('#profile-name').textContent).toBe('Metadata Name');
    });
  });
});
