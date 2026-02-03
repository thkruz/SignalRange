// Mock query-selector to return elements from DOM
vi.mock('../../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn(),
}));

import { Mock, vi } from 'vitest';
import { qs } from '../../../../src/engine/utils/query-selector';
import { Body } from '../../../../src/pages/layout/body/body';

// Setup qs mock to use actual DOM
const mockQs = qs as Mock;
mockQs.mockImplementation((selector: string, parent?: Element) => {
  const root = parent || global.document;
  return root.querySelector(selector);
});

describe('Body', () => {
  let rootElement: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton
    (Body as any).instance_ = undefined;

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
      const body = Body.create('app-root');
      expect(body).toBeInstanceOf(Body);
    });

    it('should throw error if create() called twice', () => {
      Body.create('app-root');
      expect(() => Body.create('app-root')).toThrow('Body instance already exists.');
    });

    it('should return instance with getInstance()', () => {
      const body = Body.create('app-root');
      expect(Body.getInstance()).toBe(body);
    });

    it('should throw error from getInstance() before create()', () => {
      expect(() => Body.getInstance()).toThrow('Body instance does not exist.');
    });
  });

  describe('containerId', () => {
    it('should have static containerId property', () => {
      expect(Body.containerId).toBe('body-content-container');
    });
  });

  describe('HTML rendering', () => {
    beforeEach(() => {
      Body.create('app-root');
    });

    it('should render main element with body class', () => {
      const main = document.querySelector('main.body');
      expect(main).not.toBeNull();
    });

    it('should render body-content div with correct id', () => {
      const content = document.querySelector('#body-content-container');
      expect(content).not.toBeNull();
    });

    it('should render body-content div with body-content class', () => {
      const content = document.querySelector('.body-content');
      expect(content).not.toBeNull();
      expect(content?.id).toBe('body-content-container');
    });
  });

  describe('addEventListeners_', () => {
    it('should not throw when called (no event listeners to add)', () => {
      expect(() => Body.create('app-root')).not.toThrow();
    });
  });
});
