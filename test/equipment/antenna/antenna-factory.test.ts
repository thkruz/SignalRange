import { Degrees } from 'ootk';
import { createAntenna, AntennaUIType } from '../../../src/equipment/antenna/antenna-factory';
import { AntennaCore, AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { AntennaUIStandard } from '../../../src/equipment/antenna/antenna-ui-standard';
import { AntennaUIBasic } from '../../../src/equipment/antenna/antenna-ui-basic';
import { AntennaUIHeadless } from '../../../src/equipment/antenna/antenna-ui-headless';
import { AntennaUIModern } from '../../../src/equipment/antenna/antenna-ui-modern';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';

// Mock SimulationManager
jest.mock('../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      update: jest.fn(),
      draw: jest.fn(),
      sync: jest.fn(),
      getSatByNoradId: jest.fn(),
      getSatsByAzEl: () => [],
      satellites: [],
      isDeveloperMode: false,
    })),
    destroy: jest.fn(),
  },
}));

// Mock EventBus
jest.mock('../../../src/events/event-bus', () => ({
  EventBus: {
    getInstance: jest.fn(() => ({
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    })),
  },
}));

describe('createAntenna', () => {
  let parentElement: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    parentElement = document.createElement('div');
    parentElement.id = 'antenna-container';
    document.body.appendChild(parentElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('basic instantiation', () => {
    it('should create antenna with default parameters', () => {
      const antenna = createAntenna('antenna-container');

      expect(antenna).toBeInstanceOf(AntennaCore);
    });

    it('should return AntennaCore type for polymorphism', () => {
      const antenna = createAntenna('antenna-container', 'standard');

      // Should be assignable to AntennaCore (base type)
      const baseAntenna: AntennaCore = antenna;
      expect(baseAntenna).toBeDefined();
    });
  });

  describe('UI type selection', () => {
    it('should create AntennaUIStandard for "standard" UI type', () => {
      const antenna = createAntenna('antenna-container', 'standard');

      expect(antenna).toBeInstanceOf(AntennaUIStandard);
    });

    it('should create AntennaUIBasic for "basic" UI type', () => {
      const antenna = createAntenna('antenna-container', 'basic');

      expect(antenna).toBeInstanceOf(AntennaUIBasic);
    });

    it('should create AntennaUIHeadless for "headless" UI type', () => {
      const antenna = createAntenna('antenna-container', 'headless');

      expect(antenna).toBeInstanceOf(AntennaUIHeadless);
    });

    it('should create AntennaUIModern for "modern" UI type', () => {
      const antenna = createAntenna('antenna-container', 'modern');

      expect(antenna).toBeInstanceOf(AntennaUIModern);
    });

    it('should default to "standard" UI type when not specified', () => {
      const antenna = createAntenna('antenna-container');

      expect(antenna).toBeInstanceOf(AntennaUIStandard);
    });
  });

  describe('config selection', () => {
    it('should use specified antenna config', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.KU_BAND_3M
      );

      expect(antenna.config.name).toBe('3m Ku-Band');
      expect(antenna.config.band).toBe('Ku');
      expect(antenna.config.diameter).toBe(3.0);
    });

    it('should use C_BAND_3M_ANTESTAR as default config', () => {
      const antenna = createAntenna('antenna-container', 'headless');

      expect(antenna.config.name).toBe('Antestar 3.0m C-Band VSAT');
    });

    it('should support all antenna config keys', () => {
      const configKeys = Object.values(ANTENNA_CONFIG_KEYS);

      for (const configKey of configKeys) {
        const antenna = createAntenna('antenna-container', 'headless', configKey);
        expect(antenna.config).toBeDefined();
        expect(antenna.config.name).toBeDefined();
      }
    });
  });

  describe('initial state', () => {
    it('should apply initial state values', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 180 as Degrees,
        elevation: 45 as Degrees,
        isPowered: false,
      };

      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );

      expect(antenna.state.azimuth).toBe(180);
      expect(antenna.state.elevation).toBe(45);
      expect(antenna.state.isPowered).toBe(false);
    });

    it('should merge initial state with defaults', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 90 as Degrees,
      };

      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );

      // Provided value should be used
      expect(antenna.state.azimuth).toBe(90);
      // Default values should be preserved
      expect(antenna.state.isPowered).toBe(true);
      expect(antenna.state.trackingMode).toBe('manual');
    });
  });

  describe('team and server IDs', () => {
    it('should set teamId correctly', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {},
        2
      );

      expect(antenna.state.teamId).toBe(2);
    });

    it('should set serverId correctly', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {},
        1,
        3
      );

      expect(antenna.state.serverId).toBe(3);
    });

    it('should default teamId to 1', () => {
      const antenna = createAntenna('antenna-container', 'headless');

      expect(antenna.state.teamId).toBe(1);
    });

    it('should default serverId to 1', () => {
      const antenna = createAntenna('antenna-container', 'headless');

      expect(antenna.state.serverId).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown UI type', () => {
      expect(() => {
        createAntenna('antenna-container', 'invalid' as AntennaUIType);
      }).toThrow('Unknown antenna UI type: invalid');
    });
  });

  describe('different bands and configurations', () => {
    it('should create C-band 9m antenna', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK
      );

      expect(antenna.config.band).toBe('C');
      expect(antenna.config.diameter).toBe(9.0);
    });

    it('should create Ku-band 9m antenna', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.KU_BAND_9M_LIMIT
      );

      expect(antenna.config.band).toBe('Ku');
      expect(antenna.config.diameter).toBe(9.0);
    });

    it('should create X-band 3m antenna', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.X_BAND_3M_ANTESTAR_RS
      );

      expect(antenna.config.band).toBe('X');
      expect(antenna.config.diameter).toBe(3.0);
    });

    it('should create Ka-band 1.8m antenna', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.KA_BAND_1M8
      );

      expect(antenna.config.band).toBe('Ka');
      expect(antenna.config.diameter).toBe(1.8);
    });
  });

  describe('frequency range validation', () => {
    it('should have valid C-band receive frequencies', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK
      );

      expect(antenna.config.minRxFrequency).toBeLessThan(antenna.config.maxRxFrequency);
      expect(antenna.config.minRxFrequency).toBeGreaterThan(3e9);
      expect(antenna.config.maxRxFrequency).toBeLessThan(5e9);
    });

    it('should have valid C-band transmit frequencies', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK
      );

      expect(antenna.config.minTxFrequency).toBeLessThan(antenna.config.maxTxFrequency);
      expect(antenna.config.minTxFrequency).toBeGreaterThan(5e9);
      expect(antenna.config.maxTxFrequency).toBeLessThan(7e9);
    });

    it('should have valid Ku-band receive frequencies', () => {
      const antenna = createAntenna(
        'antenna-container',
        'headless',
        ANTENNA_CONFIG_KEYS.KU_BAND_3M
      );

      expect(antenna.config.minRxFrequency).toBeLessThan(antenna.config.maxRxFrequency);
      expect(antenna.config.minRxFrequency).toBeGreaterThan(10e9);
      expect(antenna.config.maxRxFrequency).toBeLessThan(13e9);
    });
  });
});
