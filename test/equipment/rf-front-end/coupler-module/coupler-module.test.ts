import { CouplerModule, CouplerState } from '../../../../src/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '../../../../src/equipment/rf-front-end/coupler-module/tap-points';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';

describe('CouplerModule', () => {
  let rfFrontEnd: RFFrontEndCore;
  let couplerModule: CouplerModule;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    couplerModule = rfFrontEnd.couplerModule;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = CouplerModule.getDefaultState();

      expect(defaultState.isPowered).toBe(true);  // Always true for passive coupler
      expect(defaultState.isEngineeringMode).toBe(false);
      expect(defaultState.tapPointA).toBe(TapPoint.TX_IF);
      expect(defaultState.tapPointB).toBe(TapPoint.RX_IF);
      expect(defaultState.couplingFactorA).toBe(-30);
      expect(defaultState.couplingFactorB).toBe(-20);
      expect(defaultState.isEnabledA).toBe(false);
      expect(defaultState.isEnabledB).toBe(true);
      expect(defaultState.isActiveA).toBe(false);
      expect(defaultState.isActiveB).toBe(true);
    });

    it('should have default mode available tap points (TX_IF and RX_IF only)', () => {
      const defaultState = CouplerModule.getDefaultState();

      expect(defaultState.availableTapPointsA).toContain(TapPoint.TX_IF);
      expect(defaultState.availableTapPointsA).toContain(TapPoint.RX_IF);
      expect(defaultState.availableTapPointsA).toHaveLength(2);
    });

    it('should have default mode available tap points for B channel', () => {
      const defaultState = CouplerModule.getDefaultState();

      expect(defaultState.availableTapPointsB).toContain(TapPoint.TX_IF);
      expect(defaultState.availableTapPointsB).toContain(TapPoint.RX_IF);
      expect(defaultState.availableTapPointsB).toHaveLength(2);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(couplerModule).toBeDefined();
      expect(couplerModule.state.isPowered).toBe(true);
      expect(couplerModule.state.isEngineeringMode).toBe(false);
      expect(couplerModule.state.tapPointA).toBe(TapPoint.TX_IF);
      expect(couplerModule.state.tapPointB).toBe(TapPoint.RX_IF);
    });

    it('should generate HTML with LED indicators', () => {
      expect(couplerModule.html).toContain('led-a');
      expect(couplerModule.html).toContain('led-b');
      expect(couplerModule.html).toContain('SPEC-A TAPS');
    });

    it('should generate HTML with tap point selects', () => {
      expect(couplerModule.html).toContain('input-coupler-tap-a');
      expect(couplerModule.html).toContain('input-coupler-tap-b');
    });
  });

  describe('getDisplays', () => {
    it('should return display functions for tap points', () => {
      const displays = couplerModule.getDisplays();

      expect(displays.tapPointA()).toBe(TapPoint.TX_IF);
      expect(displays.tapPointB()).toBe(TapPoint.RX_IF);
    });

    it('should return formatted coupling factors', () => {
      const displays = couplerModule.getDisplays();

      expect(displays.couplingFactorA()).toBe('-30.0');
      expect(displays.couplingFactorB()).toBe('-20.0');
    });
  });

  describe('getLEDs', () => {
    it('should return LED status functions based on enabled state', () => {
      // Default: A disabled, B enabled
      const leds = couplerModule.getLEDs();

      expect(leds.activeA()).toBe('led-off');
      expect(leds.activeB()).toBe('led-green');
    });

    it('should return led-green when tap points are enabled', () => {
      couplerModule.setEnabledA(true);
      couplerModule.setEnabledB(true);

      const leds = couplerModule.getLEDs();

      expect(leds.activeA()).toBe('led-green');
      expect(leds.activeB()).toBe('led-green');
    });

    it('should return led-off when tap points are disabled', () => {
      couplerModule.setEnabledA(false);
      couplerModule.setEnabledB(false);

      const leds = couplerModule.getLEDs();

      expect(leds.activeA()).toBe('led-off');
      expect(leds.activeB()).toBe('led-off');
    });
  });

  describe('getComponents', () => {
    it('should return empty components object', () => {
      const components = couplerModule.getComponents();

      expect(components).toEqual({});
    });
  });

  describe('update', () => {
    it('should update active states based on enabled and tap points', () => {
      couplerModule.state.tapPointA = TapPoint.TX_IF;
      couplerModule.state.tapPointB = TapPoint.RX_IF;
      couplerModule.state.isEnabledA = true;
      couplerModule.state.isEnabledB = true;

      couplerModule.update();

      expect(couplerModule.state.isActiveA).toBe(true);
      expect(couplerModule.state.isActiveB).toBe(true);
    });

    it('should mark tap points as inactive when disabled', () => {
      couplerModule.state.tapPointA = TapPoint.TX_IF;
      couplerModule.state.tapPointB = TapPoint.RX_IF;
      couplerModule.state.isEnabledA = false;
      couplerModule.state.isEnabledB = false;

      couplerModule.update();

      expect(couplerModule.state.isActiveA).toBe(false);
      expect(couplerModule.state.isActiveB).toBe(false);
    });

    it('should mark TX tap points as active when enabled', () => {
      couplerModule.state.isEnabledA = true;

      couplerModule.state.tapPointA = TapPoint.TX_RF_POST_BUC;
      couplerModule.update();
      expect(couplerModule.state.isActiveA).toBe(true);

      couplerModule.state.tapPointA = TapPoint.TX_RF_POST_HPA;
      couplerModule.update();
      expect(couplerModule.state.isActiveA).toBe(true);

      couplerModule.state.tapPointA = TapPoint.TX_RF_POST_OMT;
      couplerModule.update();
      expect(couplerModule.state.isActiveA).toBe(true);
    });

    it('should mark RX tap points as active when enabled', () => {
      couplerModule.state.isEnabledB = true;

      couplerModule.state.tapPointB = TapPoint.RX_RF_PRE_OMT;
      couplerModule.update();
      expect(couplerModule.state.isActiveB).toBe(true);

      couplerModule.state.tapPointB = TapPoint.RX_RF_POST_OMT;
      couplerModule.update();
      expect(couplerModule.state.isActiveB).toBe(true);

      couplerModule.state.tapPointB = TapPoint.RX_RF_POST_LNA;
      couplerModule.update();
      expect(couplerModule.state.isActiveB).toBe(true);
    });
  });

  describe('setEngineeringMode', () => {
    it('should make all tap points available in both selectors when engineering mode is enabled', () => {
      couplerModule.setEngineeringMode(true);

      expect(couplerModule.state.isEngineeringMode).toBe(true);

      // All 8 tap points should be available in both A and B
      const allTapPoints = [
        TapPoint.TX_IF, TapPoint.RX_IF,
        TapPoint.TX_RF_POST_BUC, TapPoint.TX_RF_POST_HPA, TapPoint.TX_RF_POST_OMT,
        TapPoint.RX_RF_PRE_OMT, TapPoint.RX_RF_POST_OMT, TapPoint.RX_RF_POST_LNA
      ];

      expect(couplerModule.state.availableTapPointsA).toHaveLength(8);
      expect(couplerModule.state.availableTapPointsB).toHaveLength(8);

      for (const tapPoint of allTapPoints) {
        expect(couplerModule.state.availableTapPointsA).toContain(tapPoint);
        expect(couplerModule.state.availableTapPointsB).toContain(tapPoint);
      }
    });

    it('should reset to default tap points when engineering mode is disabled', () => {
      couplerModule.setEngineeringMode(true);
      couplerModule.setEngineeringMode(false);

      expect(couplerModule.state.isEngineeringMode).toBe(false);
      expect(couplerModule.state.availableTapPointsA).toEqual([TapPoint.TX_IF, TapPoint.RX_IF]);
      expect(couplerModule.state.availableTapPointsB).toEqual([TapPoint.TX_IF, TapPoint.RX_IF]);
    });
  });

  describe('setEnabledA', () => {
    it('should update enabled state for tap A', () => {
      couplerModule.setEnabledA(true);
      expect(couplerModule.state.isEnabledA).toBe(true);
      expect(couplerModule.state.isActiveA).toBe(true);

      couplerModule.setEnabledA(false);
      expect(couplerModule.state.isEnabledA).toBe(false);
      expect(couplerModule.state.isActiveA).toBe(false);
    });
  });

  describe('setEnabledB', () => {
    it('should update enabled state for tap B', () => {
      couplerModule.setEnabledB(true);
      expect(couplerModule.state.isEnabledB).toBe(true);
      expect(couplerModule.state.isActiveB).toBe(true);

      couplerModule.setEnabledB(false);
      expect(couplerModule.state.isEnabledB).toBe(false);
      expect(couplerModule.state.isActiveB).toBe(false);
    });
  });

  describe('getAlarms', () => {
    it('should return empty array when tap points are different', () => {
      couplerModule.state.tapPointA = TapPoint.TX_IF;
      couplerModule.state.tapPointB = TapPoint.RX_IF;

      const alarms = couplerModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should return alarm when both tap points are the same', () => {
      couplerModule.state.tapPointA = TapPoint.TX_IF;
      couplerModule.state.tapPointB = TapPoint.TX_IF;

      const alarms = couplerModule.getAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toBe('Both tap points set to same location');
    });
  });

  describe('getCouplerOutputA', () => {
    it('should return frequency and power for tap point A', () => {
      const output = couplerModule.getCouplerOutputA();

      expect(output).toHaveProperty('frequency');
      expect(output).toHaveProperty('power');
      expect(typeof output.frequency).toBe('number');
      expect(typeof output.power).toBe('number');
    });

    it('should apply coupling factor to power', () => {
      const output = couplerModule.getCouplerOutputA();

      // Power is negative of absolute coupling factor (coupling factor is already negative)
      expect(output.power).toBe(-30); // - Math.abs(-30) = -30
    });
  });

  describe('getCouplerOutputB', () => {
    it('should return frequency and power for tap point B', () => {
      const output = couplerModule.getCouplerOutputB();

      expect(output).toHaveProperty('frequency');
      expect(output).toHaveProperty('power');
    });

    it('should apply coupling factor to power', () => {
      const output = couplerModule.getCouplerOutputB();

      // Power is negative of absolute coupling factor (coupling factor is already negative)
      expect(output.power).toBe(-20); // - Math.abs(-20) = -20
    });
  });

  describe('sync', () => {
    it('should update state from external source', () => {
      const newState: Partial<CouplerState> = {
        tapPointA: TapPoint.TX_RF_POST_HPA,
        couplingFactorA: -25
      };

      couplerModule.sync(newState);

      expect(couplerModule.state.tapPointA).toBe(TapPoint.TX_RF_POST_HPA);
      expect(couplerModule.state.couplingFactorA).toBe(-25);
    });
  });

  describe('addEventListeners', () => {
    beforeEach(() => {
      // Insert the coupler module HTML into the DOM
      document.body.innerHTML = couplerModule.html;
    });

    it('should add change listener for tap point A select', () => {
      const callback = jest.fn();
      couplerModule.addEventListeners(callback);

      const selectA = document.querySelector('.input-coupler-tap-a') as HTMLSelectElement;
      expect(selectA).not.toBeNull();

      // Use RX_IF which is available in default mode (TX_IF and RX_IF)
      selectA.value = TapPoint.RX_IF;
      selectA.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalled();
      expect(couplerModule.state.tapPointA).toBe(TapPoint.RX_IF);
    });

    it('should add change listener for tap point B select', () => {
      const callback = jest.fn();
      couplerModule.addEventListeners(callback);

      const selectB = document.querySelector('.input-coupler-tap-b') as HTMLSelectElement;
      expect(selectB).not.toBeNull();

      // Use TX_IF which is available in default mode (TX_IF and RX_IF)
      selectB.value = TapPoint.TX_IF;
      selectB.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalled();
      expect(couplerModule.state.tapPointB).toBe(TapPoint.TX_IF);
    });

    it('should throw when coupler module is not in DOM', () => {
      document.body.innerHTML = '';
      const callback = jest.fn();

      // qs() throws when element not found
      expect(() => {
        couplerModule.addEventListeners(callback);
      }).toThrow('Element not found for selector: .coupler-module');
    });
  });
});
