/**
 * Package F: service and reserve verified over ONE window. The run's own ledger window carries the energy and fuel
 * accounting; charge is kept apart from load; a claimed rate is checked against the measured one.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { type PhysicalPlantService, PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import type { ResourceWindow } from '@app/physical/physical-plant-types';
import { batteryOnlyEndWh, forecastAgrees, measuredChargeW, measuredLoadW, rateAgrees, runHeldReserve } from '@app/physical/run-power';
import type { RunPowerRecord } from '@app/physical/workload-types';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, tick } from '../campaigns/frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }), hasInstance: () => true, destroy: () => undefined },
}));

const CARD = 'ola-voice';

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(2);
  localStorage.clear();
});
afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

function window_(over: Partial<ResourceWindow> = {}): ResourceWindow {
  return { startS: 100, endS: 220, startStoredWh: 450, minStoredWh: 440, endStoredWh: 440, loadWh: 10, chargeWh: 0, clippedWh: 0, fuelUsedL: 0, steps: 120, ...over };
}
function record(over: Partial<RunPowerRecord> = {}, win: Partial<ResourceWindow> = {}): RunPowerRecord {
  return { window: window_(win), reserveWh: 200, basis: 'battery-only', forecastWh: 10, complete: true, ...over };
}

describe('run-power rules (numeric fixtures)', () => {
  it('accepts a complete run whose window equals the service window and never dipped below the reserve', () => {
    expect(runHeldReserve(record(), 100, 220, 120)).toBe(true);
  });
  it('rejects mismatched windows: a window that starts late, ends early, or misses seconds', () => {
    expect(runHeldReserve(record({}, { startS: 160 }), 100, 220, 120)).toBe(false);
    expect(runHeldReserve(record({}, { endS: 180 }), 100, 220, 120)).toBe(false);
    expect(runHeldReserve(record({}, { steps: 60 }), 100, 220, 120)).toBe(false);
    // A run shorter than the claimed window cannot stand in for it
    expect(runHeldReserve(record(), 100, 160, 120)).toBe(false);
  });
  it('rejects a run that is not complete (aborted, invalidated or reloaded)', () => {
    expect(runHeldReserve(record({ complete: false }), 100, 220, 120)).toBe(false);
  });
  it('fails a dip below the reserve even when charging recovers the battery by the end', () => {
    expect(runHeldReserve(record({}, { minStoredWh: 195, endStoredWh: 260, chargeWh: 80 }), 100, 220, 120)).toBe(false);
  });
  it('stops generator charging from rescuing a battery-only claim', () => {
    // 450 Wh at the start, 270 Wh of load: battery-only the battery ends at 180 Wh, below the 200 Wh reserve
    const charged = record({}, { startStoredWh: 450, loadWh: 270, chargeWh: 90, minStoredWh: 300, endStoredWh: 270 });
    expect(batteryOnlyEndWh(charged)).toBe(180);
    expect(runHeldReserve(charged, 100, 220, 120)).toBe(false);
    // The same run on a with-generator plan holds
    expect(runHeldReserve({ ...charged, basis: 'with-generator' }, 100, 220, 120)).toBe(true);
  });
  it('keeps charge and load apart in the measured rates', () => {
    const r = record({}, { loadWh: 5, chargeWh: 2 });
    expect(measuredLoadW(r)).toBeCloseTo(150, 6);
    expect(measuredChargeW(r)).toBeCloseTo(60, 6);
    expect(measuredLoadW(record({}, { endS: null }))).toBeNull();
  });
  it('compares a claimed rate to the measured rate within 10 percent or 5 W', () => {
    expect(rateAgrees(175, 175)).toBe(true);
    expect(rateAgrees(190, 175)).toBe(true);
    expect(rateAgrees(160, 175)).toBe(true);
    expect(rateAgrees(200, 175)).toBe(false);
    expect(rateAgrees(120, 175)).toBe(false);
    expect(rateAgrees(4, 1)).toBe(true);
    expect(rateAgrees(7, 1)).toBe(false);
    expect(rateAgrees(Number.NaN, 175)).toBe(false);
  });
  it('checks the forecast against the measured use to about 10 percent', () => {
    expect(forecastAgrees(record({ forecastWh: 10.5 }, { loadWh: 10 }))).toBe(true);
    expect(forecastAgrees(record({ forecastWh: 12 }, { loadWh: 10 }))).toBe(false);
    expect(forecastAgrees(record({ forecastWh: null }))).toBe(false);
  });
});

describe('plant ledger and workload run (S2 fixture)', () => {
  function boot(): PhysicalPlantService {
    const svc = bootScenario(frontlineScenario2Data);
    tick(330);

    return svc;
  }
  function finish(svc: PhysicalPlantService) {
    const s = svc.workloads?.start(CARD, SKYLINK_SERVICE);
    expect(s?.ok).toBe(true);

    return svc.workloads?.waitForRun(s?.ok ? s.run.id : '');
  }

  it('records a run window that equals the run, with the 175 W load counted apart from the generator charge', () => {
    const svc = boot();
    const run = finish(svc);
    const p = run?.power as RunPowerRecord;
    expect(run?.status).toBe('supported');
    expect(p.complete).toBe(true);
    expect(p.reserveWh).toBe(200);
    expect(p.window.startS).toBe(330);
    expect(p.window.endS).toBe(450);
    expect(p.window.steps).toBe(120);
    expect(measuredLoadW(p)).toBeGreaterThan(157.5);
    expect(measuredLoadW(p)).toBeLessThan(192.5);
    // Charge entered during the window, so the net change understates the draw: the claim is about load
    expect(p.window.chargeWh).toBeGreaterThan(0);
    const net = (p.window.startStoredWh - p.window.endStoredWh) * 30;
    expect(net).toBeLessThan((measuredLoadW(p) ?? 0) - 20);
    expect(forecastAgrees(p)).toBe(true);
    expect(runHeldReserve(p, 330, 450, 120)).toBe(true);
  });

  it('validates a claimed rate against the measured one through the records rule', () => {
    const svc = boot();
    finish(svc);
    const measured = svc.records?.latestRunRateW(CARD, SKYLINK_SERVICE) ?? 0;
    expect(measured).toBeGreaterThan(157);
    const good = svc.records?.validate('resources', { rate: { value: Math.round(measured) } });
    expect(good?.fields.find((f) => f.key === 'rate')?.ok).toBe(true);
    const wrong = svc.records?.validate('resources', { rate: { value: Math.round(measured * 0.6) } });
    expect(wrong?.fields.find((f) => f.key === 'rate')?.ok).toBe(false);
  });

  it('has no measured rate before any run, and a reserve-only wait before a later run cannot pass for the earlier window', () => {
    const svc = boot();
    tick(600);
    expect(svc.records?.latestRunRateW(CARD, SKYLINK_SERVICE)).toBeNull();
    const run = finish(svc);
    const p = run?.power as RunPowerRecord;
    expect(p.window.startS).toBe(930);
    expect(runHeldReserve(p, 930, 1050, 120)).toBe(true);
    // The waiting time before the run is not part of its window
    expect(runHeldReserve(p, 330, 450, 120)).toBe(false);
  });

  it('closes a ledger at its untilS across a clock jump, and counts every second of it', () => {
    const svc = bootScenario(frontlineScenario2Data);
    tick(10);
    svc.plant.openLedger('jump', 10 + 120);
    // One coarse skip of five minutes, one UPDATE
    SimClock.skip(300_000);
    EventBus.getInstance().emit(Events.UPDATE, 1 as never);
    tick(1);
    const w = svc.plant.getLedger('jump');
    expect(w?.endS).toBe(130);
    expect(w?.steps).toBeGreaterThanOrEqual(119);
    expect(w?.loadWh).toBeGreaterThan(0);
  });

  it('invalidates a run when a relevant mode changes during it, and records no complete window', () => {
    const svc = boot();
    const s = svc.workloads?.start(CARD, SKYLINK_SERVICE);
    tick(30);
    svc.plant.setPartMode('skylink-dish', 'standby');
    tick(5);
    const run = svc.workloads?.waitForRun(s?.ok ? s.run.id : '');
    expect(run?.power?.complete).not.toBe(true);
    expect(run?.status === 'supported' && !run.invalidatedBy).toBe(false);
  });

  it('loads an old save without a ledger and still records a run window', () => {
    const svc = boot();
    const state = JSON.parse(JSON.stringify(svc.plant.getState())) as { ledger?: unknown };
    delete state.ledger;
    svc.plant.restoreState(state as never);
    expect(svc.plant.getLedger('anything')).toBeNull();
    expect(finish(svc)?.power?.complete).toBe(true);
  });

  it('keeps history across a checkpoint, and a fresh run after the reload verifies on its own window', () => {
    const svc = boot();
    const run = finish(svc);
    expect(run?.power?.complete).toBe(true);
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(frontlineScenario2Data);
    restoreManagerStates(saved);
    tick(2);
    const kept = again.workloads?.getRuns().find((r) => r.id === run?.id);
    expect(kept?.power?.window.loadWh).toBeCloseTo(run?.power?.window.loadWh ?? -1, 6);
    const next = finish(again);
    expect(next?.id).not.toBe(run?.id);
    expect(next?.power?.complete).toBe(true);
    expect(next?.power?.window.startS).toBeGreaterThanOrEqual(run?.power?.window.endS ?? Number.POSITIVE_INFINITY);
  });

  it('marks a run that was mid-flight at a checkpoint incomplete after the reload', () => {
    const svc = boot();
    const s = svc.workloads?.start(CARD, SKYLINK_SERVICE);
    tick(40);
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(frontlineScenario2Data);
    restoreManagerStates(saved);
    tick(130);
    const run = again.workloads?.getRuns().find((r) => r.id === (s?.ok ? s.run.id : ''));
    expect(run?.power?.complete).not.toBe(true);
  });
});
