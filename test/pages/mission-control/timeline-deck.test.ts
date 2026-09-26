import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Scenario clock the test TLEs were authored against: 2027-03-15 14:00:00 UTC */
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);
const OBSERVER = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers };

/** Same birds the pass-planner suite uses: known passes inside the first hour. */
const SAT_A = new OrbitalSatellite('TEST-LEO-A', 61701, [], [], {
  tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1,
  tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2,
  observer: OBSERVER,
});
const SAT_B = new OrbitalSatellite('TEST-LEO-B', 61702, [], [], {
  tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61702  98.1000  30.0000 0010000  90.0000 236.0000 14.60000000123456' as TleLine2,
  observer: OBSERVER,
});

/** Satellites the mocked SimulationManager reports; swapped per test. */
let mockSatellites: unknown[] = [SAT_A, SAT_B];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      get satellites() {
        return mockSatellites;
      },
      groundStations: [],
    })),
  },
}));

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: vi.fn(() => SCENARIO_START_MS),
  getSimulatedNow: vi.fn(() => new Date(SCENARIO_START_MS)),
}));

vi.mock('@app/engine/utils/query-selector', () => ({
  qs: vi.fn((selector: string, parent?: Element) => (parent ?? global.document).querySelector(selector)),
}));

import { TimelineDeck } from '@app/pages/mission-control/timeline-deck';

/**
 * The deck runs against the REAL PassPlannerService and the REAL ground-track
 * math, so a green test proves the whole chain (SGP4 -> pass prediction ->
 * lighting -> DOM) rather than just the markup.
 */
describe('TimelineDeck', () => {
  let deck: TimelineDeck;

  const mount = (config = {}): TimelineDeck => {
    const container = document.createElement('div');

    container.id = 'test-container';
    document.body.appendChild(container);

    return new TimelineDeck('test-container', config);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    mockSatellites = [SAT_A, SAT_B];
  });

  describe('shell', () => {
    beforeEach(() => {
      deck = mount();
    });

    it('mounts the deck footer with its stable id', () => {
      expect(document.querySelector('#timeline-deck-container')).not.toBeNull();
      expect(deck.id).toBe('timeline-deck-container');
    });

    it('renders the horizon buttons with the configured one active', () => {
      const labels = [...document.querySelectorAll('.timeline-zoom-controls button')].map((b) => b.textContent);

      expect(labels).toEqual(['2H', '6H', '24H']);
      expect(document.querySelector('.timeline-zoom-controls button.active')?.textContent).toBe('6H');
    });

    it('honours a configured horizon', () => {
      document.body.innerHTML = '';
      mount({ horizonHours: 24 });

      expect(document.querySelector('.timeline-zoom-controls button.active')?.textContent).toBe('24H');
    });

    it('starts collapsed when the scenario asks for it', () => {
      document.body.innerHTML = '';
      mount({ startCollapsed: true });

      expect(document.querySelector('#timeline-deck-container')?.classList.contains('collapsed')).toBe(true);
    });

    it('toggles collapsed state on the collapse button', () => {
      const footer = document.querySelector('#timeline-deck-container');
      const button = document.querySelector('.timeline-collapse-btn') as HTMLElement;

      expect(footer?.classList.contains('collapsed')).toBe(false);
      button.click();
      expect(footer?.classList.contains('collapsed')).toBe(true);
      expect(button.classList.contains('is-rotated')).toBe(true);
      button.click();
      expect(footer?.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('contact lanes', () => {
    beforeEach(() => {
      deck = mount({ horizonHours: 6 });
    });

    it('renders one lane per orbital satellite, labelled by name', () => {
      const labels = [...document.querySelectorAll('.timeline-track-label')].map((l) => l.textContent);

      expect(labels).toEqual(['TEST-LEO-A', 'TEST-LEO-B']);
    });

    it('draws real predicted passes as blocks inside the window', () => {
      const blocks = [...document.querySelectorAll<HTMLElement>('.timeline-block')];

      expect(blocks.length).toBeGreaterThan(0);

      for (const block of blocks) {
        const left = parseFloat(block.style.left);
        const width = parseFloat(block.style.width);

        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(100.001);
        expect(width).toBeGreaterThan(0);
      }
    });

    it('labels each block with its max elevation and an AOS/LOS tooltip', () => {
      const block = document.querySelector<HTMLElement>('.timeline-block');

      expect(block?.textContent).toMatch(/^\d+°$/);
      expect(block?.title).toMatch(/AOS \d{2}:\d{2}:\d{2}Z → LOS \d{2}:\d{2}:\d{2}Z/);
      expect(block?.title).toContain('max el');
    });

    it('classifies passes by quality', () => {
      // Both authored birds make high-elevation passes over this observer, so
      // at least one block must land in the "good" band rather than everything
      // collapsing to a single class.
      expect(document.querySelectorAll('.timeline-block').length).toBeGreaterThan(0);
      expect(document.querySelectorAll('.timeline-block.pass-good').length).toBeGreaterThan(0);
    });

    it('positions the playhead at the current scenario time', () => {
      const cursor = document.querySelector<HTMLElement>('.timeline-cursor');

      // The window is anchored at "now", so the playhead starts at the left.
      expect(cursor).not.toBeNull();
      expect(parseFloat(cursor!.style.left)).toBeCloseTo(0, 3);
    });

    it('re-predicts when the horizon changes', () => {
      const sixHourBlocks = document.querySelectorAll('.timeline-block').length;

      (document.querySelector('[data-horizon="24"]') as HTMLElement).click();

      expect(document.querySelector('.timeline-zoom-controls button.active')?.textContent).toBe('24H');
      // A 24 h window contains strictly more passes than a 6 h one.
      expect(document.querySelectorAll('.timeline-block').length).toBeGreaterThan(sixHourBlocks);
    });

    it('labels the axis in scenario time', () => {
      const ticks = [...document.querySelectorAll('.timeline-axis span')].map((s) => s.textContent);

      expect(ticks).toHaveLength(5);
      expect(ticks[0]).toBe('14:00Z');
      expect(ticks[4]).toBe('20:00Z');
    });
  });

  describe('lighting', () => {
    it('shades sunlit and eclipse spans behind the contacts by default', () => {
      mount({ horizonHours: 6 });

      expect(document.querySelectorAll('.timeline-lighting.lighting-sun').length).toBeGreaterThan(0);
      expect(document.querySelectorAll('.timeline-lighting.lighting-eclipse').length).toBeGreaterThan(0);
    });

    it('omits lighting entirely when the scenario turns it off', () => {
      mount({ horizonHours: 6, showLighting: false });

      expect(document.querySelectorAll('.timeline-lighting')).toHaveLength(0);
      // Contacts still render.
      expect(document.querySelectorAll('.timeline-block').length).toBeGreaterThan(0);
    });
  });

  describe('degenerate scenarios', () => {
    it('says so when the scenario has no orbital satellites', () => {
      mockSatellites = [{ noradId: 1, name: 'GEO-BIRD' }];
      mount();

      expect(document.querySelector('.timeline-empty')?.textContent).toContain('No orbital satellites');
      expect(document.querySelectorAll('.timeline-block')).toHaveLength(0);
    });
  });

  describe('dispose', () => {
    it('removes the deck from the DOM', () => {
      deck = mount();
      deck.dispose();

      expect(document.querySelector('#timeline-deck-container')).toBeNull();
    });
  });
});
