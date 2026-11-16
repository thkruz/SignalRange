import { describe, expect, it } from 'vitest';
import { hamTechS11Data } from '../../../src/campaigns/ham-sdr/tech/s11-a-contact-through-space';
import type { OrbitalSatellite } from '../../../src/equipment/satellite/orbital-satellite';

/**
 * S11 pass timing from the real orbit: the authored CUBEHOP-UV TLE seen from the backyard
 * observer at the scenario start time, propagated with SGP4 (no scripted geometry).
 */
describe('C3 S11 CUBEHOP-UV pass geometry', () => {
  const sat = hamTechS11Data.settings.satellites[0] as OrbitalSatellite;
  const startMs = Date.parse(`${hamTechS11Data.settings.scenarioStartDate}T${hamTechS11Data.settings.scenarioStartWallTime}Z`);
  const samples = Array.from({ length: 181 }, (_, i) => {
    const t = i * 10;
    const rae = sat.ootkSatellite.rae(sat.groundObserver, new Date(startMs + t * 1000));
    return { t, el: rae ? (rae.el as number) : -90 };
  });

  it('rises within the first ten minutes and peaks above 30 degrees', () => {
    const rise = samples.find((s) => s.el > 0);
    expect(rise).toBeDefined();
    expect(rise!.t).toBeGreaterThan(0);
    expect(rise!.t).toBeLessThanOrEqual(600);
    const peak = Math.max(...samples.map((s) => s.el));
    expect(peak).toBeGreaterThan(30);
  });

  it('is below the horizon at scenario start, so the player has time to prepare', () => {
    expect(samples[0].el).toBeLessThan(0);
  });
});
