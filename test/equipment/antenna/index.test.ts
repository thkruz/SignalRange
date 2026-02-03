import { vi } from 'vitest';
/**
 * Tests for the antenna module index exports
 * Ensures all public API is properly exported
 */
import {
  ANTENNA_CONFIG_KEYS,
  ANTENNA_CONFIGS,
  AntennaConfig,
  AntennaCore,
  AntennaState,
  AntennaUIBasic,
  AntennaUIHeadless,
  AntennaUIStandard,
  AntennaUIType,
  createAntenna,
} from '../../../src/equipment/antenna';

// Mock SimulationManager
vi.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: vi.fn(),
  },
}));

// Mock EventBus
vi.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: vi.fn(() => ({
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    })),
  },
}));

describe('antenna module exports', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('AntennaCore', () => {
    it('should export AntennaCore class', () => {
      expect(AntennaCore).toBeDefined();
    });
  });

  describe('UI implementations', () => {
    it('should export AntennaUIBasic class', () => {
      expect(AntennaUIBasic).toBeDefined();
      const antenna = new AntennaUIBasic('test-container');
      expect(antenna).toBeInstanceOf(AntennaCore);
    });

    it('should export AntennaUIHeadless class', () => {
      expect(AntennaUIHeadless).toBeDefined();
      const antenna = new AntennaUIHeadless('test-container');
      expect(antenna).toBeInstanceOf(AntennaCore);
    });

    it('should export AntennaUIStandard class', () => {
      expect(AntennaUIStandard).toBeDefined();
      const antenna = new AntennaUIStandard('test-container');
      expect(antenna).toBeInstanceOf(AntennaCore);
    });
  });

  describe('createAntenna factory', () => {
    it('should export createAntenna function', () => {
      expect(createAntenna).toBeDefined();
      expect(typeof createAntenna).toBe('function');
    });

    it('should create antenna using factory', () => {
      const antenna = createAntenna('test-container', 'headless');
      expect(antenna).toBeInstanceOf(AntennaCore);
    });
  });

  describe('configuration exports', () => {
    it('should export ANTENNA_CONFIG_KEYS enum', () => {
      expect(ANTENNA_CONFIG_KEYS).toBeDefined();
      expect(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK).toBe('C_BAND_9M_VORTEK');
    });

    it('should export ANTENNA_CONFIGS object', () => {
      expect(ANTENNA_CONFIGS).toBeDefined();
      expect(ANTENNA_CONFIGS.C_BAND_9M_VORTEK).toBeDefined();
      expect(ANTENNA_CONFIGS.C_BAND_9M_VORTEK.name).toBe('Vortek / Global Mechanics 9m C-Band');
    });
  });

  describe('type exports', () => {
    it('should allow using AntennaState type', () => {
      // This test just verifies the type is exported correctly
      // TypeScript compilation would fail if the type wasn't exported
      const state: Partial<AntennaState> = {
        isPowered: true,
      };
      expect(state.isPowered).toBe(true);
    });

    it('should allow using AntennaUIType type', () => {
      const uiType: AntennaUIType = 'standard';
      expect(uiType).toBe('standard');
    });

    it('should allow using AntennaConfig type', () => {
      const config: AntennaConfig = ANTENNA_CONFIGS.C_BAND_9M_VORTEK;
      expect(config.diameter).toBe(9.0);
    });
  });
});
