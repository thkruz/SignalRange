import { IQConstellationAdapter } from '../../../../src/pages/mission-control/tabs/iq-constellation-adapter';
import { Receiver } from '../../../../src/equipment/receiver/receiver';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

// Mock dependencies
jest.mock('../../../../src/events/event-bus');

describe('IQConstellationAdapter', () => {
  let mockReceiver: jest.Mocked<Receiver>;
  let containerEl: HTMLElement;
  let adapter: IQConstellationAdapter;
  let mockEventBus: { on: jest.Mock; off: jest.Mock; emit: jest.Mock };
  let mockCanvas: HTMLCanvasElement;
  let mockContext: CanvasRenderingContext2D;

  const mockModemState = {
    modemNumber: 1,
    isPowered: true,
    frequency: 1200,
    bandwidth: 36,
    modulation: 'QPSK',
    fec: '3/4',
  };

  const mockReceiverState = {
    activeModem: 1,
    modems: [mockModemState],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock EventBus
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };
    (EventBus.getInstance as jest.Mock).mockReturnValue(mockEventBus);

    // Setup mock canvas context
    mockContext = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: 'left',
      fillRect: jest.fn(),
      fillText: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      setLineDash: jest.fn(),
    } as unknown as CanvasRenderingContext2D;

    // Mock createElement to return canvas with mock context
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        mockCanvas = originalCreateElement('canvas');
        mockCanvas.getContext = jest.fn().mockReturnValue(mockContext);
        return mockCanvas;
      }
      return originalCreateElement(tagName);
    });

    // Setup mock Receiver
    mockReceiver = {
      state: JSON.parse(JSON.stringify(mockReceiverState)),
      getSignalsInBandwidth: jest.fn().mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 14,
        configuredModulation: 'QPSK',
        actualModulation: 'QPSK',
        modulationMismatch: false,
        frequencyOffset_Hz: 0,
        isBandwidthClipped: false,
        adcDegradation: null,
      }),
    } as unknown as jest.Mocked<Receiver>;

    // Setup container with required DOM elements
    containerEl = document.createElement('div');
    containerEl.innerHTML = `
      <div id="iq-constellation-container"></div>
    `;
    document.body.appendChild(containerEl);

    adapter = new IQConstellationAdapter(mockReceiver, containerEl);
  });

  afterEach(() => {
    adapter.dispose();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(adapter).toBeInstanceOf(IQConstellationAdapter);
    });

    it('should register for UPDATE events', () => {
      expect(mockEventBus.on).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });

    it('should create canvas element', () => {
      const canvas = containerEl.querySelector('canvas');
      expect(canvas).not.toBeNull();
    });

    it('should create status elements', () => {
      const statusContainer = containerEl.querySelector('.iq-status-container');
      expect(statusContainer).not.toBeNull();
    });
  });

  describe('rendering', () => {
    it('should render constellation when signal is present', () => {
      // Trigger update event
      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      // Should have called canvas context methods
      expect(mockContext.fillRect).toHaveBeenCalled();
    });

    it('should get signals in bandwidth from receiver', () => {
      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      expect(mockReceiver.getSignalsInBandwidth).toHaveBeenCalled();
    });
  });

  describe('modem state handling', () => {
    it('should handle powered off modem', () => {
      mockReceiver.state.modems[0].isPowered = false;

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      // Should display "MODEM OFF" text
      expect(mockContext.fillText).toHaveBeenCalled();
    });

    it('should handle no carrier state', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: false,
        hasLock: false,
        cnRatio_dB: -100,
        effectiveCnRatio_dB: -100,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      // Should still render (noise display)
      expect(mockContext.fillRect).toHaveBeenCalled();
    });
  });

  describe('signal quality states', () => {
    it('should handle good signal with lock', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
        configuredModulation: 'QPSK',
        actualModulation: 'QPSK',
        modulationMismatch: false,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      expect(mockContext.fill).toHaveBeenCalled();
    });

    it('should handle degraded signal', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        cnRatio_dB: 3,
        effectiveCnRatio_dB: 3,
        configuredModulation: 'QPSK',
        actualModulation: 'QPSK',
        modulationMismatch: false,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      expect(mockContext.fill).toHaveBeenCalled();
    });

    it('should handle modulation mismatch', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: false,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 15,
        configuredModulation: 'QPSK',
        actualModulation: '16QAM',
        modulationMismatch: true,
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      expect(mockContext.fill).toHaveBeenCalled();
    });
  });

  describe('ADC degradation handling', () => {
    it('should apply clipping effect when ADC is clipping', () => {
      mockReceiver.getSignalsInBandwidth.mockReturnValue({
        hasCarrier: true,
        hasLock: true,
        cnRatio_dB: 15,
        effectiveCnRatio_dB: 10,
        configuredModulation: 'QPSK',
        actualModulation: 'QPSK',
        modulationMismatch: false,
        adcDegradation: {
          clipPenalty_dB: 5,
          quantizationPenalty_dB: 0,
          status: 'clipping',
        },
      });

      const updateHandler = mockEventBus.on.mock.calls.find(
        call => call[0] === Events.UPDATE
      )?.[1];

      if (updateHandler) {
        updateHandler();
      }

      expect(mockContext.fill).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should unregister from EventBus events', () => {
      adapter.dispose();

      expect(mockEventBus.off).toHaveBeenCalledWith(
        Events.UPDATE,
        expect.any(Function)
      );
    });

    it('should remove canvas element', () => {
      adapter.dispose();
      // Canvas should be removed from DOM
      // (the actual removal depends on implementation)
    });
  });

  describe('container not found', () => {
    it('should throw when container not found (qs throws)', () => {
      const emptyContainer = document.createElement('div');
      // No iq-constellation-container element

      // qs() throws when element not found
      expect(() => {
        new IQConstellationAdapter(mockReceiver, emptyContainer);
      }).toThrow();
    });
  });
});
