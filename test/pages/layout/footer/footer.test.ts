// Mock query-selector
vi.mock('../../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn(),
}));

// Mock global build variables
(global as any).__APP_VERSION__ = '1.0.0';
(global as any).__GIT_COMMIT_SHA__ = 'abc123';

import { Mock, vi } from 'vitest';
import { qs } from '../../../../src/engine/utils/query-selector';
import { Footer } from '../../../../src/pages/layout/footer/footer';

// Setup qs mock to use actual DOM
const mockQs = qs as Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

describe('Footer', () => {
  let rootElement: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (Footer as any).instance_ = undefined;

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
      const footer = Footer.create('app-root');
      expect(footer).toBeInstanceOf(Footer);
    });

    it('should throw error if create() called twice', () => {
      Footer.create('app-root');
      expect(() => Footer.create('app-root')).toThrow('Footer instance already exists.');
    });

    it('should return instance with getInstance()', () => {
      const footer = Footer.create('app-root');
      expect(Footer.getInstance()).toBe(footer);
    });

    it('should throw error from getInstance() before create()', () => {
      expect(() => Footer.getInstance()).toThrow('Footer instance does not exist.');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      Footer.create('app-root');
    });

    it('should render footer element with footer class', () => {
      const footer = document.querySelector('footer.footer');
      expect(footer).not.toBeNull();
    });

    it('should render footer-toolbar div', () => {
      const toolbar = document.querySelector('.footer-toolbar');
      expect(toolbar).not.toBeNull();
    });

    it('should render footer-text div with copyright', () => {
      const text = document.querySelector('.footer-text');
      expect(text).not.toBeNull();
      expect(text?.innerHTML).toContain('Kruczek Labs LLC');
    });

    it('should render footer-build-info div with version', () => {
      const buildInfo = document.querySelector('.footer-build-info');
      expect(buildInfo).not.toBeNull();
      expect(buildInfo?.textContent).toContain('v1.0.0');
      expect(buildInfo?.textContent).toContain('abc123');
    });

    it('should include license link', () => {
      const licenseLink = document.querySelector('.footer-text a');
      expect(licenseLink).not.toBeNull();
      expect(licenseLink?.textContent).toBe('LICENSE');
    });
  });

  describe('makeSmall', () => {
    let footer: Footer;

    beforeEach(() => {
      footer = Footer.create('app-root');
    });

    it('should add small class when isSmall is true', () => {
      footer.makeSmall(true);
      const footerEl = document.querySelector('.footer');
      expect(footerEl?.classList.contains('small')).toBe(true);
    });

    it('should remove small class when isSmall is false', () => {
      footer.makeSmall(true);
      footer.makeSmall(false);
      const footerEl = document.querySelector('.footer');
      expect(footerEl?.classList.contains('small')).toBe(false);
    });

    it('should toggle small class correctly', () => {
      const footerEl = document.querySelector('.footer');

      footer.makeSmall(true);
      expect(footerEl?.classList.contains('small')).toBe(true);

      footer.makeSmall(false);
      expect(footerEl?.classList.contains('small')).toBe(false);

      footer.makeSmall(true);
      expect(footerEl?.classList.contains('small')).toBe(true);
    });
  });

  describe('addEventListeners_', () => {
    it('should not throw when called (no event listeners to add)', () => {
      expect(() => Footer.create('app-root')).not.toThrow();
    });
  });
});
