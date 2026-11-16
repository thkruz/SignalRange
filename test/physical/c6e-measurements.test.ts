/**
 * Package E: measured jitter (S11) and measured recovery interval (S14), plus the S15 reboot-made drop filter.
 * Jitter is a pure function of scenario time; the S14 interval is stamped to the second whatever the skip size.
 */

import { FORWARD_EUROSAT_SERVICE } from '@app/campaigns/frontline/forward-field-config';
import { interruptionPattern } from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenario14Data, S14_INTERVAL_RESTORATION } from '@app/campaigns/frontline/scenario14';
import { frontlineScenario15Data } from '@app/campaigns/frontline/scenario15';
import { EventBus } from '@app/events/event-bus';
import { type PhysicalPlantService, PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { JITTER_MIN_SAMPLES, windowJitter } from '@app/physical/rtt-jitter';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, conditionMet, tick } from '../campaigns/frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const EUS = FORWARD_EUROSAT_SERVICE;
const IV = S14_INTERVAL_RESTORATION;
const jitterNow = (svc: PhysicalPlantService) => svc.services?.peekSample(EUS, 'registration', 'terminal-app', undefined, 'jitterMs');
const reset = (): void => {
  Service.destroy();
  EventBus.destroy();
  SimClock.reset();
  objectives.states.clear();
};

function withSpread(spread: number | undefined) {
  const plant = structuredClone(frontlineScenario14Data.settings?.physicalPlant);
  for (const p of plant?.service?.paths ?? []) {
    if (p.id === EUS) {
      const profile = p.profile as { rttSpreadMs?: number };
      if (spread === undefined) delete profile.rttSpreadMs;
      else profile.rttSpreadMs = spread;
    }
  }

  return { settings: { physicalPlant: plant } } as unknown as typeof frontlineScenario14Data;
}

function runCard(svc: PhysicalPlantService, card: Parameters<NonNullable<PhysicalPlantService['workloads']>['ensureCard']>[0]) {
  svc.workloads?.ensureCard(card);
  const s = svc.workloads?.start(card.id, EUS);

  return svc.workloads?.waitForRun(s?.ok ? s.run.id : '');
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(14);
  objectives.states.clear();
  localStorage.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('windowJitter', () => {
  it('is a pure function of time and seed', () => {
    expect(windowJitter(100, 10, 5, 120)).toEqual(windowJitter(100, 10, 5, 120));
    expect(windowJitter(100, 10, 5, 120)).not.toEqual(windowJitter(100, 10, 6, 120));
  });
  it('sits near two thirds of the spread and scales with it', () => {
    const a = windowJitter(100, 30, 3, 300)?.jitterMs ?? 0;
    const b = windowJitter(100, 3, 3, 300)?.jitterMs ?? 0;
    expect(a).toBeGreaterThan(30 * 0.45);
    expect(a).toBeLessThan(30 * 0.9);
    expect(a / b).toBeCloseTo(10, 5);
  });
  it('is zero for no spread and unavailable with too few samples', () => {
    expect(windowJitter(100, 0, 3, 100)?.jitterMs).toBe(0);
    expect(windowJitter(100, 10, 3, JITTER_MIN_SAMPLES - 2)).toBeNull();
    expect(windowJitter(100, 10, 3, JITTER_MIN_SAMPLES)).not.toBeNull();
  });
  it('clamps the window at second 0', () => {
    expect(windowJitter(100, 10, 3, 30)?.windowS).toBe(30);
    expect(windowJitter(100, 10, 3, 500)?.windowS).toBe(60);
  });
});

describe('jitter in the service model', () => {
  it('reads the same at a given time after a coarse skip and one-second steps', () => {
    const stepped = bootScenario(frontlineScenario14Data);
    tick(200);
    const a = jitterNow(stepped);
    reset();
    const skipped = bootScenario(frontlineScenario14Data);
    SimClock.skip(200_000);
    skipped.catchUp();
    const b = jitterNow(skipped);
    expect(typeof a?.value).toBe('number');
    expect(b?.value).toBe(a?.value);
    expect(a?.windowS).toBe(60);
  });

  it('is unavailable early, never zero', () => {
    const svc = bootScenario(frontlineScenario14Data);
    tick(3);
    expect(jitterNow(svc)?.value).toBe('unknown');
  });

  it('is unavailable for a path with no authored spread, and a jitter-limited card fails closed', () => {
    const svc = bootScenario(withSpread(undefined));
    tick(120);
    expect(jitterNow(svc)?.value).toBe('unknown');
    const r = runCard(svc, { id: 'jit', version: 1, label: 'Jitter', maxJitterMs: 20, windowS: 10, priority: 'mission' });
    expect(r?.status).not.toBe('supported');
    expect(JSON.stringify(r?.unmet)).toContain('jitterMs');
  });

  it('separates two paths with equal mean RTT and throughput by their spread', () => {
    const outcome = (spread: number) => {
      const svc = bootScenario(withSpread(spread));
      tick(130);
      const r = runCard(svc, { id: 'jit', version: 1, label: 'Jitter', maxJitterMs: 20, windowS: 10, priority: 'mission' });
      reset();

      return r?.status;
    };
    expect(outcome(6)).toBe('supported');
    expect(outcome(90)).not.toBe('supported');
  });

  it('leaves cards without a jitter limit unchanged', () => {
    const svc = bootScenario(frontlineScenario14Data);
    tick(130);
    const r = runCard(svc, { id: 'plain', version: 1, label: 'Plain', maxRttMs: 5000, windowS: 10, priority: 'mission' });
    expect(JSON.stringify(r?.unmet ?? [])).not.toContain('jitterMs');
  });
});

describe('S14 recovery interval', () => {
  const begin = (delayS: number, coarse: boolean): PhysicalPlantService => {
    const svc = bootScenario(frontlineScenario14Data);
    tick(2);
    svc.plant.setPartMode('vsat-modem', 'standby');
    tick(2);
    // the exercise event fires once its objective is complete
    objectives.states.set('s14-test-readiness', { isActive: true, isCompleted: true });
    tick(1);
    if (delayS > 0) {
      if (coarse) {
        SimClock.skip(delayS * 1000);
        svc.catchUp();
      } else {
        tick(delayS);
      }
    }
    svc.plant.setPartMode('vsat-modem', 'run');
    if (coarse) {
      SimClock.skip(60_000);
      svc.catchUp();
    } else {
      tick(60);
    }

    return svc;
  };

  it('is not opened before the exercise starts', () => {
    const svc = bootScenario(frontlineScenario14Data);
    tick(40);
    expect(svc.services?.interval(IV)).toBeNull();
    expect(svc.services?.intervalSpanS(IV, 'restoration')).toBeNull();
  });

  it('grows with a slower operator', () => {
    const f0 = begin(0, false);
    const fast = f0.services?.intervalSpanS(IV, 'restoration');
    reset();
    const s0 = begin(30, false);
    const slow = s0.services?.intervalSpanS(IV, 'restoration');
    expect(fast).not.toBeNull();
    expect((slow as number) - (fast as number)).toBeGreaterThanOrEqual(28);
  });

  it('matches between a coarse skip and one-second steps', () => {
    const sa = begin(10, false);
    const a = sa.services?.intervalSpanS(IV, 'restoration') as number;
    reset();
    const sb = begin(10, true);
    const b = sb.services?.intervalSpanS(IV, 'restoration') as number;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('survives a checkpoint round trip with its start', () => {
    const svc = begin(5, false);
    const before = svc.services?.interval(IV);
    const nowMs = SimClock.nowMs();
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    reset();
    const again = bootScenario(frontlineScenario14Data);
    SimClock.setScenarioNowMs(nowMs);
    restoreManagerStates(saved);
    expect(again.services?.interval(IV)).toEqual(before);
    expect(before?.usableS).not.toBeNull();
  });

  it('checks a claim to within 2 s and refuses one before the interval closes', () => {
    const form = { id: 'transition' };
    const open = bootScenario(frontlineScenario14Data);
    tick(5);
    const early = open.records?.validate(form?.id ?? '', { restoration: { value: '30' } });
    expect(early?.fields.find((f) => f.key === 'restoration')?.ok).toBe(false);
    reset();
    const svc = begin(0, false);
    const span = svc.services?.intervalSpanS(IV, 'restoration') as number;
    const check = (v: number) => svc.records?.validate(form?.id ?? '', { restoration: { value: String(v) } })?.fields.find((f) => f.key === 'restoration')?.ok;
    expect(check(span + 1.5)).toBe(true);
    expect(check(span + 3)).toBe(false);
  });
});

describe('S15 interruption pattern ignores reboot-made drops', () => {
  const cond = interruptionPattern(EUS, 2, 'x', { reasons: ['link-lost'] });
  const withHistory = (reasons: Array<string | undefined>) => {
    const svc = bootScenario(frontlineScenario15Data);
    tick(1);
    const state = JSON.parse(JSON.stringify(svc.services?.getState()));
    state.history = reasons.flatMap((reason, i) => [
      { tS: i * 100 + 10, serviceId: EUS, layer: 'registration', from: 'up', to: 'down', ...(reason ? { reason } : {}) },
      { tS: i * 100 + 60, serviceId: EUS, layer: 'registration', from: 'down', to: 'up', reason: 'ok' },
    ]);
    const sample = (id: string, layer: string, value: string) => ({
      id,
      serviceId: EUS,
      layer,
      metric: 'status',
      value,
      unit: 'state',
      tS: 5,
      provenance: 'terminal-app',
      configEpoch: 0,
      eventEpoch: 0,
      sessionEpoch: 0,
    });
    state.samples = [sample('a', 'registration', 'down'), sample('b', 'registration', 'up'), sample('c', 'local', 'up')];
    svc.services?.restoreState(state);

    return svc;
  };

  it('does not count terminal-booting drops', () => {
    expect(conditionMet(cond, withHistory(['terminal-booting', 'terminal-booting', 'terminal-booting']))).toBe(false);
  });
  it('counts link-lost drops', () => {
    expect(conditionMet(cond, withHistory(['link-lost', 'link-lost']))).toBe(true);
  });
  it('counts old entries with no recorded reason', () => {
    expect(conditionMet(cond, withHistory([undefined, undefined]))).toBe(true);
  });
  it('keeps reasons through save and restore', () => {
    const svc = withHistory(['link-lost', 'terminal-booting']);
    const saved = JSON.parse(JSON.stringify(svc.services?.getState()));
    expect(saved.history.filter((h: { reason?: string }) => h.reason === 'terminal-booting')).toHaveLength(1);
  });
});
