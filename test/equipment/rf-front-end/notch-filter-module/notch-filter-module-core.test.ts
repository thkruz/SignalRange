import { vi } from 'vitest';
import { DEFAULT_NOTCH, NotchFilterModuleCore, NotchFilterState } from '../../../../src/equipment/rf-front-end/notch-filter-module/notch-filter-module-core';
import { NotchFilterModuleUIHeadless } from '../../../../src/equipment/rf-front-end/notch-filter-module/notch-filter-module-ui-headless';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import { dBm, IfSignal, MHz } from '../../../../src/types';

describe('NotchFilterModuleCore', () => {
  let rfFrontEnd: RFFrontEndCore;
  let notchFilterModule: NotchFilterModuleUIHeadless;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    notchFilterModule = rfFrontEnd.notchFilterModule as NotchFilterModuleUIHeadless;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('DEFAULT_NOTCH', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_NOTCH.centerFrequency).toBe(1500);
      expect(DEFAULT_NOTCH.bandwidth).toBe(1);
      expect(DEFAULT_NOTCH.depth).toBe(20);
      expect(DEFAULT_NOTCH.enabled).toBe(false);
    });
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = NotchFilterModuleCore.getDefaultState();

      expect(defaultState.isPowered).toBe(true);
      expect(defaultState.notches).toHaveLength(3);
    });

    it('should have three notches with different center frequencies', () => {
      const defaultState = NotchFilterModuleCore.getDefaultState();

      expect(defaultState.notches[0].centerFrequency).toBe(1200);
      expect(defaultState.notches[1].centerFrequency).toBe(1500);
      expect(defaultState.notches[2].centerFrequency).toBe(1800);
    });

    it('should have all notches disabled by default', () => {
      const defaultState = NotchFilterModuleCore.getDefaultState();

      expect(defaultState.notches[0].enabled).toBe(false);
      expect(defaultState.notches[1].enabled).toBe(false);
      expect(defaultState.notches[2].enabled).toBe(false);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(notchFilterModule).toBeDefined();
      expect(notchFilterModule.state.isPowered).toBe(true);
      expect(notchFilterModule.state.notches).toHaveLength(3);
    });

    it('should initialize with empty output signals', () => {
      expect(notchFilterModule.outputSignals).toEqual([]);
    });
  });

  describe('update', () => {
    it('should pass signals through unchanged when powered off', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      notchFilterModule.state.isPowered = false;
      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      expect(notchFilterModule.outputSignals[0].power).toBe(-60);
      expect(notchFilterModule.outputSignals[0].origin).toBe(SignalOrigin.NOTCH_FILTER);
    });

    it('should pass signals through unchanged when all notches are disabled', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      // Ensure all notches are disabled
      notchFilterModule.state.notches[0].enabled = false;
      notchFilterModule.state.notches[1].enabled = false;
      notchFilterModule.state.notches[2].enabled = false;

      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      expect(notchFilterModule.outputSignals[0].power).toBe(-60);
    });

    it('should apply full attenuation when signal is fully within notch', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6, // 1500 MHz - same as notch center
        bandwidth: 0.5e6, // 0.5 MHz - smaller than notch bandwidth
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      // Enable notch 1 (1500 MHz center, 1 MHz bandwidth, 20 dB depth)
      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1500 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 1 as MHz;
      notchFilterModule.state.notches[1].depth = 20;

      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      // Full attenuation since signal is fully within notch
      expect(notchFilterModule.outputSignals[0].power).toBe(-80); // -60 - 20 = -80
    });

    it('should apply partial attenuation when signal partially overlaps notch', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6, // 1500 MHz
        bandwidth: 2e6, // 2 MHz bandwidth
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      // Enable notch at 1500.5 MHz with 1 MHz bandwidth
      // This overlaps half of the signal
      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1500.5 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 1 as MHz;
      notchFilterModule.state.notches[1].depth = 20;

      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      // Partial attenuation based on overlap fraction
      expect(notchFilterModule.outputSignals[0].power).toBeGreaterThan(-80);
      expect(notchFilterModule.outputSignals[0].power).toBeLessThan(-60);
    });

    it('should not apply attenuation when signal does not overlap notch', () => {
      const mockSignal: IfSignal = {
        frequency: 1200e6, // 1200 MHz
        bandwidth: 1e6,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      // Enable notch at 1800 MHz - far from signal
      notchFilterModule.state.notches[2].enabled = true;
      notchFilterModule.state.notches[2].centerFrequency = 1800 as MHz;
      notchFilterModule.state.notches[2].bandwidth = 1 as MHz;
      notchFilterModule.state.notches[2].depth = 20;

      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      expect(notchFilterModule.outputSignals[0].power).toBe(-60);
    });

    it('should apply cumulative attenuation from multiple enabled notches', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 10e6, // Wide signal that overlaps multiple notches
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.IF_FILTER_BANK,
        gainInPath: 0,
      };

      vi.spyOn(notchFilterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      // Enable multiple overlapping notches
      notchFilterModule.state.notches[0].enabled = true;
      notchFilterModule.state.notches[0].centerFrequency = 1497 as MHz;
      notchFilterModule.state.notches[0].bandwidth = 2 as MHz;
      notchFilterModule.state.notches[0].depth = 10;

      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1503 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 2 as MHz;
      notchFilterModule.state.notches[1].depth = 10;

      notchFilterModule.update();

      expect(notchFilterModule.outputSignals.length).toBe(1);
      // Power should be reduced by both notches
      expect(notchFilterModule.outputSignals[0].power).toBeLessThan(-60);
    });
  });

  describe('getAlarms', () => {
    it('should return empty array when no notches overlap', () => {
      notchFilterModule.state.notches[0].enabled = true;
      notchFilterModule.state.notches[0].centerFrequency = 1200 as MHz;
      notchFilterModule.state.notches[0].bandwidth = 10 as MHz;

      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1500 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 10 as MHz;

      const alarms = notchFilterModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should return alarm when two notches overlap', () => {
      notchFilterModule.state.notches[0].enabled = true;
      notchFilterModule.state.notches[0].centerFrequency = 1200 as MHz;
      notchFilterModule.state.notches[0].bandwidth = 100 as MHz;

      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1250 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 100 as MHz;

      const alarms = notchFilterModule.getAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toBe('Notch 1 and 2 overlap');
    });

    it('should not alarm for disabled overlapping notches', () => {
      notchFilterModule.state.notches[0].enabled = false;
      notchFilterModule.state.notches[0].centerFrequency = 1200 as MHz;
      notchFilterModule.state.notches[0].bandwidth = 100 as MHz;

      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1250 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 100 as MHz;

      const alarms = notchFilterModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should detect multiple overlapping pairs', () => {
      // All three notches overlap
      notchFilterModule.state.notches[0].enabled = true;
      notchFilterModule.state.notches[0].centerFrequency = 1200 as MHz;
      notchFilterModule.state.notches[0].bandwidth = 200 as MHz;

      notchFilterModule.state.notches[1].enabled = true;
      notchFilterModule.state.notches[1].centerFrequency = 1300 as MHz;
      notchFilterModule.state.notches[1].bandwidth = 200 as MHz;

      notchFilterModule.state.notches[2].enabled = true;
      notchFilterModule.state.notches[2].centerFrequency = 1400 as MHz;
      notchFilterModule.state.notches[2].bandwidth = 200 as MHz;

      const alarms = notchFilterModule.getAlarms();

      // Should detect 0-1, 0-2, and 1-2 overlaps
      expect(alarms.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('handleNotchChange', () => {
    it('should update specific notch configuration', () => {
      notchFilterModule.handleNotchChange(0, {
        centerFrequency: 1100 as MHz,
        depth: 30
      });

      expect(notchFilterModule.state.notches[0].centerFrequency).toBe(1100);
      expect(notchFilterModule.state.notches[0].depth).toBe(30);
    });

    it('should enable a notch', () => {
      notchFilterModule.handleNotchChange(1, { enabled: true });

      expect(notchFilterModule.state.notches[1].enabled).toBe(true);
    });

    it('should ignore invalid notch index', () => {
      const originalNotches = JSON.parse(JSON.stringify(notchFilterModule.state.notches));

      notchFilterModule.handleNotchChange(-1, { enabled: true });
      notchFilterModule.handleNotchChange(3, { enabled: true });

      expect(notchFilterModule.state.notches).toEqual(originalNotches);
    });

    it('should update bandwidth', () => {
      notchFilterModule.handleNotchChange(2, { bandwidth: 5 as MHz });

      expect(notchFilterModule.state.notches[2].bandwidth).toBe(5);
    });
  });

  describe('handlePowerToggle', () => {
    it('should toggle power state', () => {
      expect(notchFilterModule.state.isPowered).toBe(true);

      notchFilterModule.handlePowerToggle();

      expect(notchFilterModule.state.isPowered).toBe(false);

      notchFilterModule.handlePowerToggle();

      expect(notchFilterModule.state.isPowered).toBe(true);
    });

    it('should set explicit power state', () => {
      notchFilterModule.handlePowerToggle(false);

      expect(notchFilterModule.state.isPowered).toBe(false);

      notchFilterModule.handlePowerToggle(true);

      expect(notchFilterModule.state.isPowered).toBe(true);
    });
  });

  describe('getNotch', () => {
    it('should return correct notch configuration', () => {
      notchFilterModule.state.notches[1].centerFrequency = 1600 as MHz;
      notchFilterModule.state.notches[1].depth = 25;

      const notch = notchFilterModule.getNotch(1);

      expect(notch.centerFrequency).toBe(1600);
      expect(notch.depth).toBe(25);
    });

    it('should return default notch for invalid index', () => {
      const notch = notchFilterModule.getNotch(5);

      expect(notch).toEqual(DEFAULT_NOTCH);
    });
  });

  describe('sync', () => {
    it('should sync state from external source', () => {
      const newState: Partial<NotchFilterState> = {
        isPowered: false
      };

      notchFilterModule.sync(newState);

      expect(notchFilterModule.state.isPowered).toBe(false);
    });
  });

  describe('inputSignals getter', () => {
    it('should get signals from IF Filter module', () => {
      const signals = notchFilterModule.inputSignals;

      expect(Array.isArray(signals)).toBe(true);
    });
  });
});
