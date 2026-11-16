import { vi } from 'vitest';
import { AGCModuleCore, AGCState } from '../../../../src/equipment/rf-front-end/agc-module/agc-module-core';
import { AGCModuleUIHeadless } from '../../../../src/equipment/rf-front-end/agc-module/agc-module-ui-headless';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import { FIXED_STEP_MS, SimClock } from '../../../../src/simulation/sim-clock';
import { dB, dBm, IfSignal } from '../../../../src/types';

describe('AGCModuleCore', () => {
  let rfFrontEnd: RFFrontEndCore;
  let agcModule: AGCModuleUIHeadless;

  beforeEach(() => {
    document.body.innerHTML = '<div id="test-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);

    rfFrontEnd = createRFFrontEnd('test-root');
    agcModule = rfFrontEnd.agcModule as AGCModuleUIHeadless;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('getDefaultState', () => {
    it('should return correct default state', () => {
      const defaultState = AGCModuleCore.getDefaultState();

      expect(defaultState.isPowered).toBe(true);
      expect(defaultState.isBypassed).toBe(false);
      expect(defaultState.targetLevel).toBe(-30);
      expect(defaultState.currentGain).toBe(0);
      expect(defaultState.inputPower).toBe(-100);
      expect(defaultState.outputPower).toBe(-100);
      expect(defaultState.attackTime).toBe(10);
      expect(defaultState.releaseTime).toBe(100);
      expect(defaultState.maxGain).toBe(30);
      expect(defaultState.minGain).toBe(-30);
    });
  });

  describe('initialization', () => {
    it('should create module with correct initial state', () => {
      expect(agcModule).toBeDefined();
      expect(agcModule.state.isPowered).toBe(true);
      expect(agcModule.state.isBypassed).toBe(false);
    });

    it('should initialize with empty output signals', () => {
      expect(agcModule.outputSignals).toEqual([]);
    });
  });

  describe('update - bypass mode', () => {
    it('should pass signals through unchanged in bypass mode', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = true;
      agcModule.update();

      expect(agcModule.state.currentGain).toBe(0);
      expect(agcModule.outputSignals.length).toBe(1);
      expect(agcModule.outputSignals[0].power).toBe(-60);
      expect(agcModule.outputSignals[0].origin).toBe(SignalOrigin.AGC);
    });

    it('should calculate input power correctly in bypass mode', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -50 as dBm,
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);
      // LNB off: no receive noise in the passband, only the injected carrier
      rfFrontEnd.lnbModule.state.isPowered = false;

      agcModule.state.isBypassed = true;
      agcModule.update();

      expect(agcModule.state.inputPower).toBe(-50);
      expect(agcModule.state.outputPower).toBe(-50);
    });
  });

  describe('update - active mode', () => {
    it('should calculate total input power from multiple signals', () => {
      const mockSignals: IfSignal[] = [
        {
          frequency: 1500e6,
          bandwidth: 1e6,
          power: -60 as dBm, // 0.001 mW
          polarization: 'V',
          origin: SignalOrigin.NOTCH_FILTER,
          gainInPath: 0,
        },
        {
          frequency: 1600e6,
          bandwidth: 1e6,
          power: -60 as dBm, // 0.001 mW
          polarization: 'V',
          origin: SignalOrigin.NOTCH_FILTER,
          gainInPath: 0,
        },
      ];

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue(mockSignals);

      agcModule.state.isBypassed = false;
      agcModule.update();

      // Two -60 dBm signals = -57 dBm combined (10*log10(2*0.001))
      expect(agcModule.state.inputPower).toBeCloseTo(-57, 0);
    });

    it('should set input power to -120 when no signals and no noise (LNB off)', () => {
      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([]);
      rfFrontEnd.lnbModule.state.isPowered = false;

      agcModule.update();

      expect(agcModule.state.inputPower).toBe(-120);
    });

    it('should floor the input reading at -120 dBm for vanishingly weak signals', () => {
      const buried: IfSignal = {
        frequency: 1200e6,
        bandwidth: 1e6,
        power: -395 as dBm,
        origin: SignalOrigin.NOTCH_FILTER,
      } as unknown as IfSignal;
      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([buried]);
      rfFrontEnd.lnbModule.state.isPowered = false;

      agcModule.update();

      expect(agcModule.state.inputPower).toBe(AGCModuleCore.DETECTOR_FLOOR_DBM);
      expect(agcModule.state.outputPower).toBeGreaterThanOrEqual(AGCModuleCore.DETECTOR_FLOOR_DBM);
    });

    it('measures the receive noise in the IF passband with the LNB on (phase 19.2)', () => {
      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([]);
      const spm = rfFrontEnd.couplerModule.signalPathManager;

      agcModule.update();

      // k·T·B over the IF filter with the gain ahead of the AGC
      expect(agcModule.state.inputPower).toBeCloseTo(spm.getExternalNoise() - spm.agcGain, 1);
      expect(agcModule.state.inputPower).toBeGreaterThan(AGCModuleCore.DETECTOR_FLOOR_DBM);
      expect(agcModule.isNoiseOnly).toBe(true);
      // Held for NOISE_ONLY_HOLD_MS before it alarms (Phase 31 D2)
      SimClock.advanceRun(AGCModuleCore.NOISE_ONLY_HOLD_MS);
      agcModule.update();
      expect(agcModule.getAlarms()).toContain('AGC on noise only - passband power is noise, no traffic carrier');
    });

    describe('noise-only hold (Phase 31 D2, nats-r6-s01-F1)', () => {
      const NOISE_ONLY = 'AGC on noise only - passband power is noise, no traffic carrier';
      const carrierAboveNoise = (): IfSignal => {
        const spm = rfFrontEnd.couplerModule.signalPathManager;
        const noiseIn = spm.getExternalNoise() - spm.agcGain;
        return { frequency: 1500e6, bandwidth: 1e6, power: (noiseIn + 3) as dBm, origin: SignalOrigin.NOTCH_FILTER } as unknown as IfSignal;
      };
      const step = (ms: number) => {
        for (let t = 0; t < ms; t += FIXED_STEP_MS) {
          SimClock.step();
          agcModule.update();
        }
      };

      it('never alarms on a one-frame noise-only blip', () => {
        const inputs = vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([carrierAboveNoise()]);
        step(500);
        inputs.mockReturnValue([]);
        SimClock.step();
        agcModule.update();
        expect(agcModule.isNoiseOnly).toBe(true);
        expect(agcModule.getAlarms()).not.toContain(NOISE_ONLY);
        inputs.mockReturnValue([carrierAboveNoise()]);
        step(2000);
        expect(agcModule.getAlarms()).not.toContain(NOISE_ONLY);
      });

      it('raises after 1.2 s of noise only, not before 1 s, and clears at once', () => {
        const inputs = vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([]);
        step(900);
        expect(agcModule.getAlarms()).not.toContain(NOISE_ONLY);
        // Inside the hold the empty sky raises no max-gain rail either
        expect(agcModule.getAlarms().some((a) => a.includes('max gain'))).toBe(false);
        step(300);
        expect(agcModule.getAlarms()).toContain(NOISE_ONLY);

        inputs.mockReturnValue([carrierAboveNoise()]);
        SimClock.step();
        agcModule.update();
        expect(agcModule.getAlarms()).not.toContain(NOISE_ONLY);
      });
    });

    it('a carrier above the noise clears the no-carrier warning', () => {
      const spm = rfFrontEnd.couplerModule.signalPathManager;
      const noiseIn = spm.getExternalNoise() - spm.agcGain;
      const carrier = { frequency: 1500e6, bandwidth: 1e6, power: (noiseIn + 3) as dBm, origin: SignalOrigin.NOTCH_FILTER } as unknown as IfSignal;
      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([carrier]);

      agcModule.update();

      expect(agcModule.isNoiseOnly).toBe(false);
      expect(agcModule.getAlarms().some((a) => a.includes('no carrier'))).toBe(false);
    });

    it('should apply gain to all output signals', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -60 as dBm,
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 10 as dB;
      agcModule.update();

      // After multiple updates, gain should move towards target
      expect(agcModule.outputSignals.length).toBe(1);
      expect(agcModule.outputSignals[0].origin).toBe(SignalOrigin.AGC);
    });

    it('should clamp gain to maxGain', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -120 as dBm, // Very weak signal
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = false;
      agcModule.state.targetLevel = -30 as dBm;
      agcModule.state.maxGain = 30 as dB;
      agcModule.state.currentGain = 29 as dB;

      // Run multiple updates to approach max gain
      for (let i = 0; i < 100; i++) {
        agcModule.update();
      }

      expect(agcModule.state.currentGain).toBeLessThanOrEqual(30);
    });

    it('should clamp gain to minGain', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: 0 as dBm, // Strong signal
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = false;
      agcModule.state.targetLevel = -30 as dBm;
      agcModule.state.minGain = -30 as dB;
      agcModule.state.currentGain = -29 as dB;

      // Run multiple updates to approach min gain
      for (let i = 0; i < 100; i++) {
        agcModule.update();
      }

      expect(agcModule.state.currentGain).toBeGreaterThanOrEqual(-30);
    });

    it('should use attack time constant when reducing gain', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: 0 as dBm, // Strong signal requiring gain reduction
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 0 as dB;
      agcModule.state.attackTime = 10; // Fast attack

      agcModule.update();

      // Gain should decrease (attack) when target gain < current gain
      expect(agcModule.state.currentGain).toBeLessThan(0);
    });

    it('should use release time constant when increasing gain', () => {
      const mockSignal: IfSignal = {
        frequency: 1500e6,
        bandwidth: 1e6,
        power: -80 as dBm, // Weak signal requiring gain increase
        polarization: 'V',
        origin: SignalOrigin.NOTCH_FILTER,
        gainInPath: 0,
      };

      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([mockSignal]);

      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 0 as dB;
      agcModule.state.releaseTime = 100; // Slower release

      agcModule.update();

      // Gain should increase (release) when target gain > current gain
      expect(agcModule.state.currentGain).toBeGreaterThan(0);
    });
  });

  describe('getAlarms', () => {
    it('should return empty array when bypassed', () => {
      agcModule.state.isBypassed = true;
      agcModule.state.currentGain = 30 as dB; // At max

      const alarms = agcModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });

    it('should alarm when at max gain', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 29.8 as dB;
      agcModule.state.maxGain = 30 as dB;

      const alarms = agcModule.getAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toContain('max gain');
      expect(alarms[0]).toContain('weak signal');
    });

    it('inhibits the gain-limit alarms while the antenna is stowed or slewing to a new position (phase 27, r2-s03-F2)', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.maxGain = 30 as dB;
      agcModule.state.currentGain = 29.8 as dB;
      const antenna = { isRepositioning: true };
      rfFrontEnd.antenna = antenna as never;
      expect(agcModule.getAlarms().some((a) => a.includes('max gain'))).toBe(false);

      agcModule.state.minGain = -30 as dB;
      agcModule.state.currentGain = -29.8 as dB;
      expect(agcModule.getAlarms().some((a) => a.includes('min gain'))).toBe(false);

      // On station again: the limits alarm
      antenna.isRepositioning = false;
      expect(agcModule.getAlarms().some((a) => a.includes('min gain'))).toBe(true);
      rfFrontEnd.antenna = null;
    });

    it('should alarm when at min gain', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = -29.8 as dB;
      agcModule.state.minGain = -30 as dB;

      const alarms = agcModule.getAlarms();

      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toContain('min gain');
      expect(alarms[0]).toContain('interference');
    });

    it('should not raise the max-gain alarm while the LNB is unpowered', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 30 as dB;
      agcModule.state.maxGain = 30 as dB;
      rfFrontEnd.lnbModule.state.isPowered = false;

      expect(agcModule.getAlarms()).toEqual([]);
    });

    it('should return empty array when gain is within normal range', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 0 as dB;
      agcModule.state.maxGain = 30 as dB;
      agcModule.state.minGain = -30 as dB;

      const alarms = agcModule.getAlarms();

      expect(alarms).toHaveLength(0);
    });
  });

  describe('handleBypassToggle', () => {
    it('should toggle bypass state', () => {
      expect(agcModule.state.isBypassed).toBe(false);

      agcModule.handleBypassToggle();

      expect(agcModule.state.isBypassed).toBe(true);

      agcModule.handleBypassToggle();

      expect(agcModule.state.isBypassed).toBe(false);
    });

    it('should set explicit bypass state', () => {
      agcModule.handleBypassToggle(true);

      expect(agcModule.state.isBypassed).toBe(true);

      agcModule.handleBypassToggle(false);

      expect(agcModule.state.isBypassed).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return bypassed when bypassed', () => {
      agcModule.state.isBypassed = true;

      expect(agcModule.getStatus()).toBe('bypassed');
    });

    it('should return no-input, not at-max, with the LNB or the IF filter off (Phase 34 D7, nats-r9-s03-F2)', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 30 as dB;
      agcModule.state.maxGain = 30 as dB;
      expect(agcModule.isInputPowered).toBe(true);

      rfFrontEnd.lnbModule.state.isPowered = false;
      expect(agcModule.isInputPowered).toBe(false);
      expect(agcModule.getStatus()).toBe('no-input');
      expect(agcModule.getAlarms()).toEqual([]);

      rfFrontEnd.lnbModule.state.isPowered = true;
      rfFrontEnd.filterModule.state.isPowered = false;
      expect(agcModule.isInputPowered).toBe(false);
      expect(agcModule.getStatus()).toBe('no-input');

      rfFrontEnd.filterModule.state.isPowered = true;
      expect(agcModule.getStatus()).toBe('at-max');
    });

    it('should return at-max when at max gain', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 29.8 as dB;
      agcModule.state.maxGain = 30 as dB;

      expect(agcModule.getStatus()).toBe('at-max');
    });

    it('should return at-min when at min gain', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = -29.8 as dB;
      agcModule.state.minGain = -30 as dB;

      expect(agcModule.getStatus()).toBe('at-min');
    });

    it('should return active when gain is normal', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 0 as dB;
      agcModule.state.maxGain = 30 as dB;
      agcModule.state.minGain = -30 as dB;

      expect(agcModule.getStatus()).toBe('active');
    });
  });

  describe('sync', () => {
    it('should sync state from external source', () => {
      const newState: Partial<AGCState> = {
        targetLevel: -40 as dBm,
        attackTime: 5,
      };

      agcModule.sync(newState);

      expect(agcModule.state.targetLevel).toBe(-40);
      expect(agcModule.state.attackTime).toBe(5);
    });
  });

  describe('inputSignals getter', () => {
    it('should get signals from Notch Filter module', () => {
      const signals = agcModule.inputSignals;

      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('hang (phase 29 D19, nats-r4-s08-F3)', () => {
    const carrier = (power: number): IfSignal => ({
      frequency: 1422e6,
      bandwidth: 24e6,
      power: power as dBm,
      polarization: 'V',
      origin: SignalOrigin.NOTCH_FILTER,
      gainInPath: 0,
    });

    it('holds the gain through a 1 s carrier dropout, then releases if the drop lasts', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.targetLevel = -30 as dBm;
      agcModule.state.maxGain = 30 as dB;
      agcModule.state.minGain = -30 as dB;
      let signals = [carrier(-20)];
      vi.spyOn(agcModule, 'inputSignals', 'get').mockImplementation(() => signals);
      const run = (ms: number) => {
        for (let t = 0; t < ms; t += FIXED_STEP_MS) {
          SimClock.step();
          agcModule.update();
        }
      };

      run(2000);
      const levelled = agcModule.state.currentGain;
      expect(levelled).toBeCloseTo(-10, 0);

      // The carrier blinks off for a second: no pumping
      signals = [];
      run(1000);
      expect(Math.abs(agcModule.state.currentGain - levelled)).toBeLessThan(0.1);

      // Back on: still levelled
      signals = [carrier(-20)];
      run(500);
      expect(agcModule.state.currentGain).toBeCloseTo(levelled, 1);

      // A real loss outlasting the hang releases
      signals = [];
      run(4000);
      expect(agcModule.state.currentGain).toBeGreaterThan(levelled + 5);
    });

    it('attack is never held', () => {
      agcModule.state.isBypassed = false;
      agcModule.state.currentGain = 0 as dB;
      vi.spyOn(agcModule, 'inputSignals', 'get').mockReturnValue([carrier(0)]);
      agcModule.update();
      expect(agcModule.state.currentGain).toBeLessThan(0);
    });
  });
});
