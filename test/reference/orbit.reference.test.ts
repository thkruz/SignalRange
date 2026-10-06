/**
 * Orbit reference cases (phase 19.1): SGP4 against Vallado's verification
 * vectors, and the downlink Doppler factor against the range rate it stands for.
 *
 * SGP4: Vallado, Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report #3",
 * AIAA 2006-6753; test set SGP4-VER.TLE with expected TEME states in
 * tcppver.out (as shipped by python-sgp4, MIT). The engine propagates with
 * ootk's SGP4 exactly as `OrbitalSatellite` does. Times are JS Dates, which
 * resolve 1 ms against a TLE epoch given to 1e-8 day (0.86 ms): up to 0.5 ms of
 * epoch rounding is ~4 m of along-track position at LEO speeds, so the
 * tolerances are 5 m and 1 cm/s, not SGP4's own sub-millimetre agreement.
 */

import { Satellite as OotkSatellite, type TleLine1, type TleLine2 } from 'ootk';
import { groundObjectFor, observerFromLocation } from '../../src/equipment/satellite/orbital-satellite';
import { expectWithinAbs, referenceCase } from './reference-helpers';

const C_KM_S = 299_792.458;

/** Vanguard 1 (00005): the first case in SGP4-VER.TLE */
const VANGUARD = {
  tle1: '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753' as TleLine1,
  tle2: '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667' as TleLine2,
  // tsince (min) -> TEME position (km), velocity (km/s), from tcppver.out
  vectors: [
    { tsince: 0, r: [7022.46529266, -1400.08296755, 0.03995155], v: [1.893841015, 6.405893759, 4.53480725] },
    { tsince: 360, r: [-7154.03120202, -3783.17682504, -3536.19412294], v: [4.741887409, -4.151817765, -2.093935425] },
    { tsince: 720, r: [-7134.59340119, 6531.68641334, 3260.27186483], v: [-4.113793027, -2.911922039, -2.557327851] },
    { tsince: 1440, r: [-938.55923943, -6268.18748831, -4294.02924751], v: [7.536105209, -0.427127707, 0.98987808] },
  ],
};

describe('SGP4 against the Vallado verification vectors (00005 Vanguard 1)', () => {
  const sat = new OotkSatellite({ name: 'VANGUARD 1', tle1: VANGUARD.tle1, tle2: VANGUARD.tle2 });
  const epochMs = sat.toTle().epoch.toDateTime().getTime();

  for (const { tsince, r, v } of VANGUARD.vectors) {
    referenceCase(`t + ${tsince} min: position within 5 m, velocity within 1 cm/s`, undefined, () => {
      const state = sat.eci(new Date(epochMs + tsince * 60_000));
      expect(state).not.toBeNull();
      const pos = state!.position as unknown as { x: number; y: number; z: number };
      const vel = state!.velocity as unknown as { x: number; y: number; z: number };
      [pos.x, pos.y, pos.z].forEach((c, i) => expectWithinAbs(c, r[i], 5e-3));
      [vel.x, vel.y, vel.z].forEach((c, i) => expectWithinAbs(c, v[i], 1e-5));
    });
  }
});

describe('downlink Doppler factor', () => {
  // A 780 km sun-synchronous LEO over a mid-latitude station
  const tle1 = '1 61701U 27015A   27099.50000000  .00001000  00000-0  10000-3 0  9997' as TleLine1;
  const tle2 = '2 61701  97.2000 193.5000 0010000  90.0000 308.2500 15.60000000123458' as TleLine2;
  const sat = new OotkSatellite({ name: 'REF-LEO', tle1, tle2 });
  const ground = groundObjectFor(observerFromLocation({ latitude: 53.27, longitude: -9.05, elevation: 20 }, 'REF-GW'));
  const epochMs = sat.toTle().epoch.toDateTime().getTime();

  /** Samples over 24 h where the bird is above the horizon, 10 s apart */
  const visible: number[] = [];
  for (let t = epochMs; t < epochMs + 86_400_000; t += 10_000) {
    const rae = sat.rae(ground, new Date(t));
    if (rae && rae.el > 5) visible.push(t);
  }

  referenceCase('the reference LEO is seen from the reference site (at least one pass above 5 deg)', undefined, () => {
    expect(visible.length).toBeGreaterThan(10);
  });

  referenceCase('the factor is 1 - (range rate)/c: within 3 m/s of the finite-difference range rate on every visible sample', 'DEV-PROP-07', () => {
    for (const t of visible) {
      const before = sat.rae(ground, new Date(t - 500))!.rng;
      const after = sat.rae(ground, new Date(t + 500))!.rng;
      const rangeRateKmS = after - before; // over 1 s
      const factor = sat.dopplerFactor(ground, new Date(t))!;
      expectWithinAbs((1 - factor) * C_KM_S, rangeRateKmS, 0.003);
    }
  });

  referenceCase('an approaching bird is received high, a receding one low (sign convention)', undefined, () => {
    const t = visible[0];
    const closing = sat.rae(ground, new Date(t + 1000))!.rng < sat.rae(ground, new Date(t))!.rng;
    const factor = sat.dopplerFactor(ground, new Date(t))!;
    expect(factor > 1).toBe(closing);
  });
});
