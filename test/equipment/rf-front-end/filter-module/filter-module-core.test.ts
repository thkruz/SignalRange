import { IfFilterBankModuleCore, IfFilterBankState, FILTER_BANDWIDTH_CONFIGS } from '../../../../src/equipment/rf-front-end/filter-module/filter-module-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { dBm, Hertz, IfSignal, MHz } from '../../../../src/types';
import { SignalOrigin } from '../../../../src/signal-origin';

describe('IfFilterBankModuleCore', () => {
  let rfFrontEnd: RFFrontEndCore;
  let filterModule: IfFilterBankModuleCore;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    filterModule = rfFrontEnd.filterModule;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('FILTER_BANDWIDTH_CONFIGS', () => {
    it('should have 17 bandwidth configurations', () => {
      expect(FILTER_BANDWIDTH_CONFIGS).toHaveLength(17);
    });

    it('should have correct first config (100 Hz)', () => {
      const config = FILTER_BANDWIDTH_CONFIGS[0];
      expect(config.bandwidth).toBe(0.0001);
      expect(config.label).toBe('100 Hz');
      expect(config.noiseFloor).toBe(-154);
      expect(config.insertionLoss).toBe(6.0);
    });

    it('should have correct last config (320 MHz)', () => {
      const config = FILTER_BANDWIDTH_CONFIGS[16];
      expect(config.bandwidth).toBe(320);
      expect(config.label).toBe('320 MHz');
      expect(config.noiseFloor).toBe(-89);
      expect(config.insertionLoss).toBe(1.5);
    });

    it('should have increasing bandwidth values', () => {
      for (let i = 1; i < FILTER_BANDWIDTH_CONFIGS.length; i++) {
        expect(FILTER_BANDWIDTH_CONFIGS[i].bandwidth)
          .toBeGreaterThan(FILTER_BANDWIDTH_CONFIGS[i - 1].bandwidth);
      }
    });

    it('should have decreasing noise floor with wider bandwidth', () => {
      // Wider bandwidth = more noise = higher (less negative) noise floor
      for (let i = 1; i < FILTER_BANDWIDTH_CONFIGS.length; i++) {
        expect(FILTER_BANDWIDTH_CONFIGS[i].noiseFloor)
          .toBeGreaterThanOrEqual(FILTER_BANDWIDTH_CONFIGS[i - 1].noiseFloor);
      }
    });
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = IfFilterBankModuleCore.getDefaultState();

      expect(defaultState.isPowered).toBe(true);
      expect(defaultState.bandwidthIndex).toBe(12);
      expect(defaultState.bandwidth).toBe(20);
      expect(defaultState.insertionLoss).toBe(2.0);
      expect(defaultState.noiseFloor).toBe(-101);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(filterModule).toBeDefined();
      expect(filterModule.state.isPowered).toBe(true);
      expect(filterModule.state.bandwidthIndex).toBe(12);
    });

    it('should initialize with empty output signals', () => {
      expect(filterModule.outputSignals).toEqual([]);
    });

    it('should calculate filter characteristics on construction', () => {
      expect(filterModule.state.bandwidth).toBe(20);
      expect(filterModule.state.insertionLoss).toBe(2.0);
      expect(filterModule.state.noiseFloor).toBe(-101);
    });
  });

  describe('update', () => {
    it('should clip signal bandwidth to filter bandwidth', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 50e6 as Hertz, // 50 MHz - wider than 20 MHz filter
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.LOW_NOISE_BLOCK,
        gainInPath: 0,
      };

      jest.spyOn(filterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      filterModule.state.bandwidth = 20 as MHz; // 20 MHz filter
      filterModule.update();

      expect(filterModule.outputSignals.length).toBe(1);
      expect(filterModule.outputSignals[0].bandwidth).toBe(20e6); // Clipped to 20 MHz
    });

    it('should not clip signal bandwidth if narrower than filter', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 5e6 as Hertz, // 5 MHz - narrower than 20 MHz filter
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.LOW_NOISE_BLOCK,
        gainInPath: 0,
      };

      jest.spyOn(filterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      filterModule.state.bandwidth = 20 as MHz;
      filterModule.update();

      expect(filterModule.outputSignals.length).toBe(1);
      expect(filterModule.outputSignals[0].bandwidth).toBe(5e6); // Unchanged
    });

    it('should apply insertion loss to signal power', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 10e6 as Hertz,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.LOW_NOISE_BLOCK,
        gainInPath: 0,
      };

      jest.spyOn(filterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      filterModule.state.insertionLoss = 2.0;
      filterModule.update();

      expect(filterModule.outputSignals.length).toBe(1);
      expect(filterModule.outputSignals[0].power).toBe(-62); // -60 - 2
    });

    it('should set correct signal origin', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 10e6 as Hertz,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.LOW_NOISE_BLOCK,
        gainInPath: 0,
      };

      jest.spyOn(filterModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      filterModule.update();

      expect(filterModule.outputSignals[0].origin).toBe(SignalOrigin.IF_FILTER_BANK);
    });

    it('should process multiple signals', () => {
      const mockSignals: IfSignal[] = [
        {
          frequency: 1500e6,
          bandwidth: 10e6 as Hertz,
          power: -60 as dBm,
          polarization: 'V',
          origin: SignalOrigin.LOW_NOISE_BLOCK,
          gainInPath: 0,
        },
        {
          frequency: 1600e6,
          bandwidth: 5e6 as Hertz,
          power: -70 as dBm,
          polarization: 'H',
          origin: SignalOrigin.LOW_NOISE_BLOCK,
          gainInPath: 0,
        }
      ];

      jest.spyOn(filterModule, 'inputSignals', 'get').mockReturnValue(mockSignals);

      filterModule.state.insertionLoss = 2.0;
      filterModule.update();

      expect(filterModule.outputSignals.length).toBe(2);
      expect(filterModule.outputSignals[0].power).toBe(-62);
      expect(filterModule.outputSignals[1].power).toBe(-72);
    });
  });

  describe('getAlarms', () => {
    it('should return empty array when insertion loss is normal', () => {
      filterModule.state.insertionLoss = 2.0;

      const alarms = filterModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should alarm when insertion loss is high', () => {
      filterModule.state.insertionLoss = 4.0;

      const alarms = filterModule.getAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toContain('insertion loss high');
      expect(alarms[0]).toContain('4.0 dB');
    });

    it('should not alarm at exactly 3.0 dB insertion loss', () => {
      filterModule.state.insertionLoss = 3.0;

      const alarms = filterModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });
  });

  describe('handleBandwidthChange', () => {
    it('should update bandwidth index and characteristics', () => {
      filterModule.handleBandwidthChange(14); // 80 MHz

      expect(filterModule.state.bandwidthIndex).toBe(14);
      expect(filterModule.state.bandwidth).toBe(80);
      expect(filterModule.state.insertionLoss).toBe(1.6);
      expect(filterModule.state.noiseFloor).toBe(-95);
    });

    it('should round bandwidth index to nearest integer', () => {
      filterModule.handleBandwidthChange(10.7);

      expect(filterModule.state.bandwidthIndex).toBe(11);
    });

    it('should update to narrowest bandwidth', () => {
      filterModule.handleBandwidthChange(0); // 100 Hz

      expect(filterModule.state.bandwidth).toBe(0.0001);
      expect(filterModule.state.insertionLoss).toBe(6.0);
    });

    it('should update to widest bandwidth', () => {
      filterModule.handleBandwidthChange(16); // 320 MHz

      expect(filterModule.state.bandwidth).toBe(320);
      expect(filterModule.state.insertionLoss).toBe(1.5);
    });
  });

  describe('getFilterConfig', () => {
    it('should return current filter configuration', () => {
      filterModule.state.bandwidthIndex = 10; // 5 MHz

      const config = filterModule.getFilterConfig();

      expect(config.bandwidth).toBe(5);
      expect(config.label).toBe('5 MHz');
      expect(config.noiseFloor).toBe(-107);
      expect(config.insertionLoss).toBe(2.4);
    });
  });

  describe('sync', () => {
    it('should sync state and update filter characteristics', () => {
      const newState: Partial<IfFilterBankState> = {
        bandwidthIndex: 8 // 1 MHz
      };

      filterModule.sync(newState);

      expect(filterModule.state.bandwidthIndex).toBe(8);
      expect(filterModule.state.bandwidth).toBe(1);
      expect(filterModule.state.insertionLoss).toBe(2.8);
    });
  });

  describe('inputSignals getter', () => {
    it('should get signals from LNB module', () => {
      const signals = filterModule.inputSignals;

      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('filter characteristics consistency', () => {
    it('should maintain consistent state after multiple bandwidth changes', () => {
      // Change bandwidth multiple times
      filterModule.handleBandwidthChange(5);
      filterModule.handleBandwidthChange(10);
      filterModule.handleBandwidthChange(15);

      const config = filterModule.getFilterConfig();

      expect(filterModule.state.bandwidth).toBe(config.bandwidth);
      expect(filterModule.state.insertionLoss).toBe(config.insertionLoss);
      expect(filterModule.state.noiseFloor).toBe(config.noiseFloor);
    });
  });
});
