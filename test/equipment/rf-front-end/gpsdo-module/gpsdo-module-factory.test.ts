import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { createGPSDO, GPSDOModuleUIType } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-factory';
import { GPSDOModuleCore } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-core';
import { GPSDOModuleUIStandard } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-module-ui-standard';
import { defaultGpsdoState, GPSDOState } from '../../../../src/equipment/rf-front-end/gpsdo-module/gpsdo-state';

// Mock SimulationManager
jest.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: jest.fn(() => ({
      isDeveloperMode: false,
    })),
  },
}));

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});

// Mock RFFrontEndCore
function createMockRfFrontEnd(): RFFrontEndCore {
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }),
    },
    state: {
      teamId: 1,
      serverId: 1,
      uuid: 'test-uuid',
    },
  } as unknown as RFFrontEndCore;
}

describe('createGPSDO factory', () => {
  let mockRfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    jest.clearAllMocks();

    document.body.innerHTML = '<div id="test-root"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('standard UI type', () => {
    it('should create GPSDOModuleUIStandard instance', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root',
        'standard'
      );

      expect(gpsdo).toBeInstanceOf(GPSDOModuleCore);
      expect(gpsdo).toBeInstanceOf(GPSDOModuleUIStandard);
    });

    it('should pass state to the module', () => {
      const customState: GPSDOState = {
        ...defaultGpsdoState,
        temperature: 65,
        satelliteCount: 5,
      };

      const gpsdo = createGPSDO(
        customState,
        mockRfFrontEnd,
        1,
        'test-root',
        'standard'
      );

      expect(gpsdo.state.temperature).toBe(65);
      expect(gpsdo.state.satelliteCount).toBe(5);
    });

    it('should pass rfFrontEnd to the module', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root',
        'standard'
      );

      // Module should be able to query RF front-end reference status
      expect(gpsdo.getReferenceStatus).toBeDefined();
    });

    it('should use provided unit number', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        3,
        'test-root',
        'standard'
      ) as GPSDOModuleUIStandard;

      // The uniqueId should include the unit number
      expect(gpsdo.html).toContain('rf-fe-gpsdo-3');
    });

    it('should inject HTML into parentId element', () => {
      createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root',
        'standard'
      );

      const parent = document.getElementById('test-root');
      expect(parent?.innerHTML).toContain('gpsdo-module');
      expect(parent?.innerHTML).toContain('GPS Disciplined Oscillator');
    });
  });

  describe('default parameters', () => {
    it('should default to unit 1', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd
      ) as GPSDOModuleUIStandard;

      expect(gpsdo.html).toContain('rf-fe-gpsdo-1');
    });

    it('should default to empty parentId', () => {
      // When parentId is empty, it should still create the module
      // but not inject into DOM
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        ''
      );

      expect(gpsdo).toBeInstanceOf(GPSDOModuleCore);
    });

    it('should default to standard UI type', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root'
      );

      expect(gpsdo).toBeInstanceOf(GPSDOModuleUIStandard);
    });
  });

  describe('basic UI type', () => {
    it('should throw error as not implemented', () => {
      expect(() => {
        createGPSDO(
          { ...defaultGpsdoState },
          mockRfFrontEnd,
          1,
          'test-root',
          'basic'
        );
      }).toThrow('GPSDOModuleUIBasic not yet implemented');
    });
  });

  describe('headless UI type', () => {
    it('should throw error as not implemented', () => {
      expect(() => {
        createGPSDO(
          { ...defaultGpsdoState },
          mockRfFrontEnd,
          1,
          'test-root',
          'headless'
        );
      }).toThrow('GPSDOModuleUIHeadless not yet implemented');
    });
  });

  describe('unknown UI type', () => {
    it('should default to standard UI type for unknown types', () => {
      const gpsdo = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root',
        'unknown' as GPSDOModuleUIType
      );

      expect(gpsdo).toBeInstanceOf(GPSDOModuleUIStandard);
    });
  });

  describe('return type', () => {
    it('should return GPSDOModuleCore base type for polymorphism', () => {
      const gpsdo: GPSDOModuleCore = createGPSDO(
        { ...defaultGpsdoState },
        mockRfFrontEnd,
        1,
        'test-root',
        'standard'
      );

      // Should be usable as base type
      expect(gpsdo.state).toBeDefined();
      expect(gpsdo.update).toBeDefined();
      expect(gpsdo.getAlarms).toBeDefined();
      expect(gpsdo.isOutputStable).toBeDefined();
      expect(gpsdo.getFrequencyAccuracy).toBeDefined();
      expect(gpsdo.get10MhzOutput).toBeDefined();
      expect(gpsdo.getReferenceStatus).toBeDefined();
      expect(gpsdo.handlePowerToggle).toBeDefined();
      expect(gpsdo.handleGnssToggle).toBeDefined();
    });
  });
});
