import { vi } from 'vitest';
import { ModalManager } from '../../src/modal/modal-manager';

// Mock html utility
vi.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => {
      return result + str + (values[i] ?? '');
    }, '');
  },
}));

// Mock qs utility
vi.mock('../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: HTMLElement) => {
    const context = parent ?? global.document;
    return context?.querySelector(selector);
  }),
}));

describe('ModalManager', () => {
  let modalManager: ModalManager;

  beforeEach(() => {
    // Reset singleton
    (ModalManager as any).instance = null;
    document.body.innerHTML = '';
    modalManager = ModalManager.getInstance();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (ModalManager as any).instance = null;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ModalManager.getInstance();
      const instance2 = ModalManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('isShowing', () => {
    it('should return false when no modal is showing', () => {
      expect(modalManager.isShowing()).toBe(false);
    });

    it('should return true when a modal is showing', () => {
      modalManager.show('Test Title', '<p>Test content</p>');

      expect(modalManager.isShowing()).toBe(true);
    });

    it('should return true when checking for the correct title', () => {
      modalManager.show('Test Title', '<p>Test content</p>');

      expect(modalManager.isShowing('Test Title')).toBe(true);
    });

    it('should return false when checking for a different title', () => {
      modalManager.show('Test Title', '<p>Test content</p>');

      expect(modalManager.isShowing('Different Title')).toBe(false);
    });
  });

  describe('show', () => {
    it('should create modal element when showing', () => {
      modalManager.show('Test Modal', '<p>Content</p>');

      const overlay = document.querySelector('.hm-modal-overlay');
      expect(overlay).toBeTruthy();
    });

    it('should include modal structure elements', () => {
      modalManager.show('Test Modal', '<p>Content</p>');

      expect(document.querySelector('.hm-modal-box')).toBeTruthy();
      expect(document.querySelector('.hm-modal-header')).toBeTruthy();
      expect(document.querySelector('.hm-modal-body')).toBeTruthy();
      expect(document.querySelector('.hm-modal-footer')).toBeTruthy();
      expect(document.querySelector('.hm-modal-close')).toBeTruthy();
    });

    it('should display the title', () => {
      modalManager.show('My Modal Title', '<p>Content</p>');

      const header = document.querySelector('.hm-modal-header h1');
      expect(header?.textContent).toBe('My Modal Title');
    });

    it('should display HTML content directly', () => {
      modalManager.show('Test', '<p>Test paragraph</p>');

      const body = document.querySelector('.hm-modal-body');
      expect(body?.innerHTML).toContain('<p>Test paragraph</p>');
    });

    it('should render URL content as iframe', () => {
      modalManager.show('Test', 'https://example.com/page');

      const iframe = document.querySelector('.hm-modal-body iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe('https://example.com/page');
    });

    it('should set accessibility attributes', () => {
      modalManager.show('Test', '<p>Content</p>');

      const overlay = document.querySelector('.hm-modal-overlay');
      expect(overlay?.getAttribute('role')).toBe('dialog');
      expect(overlay?.getAttribute('aria-modal')).toBe('true');
      expect(overlay?.getAttribute('tabindex')).toBe('-1');
    });

    it('should prevent multiple modals', () => {
      modalManager.show('First Modal', '<p>First</p>');
      modalManager.show('Second Modal', '<p>Second</p>');

      const overlays = document.querySelectorAll('.hm-modal-overlay');
      expect(overlays.length).toBe(1);

      const header = document.querySelector('.hm-modal-header h1');
      expect(header?.textContent).toBe('First Modal');
    });

    it('should close when close button is clicked', () => {
      modalManager.show('Test', '<p>Content</p>');

      const closeBtn = document.querySelector('.hm-modal-close') as HTMLElement;
      closeBtn?.click();

      expect(modalManager.isShowing()).toBe(false);
    });

    it('should close when clicking overlay background', () => {
      modalManager.show('Test', '<p>Content</p>');

      const overlay = document.querySelector('.hm-modal-overlay') as HTMLElement;
      overlay?.click();

      expect(modalManager.isShowing()).toBe(false);
    });
  });

  describe('updateContent', () => {
    it('should update modal body content', () => {
      modalManager.show('Test', '<p>Original content</p>');

      modalManager.updateContent('<p>Updated content</p>');

      const body = document.querySelector('.hm-modal-body');
      expect(body?.innerHTML).toContain('<p>Updated content</p>');
    });

    it('should do nothing when no modal is showing', () => {
      expect(() => modalManager.updateContent('<p>Content</p>')).not.toThrow();
    });

    it('should render URL content as iframe when updating', () => {
      modalManager.show('Test', '<p>Original</p>');

      modalManager.updateContent('https://example.com/new-page');

      const iframe = document.querySelector('.hm-modal-body iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe('https://example.com/new-page');
    });
  });

  describe('hide', () => {
    it('should remove modal element from DOM', () => {
      modalManager.show('Test', '<p>Content</p>');

      expect(document.querySelector('.hm-modal-overlay')).toBeTruthy();

      modalManager.hide();

      expect(document.querySelector('.hm-modal-overlay')).toBeFalsy();
    });

    it('should do nothing when no modal is showing', () => {
      expect(() => modalManager.hide()).not.toThrow();
      expect(modalManager.isShowing()).toBe(false);
    });

    it('should clear active title', () => {
      modalManager.show('Test Title', '<p>Content</p>');

      expect(modalManager.isShowing('Test Title')).toBe(true);

      modalManager.hide();

      expect(modalManager.isShowing('Test Title')).toBe(false);
    });
  });

  describe('onHide', () => {
    it('should call registered callback when modal is hidden', () => {
      const callback = vi.fn();
      modalManager.onHide(callback);

      modalManager.show('Test', '<p>Content</p>');
      modalManager.hide();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call multiple callbacks when modal is hidden', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      modalManager.onHide(callback1);
      modalManager.onHide(callback2);

      modalManager.show('Test', '<p>Content</p>');
      modalManager.hide();

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should clear callbacks after hide', () => {
      const callback = vi.fn();
      modalManager.onHide(callback);

      modalManager.show('First', '<p>First</p>');
      modalManager.hide();

      modalManager.show('Second', '<p>Second</p>');
      modalManager.hide();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
