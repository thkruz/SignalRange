import { PanelManager } from '../../src/modal/panel-manager';

// Mock html utility
jest.mock('../../src/engine/utils/development/formatter', () => ({
  html: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((result, str, i) => {
      return result + str + (values[i] ?? '');
    }, '');
  },
}));

// Mock qs utility
jest.mock('../../src/engine/utils/query-selector', () => ({
  qs: jest.fn((selector: string, parent?: HTMLElement) => {
    const context = parent ?? global.document;
    return context?.querySelector(selector);
  }),
}));

describe('PanelManager', () => {
  let panelManager: PanelManager;

  beforeEach(() => {
    // Reset singleton
    (PanelManager as any).instance = null;
    document.body.innerHTML = '';
    panelManager = PanelManager.getInstance();
    jest.useFakeTimers();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (PanelManager as any).instance = null;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PanelManager.getInstance();
      const instance2 = PanelManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('isShowing', () => {
    it('should return false when no panel is showing', () => {
      expect(panelManager.isShowing()).toBe(false);
    });

    it('should return true when a panel is showing', () => {
      panelManager.show('Test Title', '<p>Test content</p>');

      expect(panelManager.isShowing()).toBe(true);
    });

    it('should return true when checking for the correct title', () => {
      panelManager.show('Test Title', '<p>Test content</p>');

      expect(panelManager.isShowing('Test Title')).toBe(true);
    });

    it('should return false when checking for a different title', () => {
      panelManager.show('Test Title', '<p>Test content</p>');

      expect(panelManager.isShowing('Different Title')).toBe(false);
    });
  });

  describe('show', () => {
    it('should create panel element when showing', () => {
      panelManager.show('Test Panel', '<p>Content</p>');

      const panel = document.querySelector('.hm-panel');
      expect(panel).toBeTruthy();
    });

    it('should include panel structure elements', () => {
      panelManager.show('Test Panel', '<p>Content</p>');

      expect(document.querySelector('.hm-panel-container')).toBeTruthy();
      expect(document.querySelector('.hm-panel-header')).toBeTruthy();
      expect(document.querySelector('.hm-panel-body')).toBeTruthy();
      expect(document.querySelector('.hm-panel-close')).toBeTruthy();
    });

    it('should display the title', () => {
      panelManager.show('My Panel Title', '<p>Content</p>');

      const header = document.querySelector('.hm-panel-header h2');
      expect(header?.textContent).toBe('My Panel Title');
    });

    it('should display HTML content directly', () => {
      panelManager.show('Test', '<p>Test paragraph</p>');

      const body = document.querySelector('.hm-panel-body');
      expect(body?.innerHTML).toContain('<p>Test paragraph</p>');
    });

    it('should render URL content as iframe', () => {
      panelManager.show('Test', 'https://example.com/page');

      const iframe = document.querySelector('.hm-panel-body iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe('https://example.com/page');
    });

    it('should default to right side', () => {
      panelManager.show('Test', '<p>Content</p>');

      const panel = document.querySelector('.hm-panel');
      expect(panel?.classList.contains('hm-panel-right')).toBe(true);
    });

    it('should support left side', () => {
      panelManager.show('Test', '<p>Content</p>', 'left');

      const panel = document.querySelector('.hm-panel');
      expect(panel?.classList.contains('hm-panel-left')).toBe(true);
    });

    it('should set accessibility attributes', () => {
      panelManager.show('Test Panel', '<p>Content</p>');

      const panel = document.querySelector('.hm-panel');
      expect(panel?.getAttribute('role')).toBe('complementary');
      expect(panel?.getAttribute('aria-label')).toBe('Test Panel');
    });

    it('should add visible class after animation frame', () => {
      panelManager.show('Test', '<p>Content</p>');

      // Run animation frame
      jest.runAllTimers();

      const panel = document.querySelector('.hm-panel');
      expect(panel?.classList.contains('hm-panel-visible')).toBe(true);
    });

    it('should prevent multiple panels', () => {
      panelManager.show('First Panel', '<p>First</p>');
      panelManager.show('Second Panel', '<p>Second</p>');

      const panels = document.querySelectorAll('.hm-panel');
      expect(panels.length).toBe(1);

      const header = document.querySelector('.hm-panel-header h2');
      expect(header?.textContent).toBe('First Panel');
    });

    it('should close when close button is clicked', () => {
      panelManager.show('Test', '<p>Content</p>');

      const closeBtn = document.querySelector('.hm-panel-close') as HTMLElement;
      closeBtn?.click();

      // Wait for animation
      jest.advanceTimersByTime(350);

      expect(panelManager.isShowing()).toBe(false);
    });
  });

  describe('updateContent', () => {
    it('should update panel body content', () => {
      panelManager.show('Test', '<p>Original content</p>');

      panelManager.updateContent('<p>Updated content</p>');

      const body = document.querySelector('.hm-panel-body');
      expect(body?.innerHTML).toContain('<p>Updated content</p>');
    });

    it('should do nothing when no panel is showing', () => {
      expect(() => panelManager.updateContent('<p>Content</p>')).not.toThrow();
    });

    it('should render URL content as iframe when updating', () => {
      panelManager.show('Test', '<p>Original</p>');

      panelManager.updateContent('https://example.com/new-page');

      const iframe = document.querySelector('.hm-panel-body iframe');
      expect(iframe).toBeTruthy();
      expect(iframe?.getAttribute('src')).toBe('https://example.com/new-page');
    });
  });

  describe('hide', () => {
    it('should remove visible class first', () => {
      panelManager.show('Test', '<p>Content</p>');
      jest.runAllTimers();

      const panel = document.querySelector('.hm-panel');
      expect(panel?.classList.contains('hm-panel-visible')).toBe(true);

      panelManager.hide();

      expect(panel?.classList.contains('hm-panel-visible')).toBe(false);
    });

    it('should remove panel element after animation', () => {
      panelManager.show('Test', '<p>Content</p>');

      expect(document.querySelector('.hm-panel')).toBeTruthy();

      panelManager.hide();

      // Panel still exists during animation
      expect(document.querySelector('.hm-panel')).toBeTruthy();

      // After animation delay
      jest.advanceTimersByTime(350);

      expect(document.querySelector('.hm-panel')).toBeFalsy();
    });

    it('should do nothing when no panel is showing', () => {
      expect(() => panelManager.hide()).not.toThrow();
      expect(panelManager.isShowing()).toBe(false);
    });

    it('should clear active title after animation', () => {
      panelManager.show('Test Title', '<p>Content</p>');

      expect(panelManager.isShowing('Test Title')).toBe(true);

      panelManager.hide();
      jest.advanceTimersByTime(350);

      expect(panelManager.isShowing('Test Title')).toBe(false);
    });
  });

  describe('onHide', () => {
    it('should call registered callback when panel is hidden', () => {
      const callback = jest.fn();
      panelManager.onHide(callback);

      panelManager.show('Test', '<p>Content</p>');
      panelManager.hide();

      // Wait for animation
      jest.advanceTimersByTime(350);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call multiple callbacks when panel is hidden', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      panelManager.onHide(callback1);
      panelManager.onHide(callback2);

      panelManager.show('Test', '<p>Content</p>');
      panelManager.hide();

      jest.advanceTimersByTime(350);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should clear callbacks after hide', () => {
      const callback = jest.fn();
      panelManager.onHide(callback);

      panelManager.show('First', '<p>First</p>');
      panelManager.hide();
      jest.advanceTimersByTime(350);

      panelManager.show('Second', '<p>Second</p>');
      panelManager.hide();
      jest.advanceTimersByTime(350);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
