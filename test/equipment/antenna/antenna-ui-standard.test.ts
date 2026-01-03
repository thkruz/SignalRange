import { Degrees } from 'ootk';
import { AntennaUIStandard } from '../../../src/equipment/antenna/antenna-ui-standard';
import { AntennaState } from '../../../src/equipment/antenna/antenna-core';
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

describe('AntennaUIStandard', () => {
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
      const antenna = new AntennaUIStandard('test-parent');
      expect(antenna).toBeInstanceOf(AntennaUIStandard);
    });

    it('should create instance with custom config', () => {
      const antenna = new AntennaUIStandard(
        'test-parent',
        ANTENNA_CONFIG_KEYS.KU_BAND_3M
      );
      expect(antenna.config.band).toBe('Ku');
    });

    it('should create instance with initial state', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 180 as Degrees,
        elevation: 45 as Degrees,
        polarization: 15 as Degrees,
      };
      const antenna = new AntennaUIStandard(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );
      expect(antenna.state.azimuth).toBe(180);
      expect(antenna.state.elevation).toBe(45);
      expect(antenna.state.polarization).toBe(15);
    });

    it('should create instance with team and server IDs', () => {
      const antenna = new AntennaUIStandard(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        {},
        2,
        3
      );
      expect(antenna.state.teamId).toBe(2);
      expect(antenna.state.serverId).toBe(3);
    });
  });

  describe('initializeDom', () => {
    it('should create antenna container', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const container = document.querySelector('.antenna-container');
      expect(container).toBeTruthy();
    });

    it('should create equipment case header', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const header = document.querySelector('.equipment-case-header');
      expect(header).toBeTruthy();
    });

    it('should create status LED', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const led = document.querySelector('.led');
      expect(led).toBeTruthy();
    });

    it('should create loopback indicator light', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const light = document.querySelector('#ant-loopback-light');
      expect(light).toBeTruthy();
    });

    it('should create auto-track indicator light', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const light = document.querySelector('#ant-auto-track-light');
      expect(light).toBeTruthy();
    });

    it('should create bottom status bar', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });

    it('should create RF metrics section', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const metricsSection = document.querySelector('.antenna-rf-metrics');
      expect(metricsSection).toBeTruthy();
    });

    it('should display antenna name', () => {
      const antenna = new AntennaUIStandard('test-parent');
      const nameEl = document.querySelector('.antenna-name');
      expect(nameEl?.textContent).toContain(antenna.config.name);
    });
  });

  describe('syncDomWithState', () => {
    it('should update loopback indicator based on state', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.isLoopback = true;
      antenna.state.isPowered = true;
      antenna.syncDomWithState();

      const light = document.querySelector('#ant-loopback-light');
      expect(light?.classList.contains('on')).toBe(true);
    });

    it('should update auto-track indicator based on state', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isPowered = true;
      antenna.syncDomWithState();

      const light = document.querySelector('#ant-auto-track-light');
      expect(light?.classList.contains('on')).toBe(true);
    });

    it('should show fault class when auto-track switch up but not enabled', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isAutoTrackEnabled = false;
      antenna.state.isPowered = true;
      antenna.syncDomWithState();

      const autoTrackIndicator = document.querySelector('.status-indicator.auto-track');
      expect(autoTrackIndicator?.classList.contains('fault')).toBe(true);
    });

    it('should skip update if state unchanged', () => {
      const antenna = new AntennaUIStandard('test-parent');

      // First sync
      antenna.syncDomWithState();

      // Second sync with same state
      const spy = jest.spyOn(antenna, 'getStatusAlarms');
      antenna.syncDomWithState();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should update RF metrics when available', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.rfMetrics = {
        frequency_GHz: 4.0,
        gain_dBi: 38.5,
        beamwidth_deg: 1.2,
        gOverT_dBK: 15.0,
        polLoss_dB: 0.1,
        atmosLoss_dB: 0.2,
        skyTemp_K: 290,
      };
      antenna.syncDomWithState();

      const freqEl = document.querySelector('.rf-metric-freq');
      expect(freqEl?.textContent).toContain('4.000');
    });

    it('should update RF metrics with EIRP when transmitting', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.rfMetrics = {
        frequency_GHz: 6.0,
        gain_dBi: 40.0,
        beamwidth_deg: 0.8,
        gOverT_dBK: 16.0,
        polLoss_dB: 0.2,
        atmosLoss_dB: 0.3,
        skyTemp_K: 290,
        eirp_dBW: 55.0,
      };
      antenna.syncDomWithState();

      const eirpEl = document.querySelector('.rf-metric-eirp') as HTMLElement;
      expect(eirpEl?.textContent).toContain('55.0');
      expect(eirpEl?.style.display).not.toBe('none');
    });

    it('should hide EIRP when not transmitting', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.rfMetrics = {
        frequency_GHz: 4.0,
        gain_dBi: 38.5,
        beamwidth_deg: 1.2,
        gOverT_dBK: 15.0,
        polLoss_dB: 0.1,
        atmosLoss_dB: 0.2,
        skyTemp_K: 290,
        eirp_dBW: undefined,
      };
      antenna.syncDomWithState();

      const eirpEl = document.querySelector('.rf-metric-eirp') as HTMLElement;
      expect(eirpEl?.style.display).toBe('none');
    });
  });

  describe('draw', () => {
    it('should not throw when called', () => {
      const antenna = new AntennaUIStandard('test-parent');
      expect(() => antenna.draw()).not.toThrow();
    });
  });

  describe('knob components', () => {
    it('should have azimuth knob', () => {
      const antenna = new AntennaUIStandard('test-parent');
      expect(antenna.azKnob_).toBeDefined();
    });

    it('should have elevation knob', () => {
      const antenna = new AntennaUIStandard('test-parent');
      expect(antenna.elKnob_).toBeDefined();
    });
  });

  describe('status alarms', () => {
    it('should show alarms in status bar', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.syncDomWithState();

      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });

    it('should update LED based on alarm severity', () => {
      const antenna = new AntennaUIStandard('test-parent');
      antenna.state.isPowered = false;
      antenna.syncDomWithState();

      const led = document.querySelector('.led');
      expect(led).toBeTruthy();
    });
  });
});
