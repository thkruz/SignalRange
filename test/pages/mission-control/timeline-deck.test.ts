import { vi } from 'vitest';
import { TimelineDeck } from '../../../src/pages/mission-control/timeline-deck';

// Mock dependencies
vi.mock('../../../src/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => {
    const root = parent || global.document;
    return root.querySelector(selector);
  }),
}));

describe('TimelineDeck', () => {
  let containerEl: HTMLElement;
  let timelineDeck: TimelineDeck;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup container
    containerEl = document.createElement('div');
    containerEl.id = 'test-container';
    document.body.appendChild(containerEl);

    timelineDeck = new TimelineDeck('test-container');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(timelineDeck).toBeInstanceOf(TimelineDeck);
    });

    it('should set correct id', () => {
      expect(timelineDeck.id).toBe('timeline-deck-container');
    });
  });

  describe('HTML rendering', () => {
    it('should render timeline footer element', () => {
      const footer = document.querySelector('#timeline-deck-container');
      expect(footer).not.toBeNull();
    });

    it('should render timeline header', () => {
      const header = document.querySelector('.timeline-header');
      expect(header).not.toBeNull();
    });

    it('should render Mission Timeline title', () => {
      const header = document.querySelector('.timeline-header-left span');
      expect(header?.textContent).toContain('Mission Timeline');
    });

    it('should render zoom controls', () => {
      const zoomControls = document.querySelector('.timeline-zoom-controls');
      expect(zoomControls).not.toBeNull();
    });

    it('should render 2H zoom button', () => {
      const buttons = document.querySelectorAll('.timeline-zoom-controls button');
      const buttonTexts = Array.from(buttons).map(b => b.textContent);
      expect(buttonTexts).toContain('2H');
    });

    it('should render 6H zoom button as active', () => {
      const activeBtn = document.querySelector('.timeline-zoom-controls button.active');
      expect(activeBtn?.textContent).toBe('6H');
    });

    it('should render 24H zoom button', () => {
      const buttons = document.querySelectorAll('.timeline-zoom-controls button');
      const buttonTexts = Array.from(buttons).map(b => b.textContent);
      expect(buttonTexts).toContain('24H');
    });

    it('should render collapse button', () => {
      const collapseBtn = document.querySelector('.timeline-collapse-btn');
      expect(collapseBtn).not.toBeNull();
    });

    it('should render collapse icon SVG', () => {
      const collapseSvg = document.querySelector('.timeline-collapse-icon');
      expect(collapseSvg).not.toBeNull();
    });

    it('should render timeline content container', () => {
      const content = document.querySelector('.timeline-content');
      expect(content).not.toBeNull();
    });

    it('should render timeline axis', () => {
      const axis = document.querySelector('.timeline-axis');
      expect(axis).not.toBeNull();
    });
  });

  describe('Gantt placeholder', () => {
    it('should render timeline grid', () => {
      const grid = document.querySelector('.timeline-grid');
      expect(grid).not.toBeNull();
    });

    it('should render grid lines', () => {
      const gridLines = document.querySelectorAll('.timeline-grid-line');
      expect(gridLines.length).toBe(4);
    });

    it('should render timeline tracks container', () => {
      const tracks = document.querySelector('.timeline-tracks');
      expect(tracks).not.toBeNull();
    });

    it('should render GS VISIBILITY track', () => {
      const trackLabel = document.querySelector('.timeline-track-label');
      expect(trackLabel?.textContent).toContain('GS VISIBILITY');
    });

    it('should render LIGHTING track', () => {
      const trackLabels = document.querySelectorAll('.timeline-track-label');
      const labels = Array.from(trackLabels).map(l => l.textContent);
      expect(labels).toContain('LIGHTING');
    });

    it('should render SCHEDULE track', () => {
      const trackLabels = document.querySelectorAll('.timeline-track-label');
      const labels = Array.from(trackLabels).map(l => l.textContent);
      expect(labels).toContain('SCHEDULE');
    });

    it('should render timeline blocks', () => {
      const blocks = document.querySelectorAll('.timeline-block');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should render pass-active blocks', () => {
      const activeBlocks = document.querySelectorAll('.timeline-block.pass-active');
      expect(activeBlocks.length).toBeGreaterThan(0);
    });

    it('should render eclipse block', () => {
      const eclipseBlock = document.querySelector('.timeline-block.eclipse');
      expect(eclipseBlock).not.toBeNull();
      expect(eclipseBlock?.textContent).toContain('ECLIPSE');
    });

    it('should render timeline cursor/playhead', () => {
      const cursor = document.querySelector('.timeline-cursor');
      expect(cursor).not.toBeNull();
    });
  });

  describe('timeline axis', () => {
    it('should render time labels', () => {
      const axis = document.querySelector('.timeline-axis');
      expect(axis?.innerHTML).toContain('12:00');
      expect(axis?.innerHTML).toContain('14:00');
      expect(axis?.innerHTML).toContain('16:00');
      expect(axis?.innerHTML).toContain('18:00');
      expect(axis?.innerHTML).toContain('20:00');
    });
  });

  describe('collapse/expand behavior', () => {
    it('should toggle collapsed class on click', () => {
      const footer = document.querySelector('#timeline-deck-container');
      const collapseBtn = document.querySelector('.timeline-collapse-btn') as HTMLElement;

      expect(footer?.classList.contains('collapsed')).toBe(false);

      collapseBtn?.click();
      expect(footer?.classList.contains('collapsed')).toBe(true);

      collapseBtn?.click();
      expect(footer?.classList.contains('collapsed')).toBe(false);
    });

    it('should toggle is-rotated class on collapse button', () => {
      const collapseBtn = document.querySelector('.timeline-collapse-btn') as HTMLElement;

      expect(collapseBtn?.classList.contains('is-rotated')).toBe(false);

      collapseBtn?.click();
      expect(collapseBtn?.classList.contains('is-rotated')).toBe(true);

      collapseBtn?.click();
      expect(collapseBtn?.classList.contains('is-rotated')).toBe(false);
    });
  });
});
