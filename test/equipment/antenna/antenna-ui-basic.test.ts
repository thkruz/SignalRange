import { Degrees } from 'ootk';
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../../src/equipment/antenna/antenna-config-keys';
import { AntennaState } from '../../../src/equipment/antenna/antenna-core';
import { AntennaUIBasic } from '../../../src/equipment/antenna/antenna-ui-basic';

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

describe('AntennaUIBasic', () => {
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
      const antenna = new AntennaUIBasic('test-parent');
      expect(antenna).toBeInstanceOf(AntennaUIBasic);
    });

    it('should create instance with custom config', () => {
      const antenna = new AntennaUIBasic(
        'test-parent',
        ANTENNA_CONFIG_KEYS.KU_BAND_3M
      );
      expect(antenna.config.band).toBe('Ku');
    });

    it('should create instance with initial state', () => {
      const initialState: Partial<AntennaState> = {
        azimuth: 45 as Degrees,
        elevation: 30 as Degrees,
      };
      const antenna = new AntennaUIBasic(
        'test-parent',
        ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
        initialState
      );
      expect(antenna.state.azimuth).toBe(45);
      expect(antenna.state.elevation).toBe(30);
    });

    it('should create instance with team and server IDs', () => {
      const antenna = new AntennaUIBasic(
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
    it('should create antenna control panel HTML', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const container = document.querySelector('.antenna-basic');
      expect(container).toBeTruthy();
    });

    it('should create equipment case header', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const header = document.querySelector('.equipment-case-header');
      expect(header).toBeTruthy();
    });

    it('should create status LED', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const led = document.querySelector('.led');
      expect(led).toBeTruthy();
    });

    it('should create bottom status bar', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });

    it('should display antenna name', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const nameEl = document.querySelector('.antenna-name');
      expect(nameEl?.textContent).toContain(antenna.config.name);
    });
  });

  describe('syncDomWithState', () => {
    it('should update LED based on power state', () => {
      const antenna = new AntennaUIBasic('test-parent');
      antenna.state.isPowered = true;
      antenna.syncDomWithState();

      const led = document.querySelector('.led');
      expect(led?.classList.contains('led-green') || led?.classList.contains('led-amber')).toBe(true);
    });

    it('should skip update if state unchanged', () => {
      const antenna = new AntennaUIBasic('test-parent');

      // First sync
      antenna.syncDomWithState();

      // Second sync with same state should be a no-op
      const spy = vi.spyOn(antenna, 'getStatusAlarms');
      antenna.syncDomWithState();

      // Should not call getStatusAlarms on second call because state didn't change
      // (lastRenderState equals current state after first sync)
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should update when state changes', () => {
      const antenna = new AntennaUIBasic('test-parent');

      // First sync
      antenna.syncDomWithState();

      // Change state
      antenna.state.isPowered = !antenna.state.isPowered;

      // Should update
      const spy = vi.spyOn(antenna, 'getStatusAlarms');
      antenna.syncDomWithState();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('draw', () => {
    it('should not throw when called (no-op in basic UI)', () => {
      const antenna = new AntennaUIBasic('test-parent');
      expect(() => antenna.draw()).not.toThrow();
    });
  });

  describe('disabled features', () => {
    let consoleSpy: SpyInstance;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should warn when trying to enable loopback', () => {
      const antenna = new AntennaUIBasic('test-parent');
      antenna.handleLoopbackToggle(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Loopback control not available in basic antenna UI'
      );
    });

    it('should warn when trying to enable auto-track', () => {
      const antenna = new AntennaUIBasic('test-parent');
      antenna.handleAutoTrackToggle(true);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Auto-track not available in basic antenna UI'
      );
    });

    it('should warn when trying to change polarization', () => {
      const antenna = new AntennaUIBasic('test-parent');
      antenna.handlePolarizationChange(45);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Polarization control not available in basic antenna UI'
      );
    });

    it('should not change loopback state', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const originalLoopback = antenna.state.isLoopback;
      antenna.handleLoopbackToggle(true);

      expect(antenna.state.isLoopback).toBe(originalLoopback);
    });

    it('should not change auto-track state', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const originalAutoTrack = antenna.state.isAutoTrackEnabled;
      antenna.handleAutoTrackToggle(true);

      expect(antenna.state.isAutoTrackEnabled).toBe(originalAutoTrack);
    });

    it('should not change polarization state', () => {
      const antenna = new AntennaUIBasic('test-parent');
      const originalPol = antenna.state.polarization;
      antenna.handlePolarizationChange(45);

      expect(antenna.state.polarization).toBe(originalPol);
    });
  });

  describe('knob components', () => {
    it('should have azimuth knob', () => {
      const antenna = new AntennaUIBasic('test-parent');
      expect(antenna.azKnob_).toBeDefined();
    });

    it('should have elevation knob', () => {
      const antenna = new AntennaUIBasic('test-parent');
      expect(antenna.elKnob_).toBeDefined();
    });
  });

  describe('status alarms', () => {
    it('should show alarms in status bar', () => {
      const antenna = new AntennaUIBasic('test-parent');
      antenna.state.isPowered = true;
      antenna.state.isOperational = true;
      antenna.syncDomWithState();

      const statusBar = document.querySelector('.bottom-status-bar');
      expect(statusBar).toBeTruthy();
    });
  });
});
