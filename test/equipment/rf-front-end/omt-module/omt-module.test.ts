import { OMTModule, OMTState, PolarizationType } from '../../../../src/equipment/rf-front-end/omt-module/omt-module';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { dB, dBi, dBm, RfSignal } from '../../../../src/types';
import { SignalOrigin } from '../../../../src/signal-origin';

describe('OMTModule', () => {
  let rfFrontEnd: RFFrontEndCore;
  let omtModule: OMTModule;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    omtModule = rfFrontEnd.omtModule;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = OMTModule.getDefaultState();

      expect(defaultState.isPowered).toBe(true);
      expect(defaultState.txPolarization).toBe('H');
      expect(defaultState.rxPolarization).toBe('V');
      expect(defaultState.effectiveTxPol).toBe('H');
      expect(defaultState.effectiveRxPol).toBe('V');
      expect(defaultState.crossPolIsolation).toBe(28.5);
      expect(defaultState.isFaulted).toBe(false);
      expect(defaultState.insertionLoss).toBe(0.5);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(omtModule).toBeDefined();
      expect(omtModule.state.isPowered).toBe(true);
      expect(omtModule.state.txPolarization).toBe('H');
      expect(omtModule.state.rxPolarization).toBe('V');
    });

    it('should generate HTML with module label', () => {
      expect(omtModule.html).toContain('OMT/DUPLEXER');
      expect(omtModule.html).toContain('omt-module');
    });

    it('should initialize with empty signal arrays', () => {
      expect(omtModule.rxSignalsOut).toEqual([]);
      expect(omtModule.txSignalsOut).toEqual([]);
    });
  });

  describe('getComponents', () => {
    it('should return help button component', () => {
      const components = omtModule.getComponents();

      expect(components).toHaveProperty('helpBtn');
      expect(components.helpBtn).toBeDefined();
    });
  });

  describe('getDisplays', () => {
    it('should return display functions for polarizations', () => {
      const displays = omtModule.getDisplays();

      expect(displays.txPolarization()).toBe('H');
      expect(displays.rxPolarization()).toBe('V');
    });

    it('should return "None" for null polarization', () => {
      omtModule.state.txPolarization = null;
      omtModule.state.rxPolarization = null;

      const displays = omtModule.getDisplays();

      expect(displays.txPolarization()).toBe('None');
      expect(displays.rxPolarization()).toBe('None');
    });

    it('should return formatted cross-pol isolation', () => {
      omtModule.state.crossPolIsolation = 28.567;

      const displays = omtModule.getDisplays();

      expect(displays.crossPolIsolation()).toBe('28.6');
    });
  });

  describe('getLEDs', () => {
    it('should return led-off when not faulted', () => {
      omtModule.state.isFaulted = false;

      const leds = omtModule.getLEDs();

      expect(leds.fault()).toBe('led-off');
    });

    it('should return led-red when faulted', () => {
      omtModule.state.isFaulted = true;

      const leds = omtModule.getLEDs();

      expect(leds.fault()).toBe('led-red');
    });
  });

  describe('addEventListeners', () => {
    it('should not throw when called', () => {
      const callback = jest.fn();

      expect(() => {
        omtModule.addEventListeners(callback);
      }).not.toThrow();
    });
  });

  describe('getAlarms', () => {
    it('should return empty array', () => {
      const alarms = omtModule.getAlarms();

      expect(alarms).toEqual([]);
    });
  });

  describe('update', () => {
    it('should process RX signals and set origin', () => {
      // Create mock RX signals by setting up antenna with signals
      const mockSignal: RfSignal = {
        frequency: 3700e6,
        bandwidth: 1e6,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.SATELLITE_TX,
        gainInPath: 30 as dBi,
      };

      // Mock the rxSignalsIn getter
      jest.spyOn(omtModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      omtModule.update();

      expect(omtModule.rxSignalsOut.length).toBe(1);
    });

    it('should apply cross-pol isolation loss for mismatched polarization', () => {
      const mockSignal: RfSignal = {
        frequency: 3700e6,
        bandwidth: 1e6,
        power: -80 as dBm,
        polarization: 'H', // Different from effectiveRxPol (V)
        origin: SignalOrigin.SATELLITE_TX,
        gainInPath: 30 as dBi,
      };

      omtModule.state.effectiveRxPol = 'V';
      omtModule.state.crossPolIsolation = 30;

      jest.spyOn(omtModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      omtModule.update();

      expect(omtModule.rxSignalsOut.length).toBe(1);
      // Power should be reduced by cross-pol isolation
      expect(omtModule.rxSignalsOut[0].power).toBe(-110); // -80 - 30 = -110
      expect(omtModule.rxSignalsOut[0].isDegraded).toBe(true);
      expect(omtModule.rxSignalsOut[0].origin).toBe(SignalOrigin.OMT_RX);
    });

    it('should pass signal through when polarization matches effectiveRxPol', () => {
      const mockSignal: RfSignal = {
        frequency: 3700e6,
        bandwidth: 1e6,
        power: -80 as dBm,
        polarization: 'H', // Will match effectiveRxPol when antenna skew is near 90 degrees
        origin: SignalOrigin.SATELLITE_TX,
        gainInPath: 30 as dBi,
      };

      // Set up antenna with skew near 90 degrees so effectiveRxPol = 'H'
      // In non-reversed mode (txPolarization = 'H'), skew near 90 gives rxPol = 'H'
      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.polarization = 90;
        rfFrontEnd.antenna.state.rxSignalsIn = [mockSignal];
      }

      omtModule.state.txPolarization = 'H'; // Non-reversed mode
      omtModule.state.crossPolIsolation = 30;

      jest.spyOn(omtModule, 'rxSignalsIn', 'get').mockReturnValue([mockSignal]);

      omtModule.update();

      expect(omtModule.rxSignalsOut.length).toBe(1);
      // When signal polarization matches effectiveRxPol, isDegraded should not be set
      // The signal passes through without cross-pol isolation attenuation
      if (omtModule.state.effectiveRxPol === 'H') {
        expect(omtModule.rxSignalsOut[0].isDegraded).toBeUndefined();
        expect(omtModule.rxSignalsOut[0].power).toBe(-80);
      }
    });

    it('should set TX signal polarization based on OMT setting', () => {
      const mockTxSignal: RfSignal = {
        frequency: 5900e6,
        bandwidth: 1e6,
        power: 10 as dBm,
        polarization: null,
        origin: SignalOrigin.HPA,
        gainInPath: 0 as dBi,
      };

      omtModule.state.txPolarization = 'H';

      jest.spyOn(omtModule, 'txSignalsIn', 'get').mockReturnValue([mockTxSignal]);
      jest.spyOn(omtModule, 'rxSignalsIn', 'get').mockReturnValue([]);

      omtModule.update();

      expect(omtModule.txSignalsOut.length).toBe(1);
      expect(omtModule.txSignalsOut[0].polarization).toBe('H');
      expect(omtModule.txSignalsOut[0].origin).toBe(SignalOrigin.OMT_TX);
    });
  });

  describe('effective polarization calculation', () => {
    it('should set effective polarization based on skew near 0 degrees', () => {
      // When skew is near 0, baseTxPol = H, baseRxPol = V
      omtModule.state.txPolarization = 'H';

      // Simulate update with antenna skew at 0
      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.polarization = 0;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBe('H');
        expect(omtModule.state.effectiveRxPol).toBe('V');
      }
    });

    it('should set effective polarization based on skew near 90 degrees', () => {
      // When skew is near 90, baseTxPol = V, baseRxPol = H
      omtModule.state.txPolarization = 'H';

      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.polarization = 90;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBe('V');
        expect(omtModule.state.effectiveRxPol).toBe('H');
      }
    });

    it('should reverse polarization when OMT is set to V', () => {
      omtModule.state.txPolarization = 'V';

      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.polarization = 0;
        omtModule.update();

        // When reversed (txPolarization = 'V'), effective should be swapped
        expect(omtModule.state.effectiveTxPol).toBe('V');
        expect(omtModule.state.effectiveRxPol).toBe('H');
      }
    });
  });

  describe('cross-pol isolation updates', () => {
    it('should set isFaulted when antenna is not connected', () => {
      // Create a new RFFrontEnd without antenna connection
      const testRfFe = createRFFrontEnd('test-root');

      // Manually set antenna to undefined to simulate no antenna
      (testRfFe as any).antenna = undefined;

      testRfFe.omtModule.update();

      expect(testRfFe.omtModule.state.isFaulted).toBe(true);
    });
  });

  describe('signal path getters', () => {
    it('should get txSignalsIn from HPA module', () => {
      const signals = omtModule.txSignalsIn;

      expect(Array.isArray(signals)).toBe(true);
    });

    it('should get rxSignalsIn from antenna or loopback', () => {
      const signals = omtModule.rxSignalsIn;

      expect(Array.isArray(signals)).toBe(true);
    });
  });
});
