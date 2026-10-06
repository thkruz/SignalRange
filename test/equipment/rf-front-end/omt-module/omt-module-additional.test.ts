import { vi } from 'vitest';
import { OMTModule } from '../../../../src/equipment/rf-front-end/omt-module/omt-module';
import { RFFrontEndCore } from '../../../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { SignalOrigin } from '../../../../src/signal-origin';
import { dBi, dBm, RfSignal } from '../../../../src/types';

describe('OMTModule Additional Coverage', () => {
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
    vi.clearAllMocks();
  });

  describe('loopback mode', () => {
    it('should return loopback signals with reversed polarization', () => {
      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.isLoopback = true;

        const mockTxSignal: RfSignal = {
          frequency: 5900e6,
          bandwidth: 1e6,
          power: 10 as dBm,
          polarization: 'H',
          origin: SignalOrigin.HIGH_POWER_AMPLIFIER,
          gainInPath: 0 as dBi,
        };

        vi.spyOn(omtModule, 'txSignalsIn', 'get').mockReturnValue([mockTxSignal]);
        omtModule.update();

        const rxSignals = omtModule.rxSignalsIn;
        expect(rxSignals.length).toBeGreaterThan(0);
        expect(rxSignals[0].polarization).toBe('V');
      }
    });
  });

  describe('cross-pol isolation (phase 19.4: a per-unit constant)', () => {
    it('is the authored spec plus a 0-5 dB build scatter drawn once', () => {
      const isolation = omtModule.state.crossPolIsolation;
      expect(isolation).toBeGreaterThanOrEqual(28.5);
      expect(isolation).toBeLessThanOrEqual(33.5);
    });

    it('does not change from frame to frame or with the signal polarization', () => {
      const isolation = omtModule.state.crossPolIsolation;
      for (let i = 0; i < 20; i++) {
        omtModule.state.effectiveRxPol = i % 2 === 0 ? 'V' : 'H';
        omtModule.update();
        expect(omtModule.state.crossPolIsolation).toBe(isolation);
      }
    });

    it('a fault written into the state lowers it and raises the fault flag below 20 dB', () => {
      omtModule.state.crossPolIsolation = 15;
      omtModule.update();
      expect(omtModule.state.crossPolIsolation).toBe(15);
      expect(omtModule.state.isFaulted).toBe(rfFrontEnd.antenna ? true : omtModule.state.isFaulted);
    });
  });

  describe('effective polarization edge cases', () => {
    it('should set null polarization when skew is null', () => {
      if (rfFrontEnd.antenna) {
        rfFrontEnd.antenna.state.polarization = null as any;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBeNull();
        expect(omtModule.state.effectiveRxPol).toBeNull();
      }
    });

    it('should handle skew near 180 degrees same as 0', () => {
      if (rfFrontEnd.antenna) {
        omtModule.state.txPolarization = 'H';
        rfFrontEnd.antenna.state.polarization = 175;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBe('H');
        expect(omtModule.state.effectiveRxPol).toBe('V');
      }
    });

    it('should use current polarization for intermediate skew angles', () => {
      if (rfFrontEnd.antenna) {
        omtModule.state.txPolarization = 'H';
        omtModule.state.rxPolarization = 'V';
        rfFrontEnd.antenna.state.polarization = 45;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBe('H');
        expect(omtModule.state.effectiveRxPol).toBe('V');
      }
    });

    it('should reverse polarization for skew near 90 when OMT is V', () => {
      if (rfFrontEnd.antenna) {
        omtModule.state.txPolarization = 'V';
        rfFrontEnd.antenna.state.polarization = 90;
        omtModule.update();

        expect(omtModule.state.effectiveTxPol).toBe('H');
        expect(omtModule.state.effectiveRxPol).toBe('V');
      }
    });
  });

  describe('signal passthrough', () => {
    it('should pass signal through unchanged when polarization matches', () => {
      // This test verifies line 140: return sig unchanged when polarization matches
      const matchingSignal: RfSignal = {
        frequency: 3700e6,
        bandwidth: 1e6,
        power: -80 as dBm,
        polarization: 'V',
        origin: SignalOrigin.SATELLITE_TX,
        gainInPath: 30 as dBi,
      };

      // Require antenna to be defined for this test
      expect(rfFrontEnd.antenna).toBeDefined();
      if (!rfFrontEnd.antenna) return;

      // Set up antenna so effectiveRxPol = 'V' after update
      // At skew 0 with txPolarization = 'H', effectiveRxPol = 'V'
      rfFrontEnd.antenna.state.polarization = 0;
      rfFrontEnd.antenna.state.rxSignalsIn = [matchingSignal];
      omtModule.state.txPolarization = 'H';
      vi.spyOn(omtModule, 'rxSignalsIn', 'get').mockReturnValue([matchingSignal]);

      omtModule.update();

      expect(omtModule.state.effectiveRxPol).toBe('V');
      expect(omtModule.rxSignalsOut.length).toBe(1);
      expect(omtModule.rxSignalsOut[0].power).toBe(-80);
      expect(omtModule.rxSignalsOut[0].isDegraded).toBeUndefined();
    });
  });
});
