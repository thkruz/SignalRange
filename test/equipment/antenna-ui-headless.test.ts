import { Degrees } from 'ootk';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-configs';
import { AntennaState } from '../../src/equipment/antenna/antenna-core';
import { AntennaUIHeadless } from '../../src/equipment/antenna/antenna-ui-headless';

jest.mock('../../src/simulation/simulation-manager', () => {
  return {
    SimulationManager: {
      getInstance: jest.fn(() => ({
        update: jest.fn(),
        draw: jest.fn(),
        sync: jest.fn(),
        getSatByNoradId: jest.fn(),
        getSatsByAzEl: () => [],
        satellites: [],
      })),
      destroy: jest.fn(),
    }
  };
});

describe('AntennaUIHeadless', () => {
  let parentElement: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    parentElement = document.createElement('div');
    parentElement.id = 'test-parent';
    document.body.appendChild(parentElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create instance with default parameters', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
    });

    it('should create instance with custom config', () => {
      const antenna = new AntennaUIHeadless(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK
      );

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
    });

    it('should create instance with initial state', () => {
      const initialState: Partial<AntennaState> = { azimuth: 45 as Degrees, elevation: 30 as Degrees };
      const antenna = new AntennaUIHeadless(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
    });

    it('should create instance with team and server IDs', () => {
      const antenna = new AntennaUIHeadless(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {},
        2,
        3
      );

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
    });
  });

  describe('initializeDom', () => {
    it('should create hidden DOM container', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      const container = document.querySelector('.antenna-headless') as HTMLElement;

      expect(container).toBeTruthy();
      expect(container.style.display).toBe('none');
      expect(container.className).toBe('antenna-headless');
    });

    it('should append container to parent element', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      const container = parentElement.querySelector('.antenna-headless');

      expect(container).toBeTruthy();
      expect(container?.parentElement).toBe(parentElement);
    });
  });

  describe('no-op methods', () => {
    it('should not throw when calling draw', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      expect(() => antenna.draw()).not.toThrow();
    });

    it('should not throw when calling syncDomWithState', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      expect(() => (antenna as any).syncDomWithState()).not.toThrow();
    });

    it('should not throw when calling addListeners_', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      expect(() => (antenna as any).addListeners_()).not.toThrow();
    });
  });

  describe('minimal footprint', () => {
    it('should create only one hidden container element', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      const containers = parentElement.querySelectorAll('.antenna-headless');

      expect(containers.length).toBe(1);
    });

    it('should not create visible UI elements', () => {
      const antenna = new AntennaUIHeadless('test-parent');

      const visibleElements = Array.from(parentElement.querySelectorAll('*')).filter(
        el => (el as HTMLElement).style.display !== 'none'
      );

      expect(visibleElements.length).toBe(0);
    });
  });
});