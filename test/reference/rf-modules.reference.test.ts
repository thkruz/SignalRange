/**
 * RF module reference cases (phase 19.6): amplifier compression and
 * intermodulation against the Rapp and Saleh models' closed forms, filter and
 * notch overlap integrals, free-running drift statistics, the reference chain
 * (GPSDO state -> LO error) and the phase-noise SNR limit.
 *
 * Amplifiers. Rapp (1991): Pout = G Pin / (1 + (G Pin / Psat)^s)^(1/s), so
 * P1dB sits 1 - 10 log10((10^(0.1 s) - 1)^(1/s)) dB below Psat (2.16 dB at
 * s = 2). Saleh (1981): A(r) = alpha r / (1 + beta r^2) peaks at Psat and puts
 * P1dB 4.12 dB below it. In the small-signal limit both are cubic (Rapp at
 * s = 1): y = g x - c x^3, and two equal tones of amplitude a give carriers
 * g a and third-order products c a^3 (x^3 = 6 a^3 cos + 2 a^3 cos 3, half
 * each side), so C/IM3 = 2 (OIP3 - Pout per tone) with OIP3 = Psat + 6.02 dB
 * (Saleh) and Psat + 3.01 dB (Rapp, s = 1): IM3 rises 3 dB per dB of drive.
 *
 * Filters. Power through a filter = integral of S(f) |H(f)|^2 over the
 * carrier's spectrum / its total power; a notch removes the energy in its
 * stop band only.
 *
 * Reference chain. A synthesiser locked to a reference with fractional error
 * y has LO error y f_LO; an oscillator walking sigma ppm per sqrt(hour) has a
 * change over T hours with standard deviation sigma sqrt(T); holdover at a
 * constant offset y accumulates time error y t (1.67 us/h is 4.64e-10).
 */

import { afterEach, describe, expect } from 'vitest';
import { vermontGroundStation } from '../../src/campaigns/nats/ground-stations';
import { amplifierFromDatasheet, carrierToIm3Db, outputPowerDbm, p1dbBelowPsatDb, p1dbDbm, twoToneResponse } from '../../src/equipment/rf-front-end/amplifier-models';
import { butterworthBandpassPower, carrierTransmission, transmissionLossDb } from '../../src/equipment/rf-front-end/filter-response';
import { ReferenceDisturbances } from '../../src/equipment/rf-front-end/gpsdo-module/reference-disturbance';
import { FreeRunDrift, phaseNoiseSnrLimitDb } from '../../src/equipment/rf-front-end/lo-reference';
import { NotchFilterModuleCore } from '../../src/equipment/rf-front-end/notch-filter-module/notch-filter-module-core';
import { createRFFrontEnd } from '../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../src/events/event-bus';
import { RngStream } from '../../src/simulation/rng';
import { FIXED_STEP_MS, SimClock } from '../../src/simulation/sim-clock';
import type { dB, MHz } from '../../src/types';
import { expectWithinAbs, expectWithinRel, referenceCase } from './reference-helpers';

const MHZ = 1e6;

describe('amplifier AM/AM (Rapp, Saleh)', () => {
  referenceCase('Rapp s = 2 puts P1dB 2.16 dB under Psat; s = 1 6.87 dB', undefined, () => {
    expectWithinAbs(p1dbBelowPsatDb('rapp', 2), 2.16, 0.01);
    expectWithinAbs(p1dbBelowPsatDb('rapp', 1), 6.87, 0.01);
  });

  referenceCase('Saleh puts P1dB 4.12 dB under Psat', undefined, () => {
    expectWithinAbs(p1dbBelowPsatDb('saleh'), 4.12, 0.01);
  });

  referenceCase('a model built from a datasheet P1dB compresses by 1 dB there', undefined, () => {
    for (const model of [amplifierFromDatasheet('saleh', 50, 60), amplifierFromDatasheet('rapp', 40, 34, 37), amplifierFromDatasheet('rapp', 23, 28)]) {
      expectWithinAbs(p1dbDbm(model), model.kind === 'saleh' ? 60 : model.gainDb === 40 ? 34 : 28, 0.02);
      // Find the 1 dB point by bisection on the curve itself
      let lo = -60;
      let hi = 40;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (model.gainDb - (outputPowerDbm(model, mid) - mid) < 1) lo = mid;
        else hi = mid;
      }
      expectWithinAbs(outputPowerDbm(model, lo), p1dbDbm(model), 0.02);
    }
  });

  referenceCase('Saleh output peaks at Psat and falls past saturation', undefined, () => {
    const model = amplifierFromDatasheet('saleh', 50, 60);
    let peak = Number.NEGATIVE_INFINITY;
    let peakIn = 0;
    for (let pin = -20; pin <= 30; pin += 0.05) {
      const out = outputPowerDbm(model, pin);
      if (out > peak) {
        peak = out;
        peakIn = pin;
      }
    }
    expectWithinAbs(peak, model.psatDbm, 0.01);
    expect(outputPowerDbm(model, peakIn + 6)).toBeLessThan(peak - 1);
  });

  referenceCase('Rapp approaches Psat monotonically (no fold-back)', undefined, () => {
    const model = amplifierFromDatasheet('rapp', 40, 34, 37);
    let last = Number.NEGATIVE_INFINITY;
    for (let pin = -40; pin <= 20; pin += 0.5) {
      const out = outputPowerDbm(model, pin);
      expect(out).toBeGreaterThanOrEqual(last);
      expect(out).toBeLessThanOrEqual(37 + 1e-9);
      last = out;
    }
  });
});

describe('two-tone intermodulation', () => {
  referenceCase('Saleh small-signal C/IM3 = 2 (Psat + 6.02 - Pout per tone) - 3.21 dB of AM/PM', undefined, () => {
    // The AM/PM term (alpha_phi = pi/3) adds a quadrature cubic coefficient:
    // |c| = alpha beta sqrt(1 + alpha_phi^2), 20 log10 sqrt(1 + (pi/3)^2) = 3.21 dB
    const amPm = 10 * Math.log10(1 + (Math.PI / 3) ** 2);
    const model = amplifierFromDatasheet('saleh', 50, 60);
    for (const totalIn of [-25, -20, -15]) {
      const { perToneOutputDbm, carrierToIm3Db } = twoToneResponse(model, totalIn);
      expectWithinAbs(carrierToIm3Db, 2 * (model.psatDbm + 6.02 - perToneOutputDbm) - amPm, 0.3);
    }
  });

  referenceCase('Rapp s = 1 small-signal C/IM3 = 2 (Psat + 3.01 - Pout per tone)', undefined, () => {
    const model = { kind: 'rapp' as const, gainDb: 40, psatDbm: 40, smoothness: 1 };
    for (const totalIn of [-30, -25, -20]) {
      const { perToneOutputDbm, carrierToIm3Db } = twoToneResponse(model, totalIn);
      expectWithinAbs(carrierToIm3Db, 2 * (model.psatDbm + 3.01 - perToneOutputDbm), 0.3);
    }
  });

  referenceCase('an SSPA reads IM3 from OIP3 = P1dB + 10 dB below compression (Rapp alone has no third order)', undefined, () => {
    const model = amplifierFromDatasheet('rapp', 30, 34, 36);
    for (const totalIn of [-6, -3, 0]) {
      const perTone = twoToneResponse(model, totalIn).perToneOutputDbm;
      expectWithinAbs(carrierToIm3Db(model, totalIn), 2 * (34 + 10 - perTone), 0.01);
      // The bare Rapp curve would read cleaner than the intercept line
      expect(twoToneResponse(model, totalIn).carrierToIm3Db).toBeGreaterThan(carrierToIm3Db(model, totalIn));
    }
  });

  referenceCase('third-order slope: IM3 rises 3 dB per dB of drive, C/IM3 falls 2 dB per dB', undefined, () => {
    const model = amplifierFromDatasheet('saleh', 50, 60);
    const a = twoToneResponse(model, -30);
    const b = twoToneResponse(model, -20);
    expectWithinAbs(b.im3Dbm - a.im3Dbm, 30, 0.3);
    expectWithinAbs(a.carrierToIm3Db - b.carrierToIm3Db, 20, 0.3);
  });

  referenceCase('C/IM3 falls as back-off drops, all the way into saturation', undefined, () => {
    const model = amplifierFromDatasheet('saleh', 50, 60);
    let last = Number.POSITIVE_INFINITY;
    // Up to the saturating drive: total input 4 Psat / G = Psat + 6.02 - G dBm
    const saturatingIn = model.psatDbm + 6.02 - model.gainDb;
    for (let totalIn = saturatingIn - 24; totalIn <= saturatingIn + 1e-9; totalIn += 2) {
      const { carrierToIm3Db } = twoToneResponse(model, totalIn);
      expect(carrierToIm3Db).toBeLessThan(last);
      last = carrierToIm3Db;
    }
    // A TWTA at saturation is around 10 dB C/IM3 (two tones)
    expect(last).toBeGreaterThan(5);
    expect(last).toBeLessThan(16);
  });
});

describe('filter and notch overlap integrals', () => {
  const notch = (centre: number, width: number, depth: number) => ({ centerFrequency: centre as MHz, bandwidth: width as MHz, depth: depth as dB, enabled: true });

  referenceCase('an 8 MHz 30 dB notch inside a 36 MHz carrier costs the slice energy, not depth x overlap', undefined, () => {
    const loss = NotchFilterModuleCore.carrierLossDb(1459 * MHZ, 36 * MHZ, [notch(1470, 8, 30)]);
    // The slice is 8/36 of a flat spectrum: -10 log(1 - 8/36) = 1.09 dB;
    // the raised-cosine shape and the notch skirts move it a little
    expectWithinAbs(loss, 1.09, 0.35);
    expect(loss).toBeLessThan(30 * (8 / 36));
  });

  referenceCase('a notch centred on a 1 MHz interferer takes its full depth', undefined, () => {
    expect(NotchFilterModuleCore.carrierLossDb(1515 * MHZ, 1 * MHZ, [notch(1515, 4, 30)])).toBeGreaterThan(28);
  });

  referenceCase('a notch clear of a carrier costs it nothing', undefined, () => {
    expect(NotchFilterModuleCore.carrierLossDb(1459 * MHZ, 36 * MHZ, [notch(1530, 4, 30)])).toBeLessThan(0.05);
  });

  referenceCase('Butterworth passband is -3 dB at its edges', undefined, () => {
    expectWithinAbs(10 * Math.log10(butterworthBandpassPower(1070 * MHZ, 1050 * MHZ, 40 * MHZ, 6)), -3.01, 0.01);
  });

  referenceCase('a 36 MHz carrier centred in a 40 MHz 6th-order filter loses under 0.25 dB', undefined, () => {
    const loss = transmissionLossDb(carrierTransmission(1050 * MHZ, 36 * MHZ, (f) => butterworthBandpassPower(f, 1050 * MHZ, 40 * MHZ, 6)));
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThan(0.25);
  });

  referenceCase('a carrier 40 MHz off a 40 MHz filter is rejected by its skirt', undefined, () => {
    const loss = transmissionLossDb(carrierTransmission(1090 * MHZ, 10 * MHZ, (f) => butterworthBandpassPower(f, 1050 * MHZ, 40 * MHZ, 6)));
    // |H|^2 at 2x the half-bandwidth: 1 / (1 + 2^12) = -36 dB
    expectWithinAbs(loss, 36.1, 3);
  });
});

describe('free-running oscillator drift (seeded random walk)', () => {
  referenceCase('the change over an hour has sigma = random-walk rate x sqrt(1 h)', undefined, () => {
    const runs = 400;
    let sumSq = 0;
    let seed = 7;
    for (let r = 0; r < runs; r++) {
      const stream = new RngStream(seed++);
      const drift = new FreeRunDrift(() => stream, 2, 0, 1000);
      drift.start();
      // 3600 one-second steps
      for (let i = 0; i < 3600; i++) drift.step(1);
      sumSq += drift.ppm ** 2;
    }
    // The 6 h restoring pull trims the variance by about 1 - 1/6 over an hour
    expectWithinRel(Math.sqrt(sumSq / runs), 2 * Math.sqrt(1 - 1 / 6), 0.12);
  });

  referenceCase('the same seed gives the same walk, frame rate independent in distribution', undefined, () => {
    const walk = (dt: number) => {
      const stream = new RngStream(99);
      const drift = new FreeRunDrift(() => stream, 5, 20, 200);
      drift.start();
      for (let t = 0; t < 600; t += dt) drift.step(dt);
      return drift.ppm;
    };
    expect(walk(1)).toBe(walk(1));
    expect(Math.abs(walk(1))).toBeLessThan(40);
  });
});

describe('phase noise against the demodulator', () => {
  referenceCase('a -60 dBc/Hz LO caps a 30 Msym/s carrier near 14.7 dB', undefined, () => {
    // 2 [L0 (fc - f1) + L0 fc^2 (1/fc - 1/f2)] with f1 = 3 kHz, fc = 10 kHz, f2 = 15 MHz
    const sigma2 = 2 * (1e-6 * (10e3 - 3e3) + 1e-6 * 1e8 * (1 / 10e3 - 1 / 15e6));
    expectWithinAbs(phaseNoiseSnrLimitDb(-60, 30e6), -10 * Math.log10(sigma2), 0.01);
    expectWithinAbs(phaseNoiseSnrLimitDb(-60, 30e6), 14.7, 0.1);
  });

  referenceCase('a locked synthesiser (-95 dBc/Hz) is harmless: over 45 dB', undefined, () => {
    expect(phaseNoiseSnrLimitDb(-95, 30e6)).toBeGreaterThan(45);
    expect(phaseNoiseSnrLimitDb(-95, 64e3)).toBeGreaterThan(45);
  });
});

describe('reference chain: GPSDO state sets every LO (one station)', () => {
  const build = () => {
    SimClock.reset();
    document.body.innerHTML = '<div id="rc-fe"></div>';
    const fe = createRFFrontEnd('rc-fe', vermontGroundStation.rfFrontEnds[0], 'standard');
    fe.groundStationId = 'VT-01';
    const step = (seconds: number) => {
      const steps = Math.round((seconds * 1000) / FIXED_STEP_MS);
      for (let i = 0; i < steps; i++) {
        SimClock.step();
        fe.update();
      }
    };
    step(1);
    return { fe, step };
  };

  afterEach(() => {
    ReferenceDisturbances.clear();
    EventBus.destroy();
  });

  referenceCase('disciplined: LNB and BUC carry the same few parts in 10^12', undefined, () => {
    const { fe } = build();
    const y = fe.gpsdoModule.fractionalFrequencyError();
    expect(Math.abs(y)).toBeLessThanOrEqual(2e-12);
    expectWithinAbs(fe.lnbModule.state.frequencyError, y * 5250e6, 1e-9);
    expectWithinAbs(fe.bucModule.state.frequencyError, y * 7000e6, 1e-9);
  });

  referenceCase('holdover: the OCXO offset (1.67 us/h) reaches both LOs coherently', undefined, () => {
    const { fe, step } = build();
    fe.gpsdoModule.setGnssSignalPresent(false);
    step(3600);
    const y = fe.gpsdoModule.fractionalFrequencyError();
    expectWithinRel(Math.abs(y), 1.67e-6 / 3600, 0.01);
    expectWithinAbs(fe.lnbModule.state.frequencyError, y * 5250e6, 1e-6);
    expectWithinAbs(fe.bucModule.state.frequencyError, y * 7000e6, 1e-6);
    expectWithinAbs(fe.gpsdoModule.state.holdoverError, 1.67, 0.03);
  });

  referenceCase('a GNSS spoof walking time at 5 us/s steers the disciplined LOs by 5 ppm', undefined, () => {
    const { fe, step } = build();
    ReferenceDisturbances.register((gs) => (gs === 'VT-01' ? { timeOffsetUs: 120, fractionalFrequencyError: 5e-6 } : null));
    step(0.1);
    expectWithinRel(fe.lnbModule.state.frequencyError, 5e-6 * 5250e6, 0.001);
    expectWithinRel(fe.bucModule.state.frequencyError, 5e-6 * 7000e6, 0.001);
    expectWithinAbs(fe.gpsdoModule.timeErrorUs(), 120, 1e-9);
    fe.groundStationId = 'ME-02';
    step(0.1);
    expect(Math.abs(fe.lnbModule.state.frequencyError)).toBeLessThan(1);
  });

  referenceCase('no reference: the LOs free-run (seeded walk) with free-running phase noise', undefined, () => {
    const { fe, step } = build();
    fe.gpsdoModule.handlePowerToggle(false);
    step(10);
    expect(fe.lnbModule.state.isExtRefLocked).toBe(false);
    expect(fe.bucModule.state.isExtRefLocked).toBe(false);
    expect(Math.abs(fe.lnbModule.state.frequencyError)).toBeGreaterThan(10);
    expect(fe.lnbModule.loPhaseNoiseDbcHz).toBe(-60);
    expect(fe.bucModule.state.phaseNoise).toBe(-75);
  });
});
