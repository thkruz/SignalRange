import { Degrees } from 'ootk';
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { AntennaUIModern } from '../../../src/equipment/antenna/antenna-ui-modern';

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

describe('AntennaUIModern', () => {
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
      const antenna = new AntennaUIModern('test-parent');
      expect(antenna).toBeInstanceOf(AntennaUIModern);
    });

    it('should create instance with custom config', () => {
      const antenna = new AntennaUIModern(
        'test-parent',
        ANTENNA_CONFIG_KEYS.KU_BAND_3M
      );
      expect(antenna.config.band).toBe('Ku');
    });

    it('should create instance with initial state', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 90 as Degrees,
        elevation: 60 as Degrees,
        polarization: -30 as Degrees,
      };
      const antenna = new AntennaUIModern(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );
      expect(antenna.state.azimuth).toBe(90);
      expect(antenna.state.elevation).toBe(60);
      expect(antenna.state.polarization).toBe(-30);
    });

    it('should create instance with team and server IDs', () => {
      const antenna = new AntennaUIModern(
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
    it('should create modern antenna container', () => {
      const antenna = new AntennaUIModern('test-parent');
      const container = document.querySelector('.antenna-modern');
      expect(container).toBeTruthy();
    });

    it('should create power switch', () => {
      const antenna = new AntennaUIModern('test-parent');
      const powerSwitch = document.querySelector('#power-switch');
      expect(powerSwitch).toBeTruthy();
    });

    it('should create azimuth slider', () => {
      const antenna = new AntennaUIModern('test-parent');
      const azSlider = document.querySelector('#az-slider');
      expect(azSlider).toBeTruthy();
    });

    it('should create elevation slider', () => {
      const antenna = new AntennaUIModern('test-parent');
      const elSlider = document.querySelector('#el-slider');
      expect(elSlider).toBeTruthy();
    });

    it('should create polarization slider', () => {
      const antenna = new AntennaUIModern('test-parent');
      const polSlider = document.querySelector('#pol-slider');
      expect(polSlider).toBeTruthy();
    });

    it('should create loopback switch', () => {
      const antenna = new AntennaUIModern('test-parent');
      const loopbackSwitch = document.querySelector('#loopback-switch');
      expect(loopbackSwitch).toBeTruthy();
    });

    it('should create autotrack switch', () => {
      const antenna = new AntennaUIModern('test-parent');
      const autotrackSwitch = document.querySelector('#autotrack-switch');
      expect(autotrackSwitch).toBeTruthy();
    });

    it('should create bottom status bar', () => {
      const antenna = new AntennaUIModern('test-parent');
      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });

    it('should create RF metrics section', () => {
      const antenna = new AntennaUIModern('test-parent');
      const metricsSection = document.querySelector('.rf-metrics-section');
      expect(metricsSection).toBeTruthy();
    });

    it('should display antenna name', () => {
      const antenna = new AntennaUIModern('test-parent');
      const nameEl = document.querySelector('.antenna-title p');
      expect(nameEl?.textContent).toContain(antenna.config.name);
    });
  });

  describe('addListeners_', () => {
    it('should handle power switch change', () => {
      const antenna = new AntennaUIModern('test-parent');
      const powerSwitch = document.querySelector('#power-switch') as HTMLInputElement;

      antenna.state.isPowered = true;
      powerSwitch.checked = false;
      powerSwitch.dispatchEvent(new Event('change'));

      expect(antenna.state.isPowered).toBe(false);
    });

    it('should handle loopback switch change', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;

      const loopbackSwitch = document.querySelector('#loopback-switch') as HTMLInputElement;
      loopbackSwitch.checked = true;
      loopbackSwitch.dispatchEvent(new Event('change'));

      expect(antenna.state.isLoopback).toBe(true);
    });

    it('should handle azimuth slider input', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = true;

      const azSlider = document.querySelector('#az-slider') as HTMLInputElement;
      azSlider.value = '123.5';
      azSlider.dispatchEvent(new Event('input'));

      expect(antenna.state.azimuth).toBe(123.5);
    });

    it('should handle elevation slider input', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = true;

      const elSlider = document.querySelector('#el-slider') as HTMLInputElement;
      elSlider.value = '45.5';
      elSlider.dispatchEvent(new Event('input'));

      expect(antenna.state.elevation).toBe(45.5);
    });

    it('should handle polarization slider input', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = true;

      const polSlider = document.querySelector('#pol-slider') as HTMLInputElement;
      polSlider.value = '25';
      polSlider.dispatchEvent(new Event('input'));

      expect(antenna.state.polarization).toBe(25);
    });
  });

  describe('syncDomWithState', () => {
    it('should update power switch state', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = false;
      antenna.syncDomWithState();

      const powerSwitch = document.querySelector('#power-switch') as HTMLInputElement;
      expect(powerSwitch.checked).toBe(false);
    });

    it('should add powered-off class when not powered', () => {
      const antenna = new AntennaUIModern('test-parent', ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, {
        isPowered: true,  // Start powered
      });
      // First sync with powered state
      antenna.syncDomWithState();

      // Now power off
      antenna.state.isPowered = false;
      antenna.syncDomWithState();

      // The powered-off class is added to the parent container (domCache['parent'])
      const parent = document.getElementById('test-parent');
      expect(parent?.classList.contains('powered-off')).toBe(true);
    });

    it('should update loopback switch state', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isLoopback = true;
      antenna.syncDomWithState();

      const loopbackSwitch = document.querySelector('#loopback-switch') as HTMLInputElement;
      expect(loopbackSwitch.checked).toBe(true);
    });

    it('should update autotrack switch state', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.syncDomWithState();

      const autotrackSwitch = document.querySelector('#autotrack-switch') as HTMLInputElement;
      expect(autotrackSwitch.checked).toBe(true);
    });

    it('should update azimuth slider and value display', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.azimuth = 135 as Degrees;
      antenna.syncDomWithState();

      const azSlider = document.querySelector('#az-slider') as HTMLInputElement;
      const azValue = document.querySelector('#az-value');
      expect(azSlider.value).toBe('135');
      expect(azValue?.textContent).toBe('135.0');
    });

    it('should update elevation slider and value display', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.elevation = 67.5 as Degrees;
      antenna.syncDomWithState();

      const elSlider = document.querySelector('#el-slider') as HTMLInputElement;
      const elValue = document.querySelector('#el-value');
      expect(elSlider.value).toBe('67.5');
      expect(elValue?.textContent).toBe('67.5');
    });

    it('should update polarization slider and value display', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.polarization = -45 as Degrees;
      antenna.syncDomWithState();

      const polSlider = document.querySelector('#pol-slider') as HTMLInputElement;
      const polValue = document.querySelector('#pol-value');
      expect(polSlider.value).toBe('-45');
      expect(polValue?.textContent).toBe('-45.0');
    });

    it('should show fault class when auto-track switch up but not enabled', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isAutoTrackSwitchUp = true;
      antenna.state.isAutoTrackEnabled = false;
      antenna.state.isPowered = true;
      antenna.syncDomWithState();

      const autoTrackContainer = document.querySelector('.form-check:has(#autotrack-switch)');
      expect(autoTrackContainer?.classList.contains('fault')).toBe(true);
    });

    it('should skip update if state unchanged', () => {
      const antenna = new AntennaUIModern('test-parent');

      // First sync
      antenna.syncDomWithState();

      // Second sync with same state
      const spy = vi.spyOn(antenna, 'getStatusAlarms');
      antenna.syncDomWithState();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should update RF metrics when available', () => {
      const antenna = new AntennaUIModern('test-parent');
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

      const gainEl = document.querySelector('.rf-metric-gain');
      expect(gainEl?.textContent).toContain('38.5');

      const bwEl = document.querySelector('.rf-metric-beamwidth');
      expect(bwEl?.textContent).toContain('1.20');

      const gtEl = document.querySelector('.rf-metric-gt');
      expect(gtEl?.textContent).toContain('15.0');
    });
  });

  describe('draw', () => {
    it('should not throw when called', () => {
      const antenna = new AntennaUIModern('test-parent');
      expect(() => antenna.draw()).not.toThrow();
    });
  });

  describe('status alarms', () => {
    it('should show alarms in status bar', () => {
      const antenna = new AntennaUIModern('test-parent');
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.syncDomWithState();

      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });
  });
});
