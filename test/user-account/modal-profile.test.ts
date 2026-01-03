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
});
