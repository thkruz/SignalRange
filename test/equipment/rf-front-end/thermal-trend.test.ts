import { describe, expect, it } from 'vitest';
import { ThermalTrendLog } from '../../../src/equipment/rf-front-end/thermal-trend';

/** Drive a log along a first-order approach to `targetC` (tau s), one reading per second of run time */
function run(log: ThermalTrendLog, fromMs: number, seconds: number, startC: number, targetC: number, tauS = 600): number {
  let celsius = startC;
  for (let i = 1; i <= seconds; i++) {
    celsius += (targetC - celsius) * (1 - Math.exp(-1 / tauS));
    log.record(fromMs + i * 1000, celsius);
  }
  return celsius;
}

describe('ThermalTrendLog short-window trend (nats-r3-s02-F4, nats-r3-s24-F1)', () => {
  it('trends over the last minute, sampled every 5 s', () => {
    const log = new ThermalTrendLog();
    expect(log.trendWindowS).toBe(60);
    expect(log.sampleIntervalS).toBe(5);
  });

  it('a warm-up after a cool-down turns the trend positive within 45 s', () => {
    const log = new ThermalTrendLog();
    // Ten minutes powered off, cooling from 31 toward a 25 degC room
    const cooled = run(log, 0, 600, 31, 25);
    expect(log.trendCPerMin() as number).toBeLessThan(0);
    // Power on: heading for 45 degC
    run(log, 600_000, 45, cooled, 45);
    expect(log.trendCPerMin() as number).toBeGreaterThan(0.5);
    // The rolling 10 min ago sample still shows the cool-down's start
    expect(log.readingMinutesAgo(10) as number).toBeGreaterThan(cooled);
  });

  it('a de-rate turns a climbing trend negative within 45 s (S24 Confirm the Trend Bends)', () => {
    const log = new ThermalTrendLog();
    // Heating 58 -> 63.3 toward 65
    const hot = run(log, 0, 600, 58, 65);
    expect(log.trendCPerMin() as number).toBeGreaterThan(0.1);
    // De-rate: target drops to 56 degC
    run(log, 600_000, 45, hot, 56);
    expect(log.trendCPerMin() as number).toBeLessThan(-0.3);
  });

  it('a backfilled hot unit reads its approach slope: 62 heading for 65 with tau 10 min is about +0.3 degC/min', () => {
    const log = new ThermalTrendLog();
    log.backfill(1_000_000, 62, 65, 600);
    const trend = log.trendCPerMin() as number;
    expect(trend).toBeGreaterThan(0.25);
    expect(trend).toBeLessThan(0.4);
    expect(log.readingMinutesAgo(10) as number).toBeCloseTo(65 - 3 * Math.E, 1);
  });
});
