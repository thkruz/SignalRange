import { vi } from 'vitest';
import { HPAModuleCore, HPAState } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-core';
import { createHPA, HPAModuleUIType } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-factory';
import { HPAModuleUIStandard } from '../../../../src/equipment/rf-front-end/hpa-module/hpa-module-ui-standard';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

// Mock UI components that require DOM
vi.mock('../../../../src/components/rotary-knob/rotary-knob', () => ({
  RotaryKnob: {
    create: vi.fn(() => ({
      html: '<div class="mock-knob"></div>',
      sync: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('../../../../src/components/power-switch/power-switch', () => ({
  PowerSwitch: {
    create: vi.fn(() => ({
      html: '<div class="mock-switch"></div>',
      sync: vi.fn(),
      addEventListeners: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('../../../../src/components/secure-toggle-switch/secure-toggle-switch', () => ({
  SecureToggleSwitch: {
    create: vi.fn(() => ({
      html: '<div class="mock-toggle"></div>',
      sync: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('../../../../src/components/help-btn/help-btn', () => ({
  HelpButton: {
    create: vi.fn(() => ({
      html: '<div class="mock-help"></div>',
      dispose: vi.fn(),
    })),
  },
}));

// Mock RFFrontEndCore
function createMockRfFrontEnd(): RFFrontEndCore {
  return {
    gpsdoModule: {
      get10MhzOutput: () => ({ isPresent: true, isWarmedUp: true }),
    },
    bucModule: {
      state: {
        isPowered: true,
        isLoopback: false,
        outputPower: 10,
      },
      outputSignals: [],
    },
    state: {
      uuid: 'test-uuid-123',
      teamId: 1,
      serverId: 1,
      buc: {
        isPowered: true,
      },
    },
  } as unknown as RFFrontEndCore;
}

describe('createHPA factory', () => {
  let mockRfFrontEnd: RFFrontEndCore;
  let defaultState: HPAState;

  beforeEach(() => {
    vi.clearAllMocks();

    document.body.innerHTML = '<div id="test-container"></div>';

    // Clear event bus listeners
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.DRAW);
    EventBus.getInstance().clear(Events.SYNC);

    mockRfFrontEnd = createMockRfFrontEnd();
    defaultState = HPAModuleCore.getDefaultState();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('standard UI type', () => {
    it('should create HPAModuleUIStandard instance', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd, 1, '', 'standard');

      expect(hpa).toBeInstanceOf(HPAModuleUIStandard);
    });

    it('should create with correct state', () => {
      const customState: HPAState = {
        ...defaultState,
        backOff: 15,
        isPowered: false,
      };

      const hpa = createHPA(customState, mockRfFrontEnd, 1, '', 'standard');

      expect(hpa.state.backOff).toBe(15);
      expect(hpa.state.isPowered).toBe(false);
    });

    it('should create with specified unit number', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd, 3, '', 'standard');

      expect((hpa as any).uniqueId).toBe('rf-fe-hpa-3');
    });
  });

  describe('default UI type', () => {
    it('should create HPAModuleUIStandard when uiType not specified', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd, 1, '');

      expect(hpa).toBeInstanceOf(HPAModuleUIStandard);
    });

    it('should create HPAModuleUIStandard for unrecognized uiType', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd, 1, '', 'unknown' as HPAModuleUIType);

      expect(hpa).toBeInstanceOf(HPAModuleUIStandard);
    });
  });

  describe('unimplemented UI types', () => {
    it('should throw error for basic UI type', () => {
      expect(() => {
        createHPA(defaultState, mockRfFrontEnd, 1, '', 'basic');
      }).toThrow('HPAModuleUIBasic not yet implemented');
    });

    it('should throw error for headless UI type', () => {
      expect(() => {
        createHPA(defaultState, mockRfFrontEnd, 1, '', 'headless');
      }).toThrow('HPAModuleUIHeadless not yet implemented');
    });
  });

  describe('return type', () => {
    it('should return HPAModuleCore base type for polymorphism', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd, 1, '', 'standard');

      // Should have all HPAModuleCore methods
      expect(typeof hpa.update).toBe('function');
      expect(typeof hpa.sync).toBe('function');
      expect(typeof hpa.getAlarms).toBe('function');
      expect(typeof hpa.handleBackOffChange).toBe('function');
      expect(typeof hpa.handlePowerToggle).toBe('function');
      expect(typeof hpa.handleHpaToggle).toBe('function');
    });
  });

  describe('default parameter values', () => {
    it('should use default unit 1', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd);

      expect((hpa as any).uniqueId).toBe('rf-fe-hpa-1');
    });

    it('should use default empty parentId', () => {
      // This should not throw - empty parentId means no DOM injection
      expect(() => {
        createHPA(defaultState, mockRfFrontEnd);
      }).not.toThrow();
    });

    it('should use default standard uiType', () => {
      const hpa = createHPA(defaultState, mockRfFrontEnd);

      expect(hpa).toBeInstanceOf(HPAModuleUIStandard);
    });
  });
});
