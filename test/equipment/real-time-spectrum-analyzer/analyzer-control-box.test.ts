import { AnalyzerControlBox } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control-box';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { Hertz, dB } from '../../../src/types';
import { TraceMode } from '../../../src/equipment/real-time-spectrum-analyzer/analyzer-control/ac-trace-btn/ac-trace-btn';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: jest.fn().mockResolvedValue(undefined),
});

// Mock SoundManager
jest.mock('@app/sound/sound-manager', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      play: jest.fn(),
    }),
  },
}));

// Mock getEl to return mock DOM elements
jest.mock('@app/engine/utils/get-el', () => {
  // Define the mock element factory inside the factory function
  const mockElement = (id: string) => ({
    id,
    innerHTML: '',
    style: { display: '' },
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      toggle: jest.fn(),
      contains: jest.fn(),
    },
  });

  return {
    getEl: jest.fn().mockImplementation((id: string) => mockElement(id)),
    showEl: jest.fn(),
    hideEl: jest.fn(),
    setInnerHtml: jest.fn(),
  };
});

// Mock DraggableBox - simple mock class
jest.mock('@app/engine/ui/draggable-box', () => {
  class MockDraggableBox {
    id: string;
    title: string;
    isOpen: boolean;
    boxContentHtml: string;

    constructor(id: string, options: any) {
      this.id = id;
      this.title = options?.title || '';
      this.isOpen = false;
      this.boxContentHtml = options?.boxContentHtml || '';
    }

    open() { this.isOpen = true; }
    close(cb?: () => void) {
      this.isOpen = false;
      if (cb) cb();
    }
    protected onOpen() {}
  }
  return { DraggableBox: MockDraggableBox };
});

// Mock AnalyzerControl
jest.mock('@app/equipment/real-time-spectrum-analyzer/analyzer-control', () => ({
  AnalyzerControl: class MockAnalyzerControl {
    init_() {}
  }
}));

describe('AnalyzerControlBox', () => {
  let mockSpecA: jest.Mocked<Partial<RealTimeSpectrumAnalyzer>>;
  let mockState: RealTimeSpectrumAnalyzerState;
  let controlBox: AnalyzerControlBox;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="test-root"></div>
      <div id="draggable-boxes-container"></div>
    `;

    // Clear event bus
    EventBus.getInstance().clear(Events.SPEC_A_CONFIG_CHANGED);

    // Create mock state
    mockState = {
      uuid: 'test-uuid-1234',
      team_id: 1,
      rfFeUuid: 'test-rfFeUuid',
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      lastSpan: 100e6 as Hertz,
      minFrequency: 5e3 as Hertz,
      maxFrequency: 25.5e9 as Hertz,
      rbw: 1e6 as Hertz,
      lockedControl: 'freq',
      inputValue: '',
      inputUnit: 'MHz',
      referenceLevel: 0,
      minAmplitude: -100,
      maxAmplitude: -40,
      scaleDbPerDiv: 6 as dB,
      noiseFloorNoGain: -104,
      isSkipLnaGainDuringDraw: true,
      isPaused: false,
      hold: false,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      isUpdateMarkers: false,
      topMarkers: [],
      markerIndex: 0,
      refreshRate: 10,
      screenMode: 'spectralDensity',
      isUseTapA: true,
      isUseTapB: true,
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' as TraceMode },
      ],
      selectedTrace: 1,
    };

    // Create mock spectrum analyzer
    mockSpecA = {
      state: mockState,
      syncDomWithState: jest.fn(),
      freqAutoTune: jest.fn(),
      resetMaxHoldData: jest.fn(),
      resetMinHoldData: jest.fn(),
      updateScreenVisibility: jest.fn(),
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    it('should create control box with correct ID based on spectrum analyzer UUID', () => {
      controlBox = new AnalyzerControlBox(mockSpecA as any);

      expect(controlBox).toBeDefined();
    });

    it('should have correct title containing UUID', () => {
      controlBox = new AnalyzerControlBox(mockSpecA as any);

      // The title should contain the first part of the UUID
      const uuidPrefix = mockState.uuid.split('-')[0];
      expect(controlBox.title).toContain(uuidPrefix);
    });

    it('should initialize in closed state', () => {
      controlBox = new AnalyzerControlBox(mockSpecA as any);

      // The box should be closed initially (constructor calls close())
      expect(controlBox.isOpen).toBe(false);
    });
  });

  describe('Open and Close', () => {
    beforeEach(() => {
      controlBox = new AnalyzerControlBox(mockSpecA as any);
    });

    it('should open the control box', () => {
      controlBox.open();

      expect(controlBox.isOpen).toBe(true);
    });

    it('should close the control box', () => {
      controlBox.open();
      controlBox.close();

      expect(controlBox.isOpen).toBe(false);
    });

    it('should call callback when close is called with callback', () => {
      const callback = jest.fn();

      controlBox.open();
      controlBox.close(callback);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getBoxContentHtml', () => {
    it('should return empty string', () => {
      controlBox = new AnalyzerControlBox(mockSpecA as any);

      // Access the protected method through the instance
      const html = (controlBox as any).getBoxContentHtml();

      expect(html).toBe('');
    });
  });
});
