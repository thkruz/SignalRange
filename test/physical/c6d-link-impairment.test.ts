/**
 * Package D: the S15 external link impairment. Seeded loss windows on the EuroSat path, driven by scenario
 * time, that a local reboot cannot clear; they are visible at normal UI cadence, survive a checkpoint and a
 * clock jump, and never support an attribution.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { FORWARD_EUROSAT_SERVICE } from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario15Data, S15_EPISODE_S, S15_IMPAIRMENT } from '@app/campaigns/frontline/scenario15';
import { EventBus } from '@app/events/event-bus';
import { AuthoredLinkImpairment } from '@app/physical/link-impairment';
import { type PhysicalPlantService, PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import type { LinkImpairmentConfig } from '@app/physical/service-types';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, tick } from '../campaigns/frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const EUS = FORWARD_EUROSAT_SERVICE;
const cfg: LinkImpairmentConfig = { id: 'x', serviceId: 'svc', seed: 7, periodS: 100, downMinS: 35, downMaxS: 40, jitterS: 20 };

const reg = (svc: PhysicalPlantService) => svc.services?.layers(EUS).find((l) => l.layer === 'registration');
const start = (): PhysicalPlantService => {
  const svc = bootScenario(frontlineScenario15Data);
  objectives.states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
  tick(1);

  return svc;
};
/** Registration truth for the next `n` seconds, one per tick */
const trace = (svc: PhysicalPlantService, n: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    tick(1);
    out.push(`${reg(svc)?.status}:${reg(svc)?.reason}`);
  }

  return out;
};

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(15);
  objectives.states.clear();
  localStorage.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('AuthoredLinkImpairment windows', () => {
  it('is deterministic for a seed, 35 to 40 s long, and keeps clear gaps between windows', () => {
    const a = new AuthoredLinkImpairment([cfg]);
    const b = new AuthoredLinkImpairment([cfg]);
    a.start('x', 1000, 1200);
    b.start('x', 1000, 1200);
    const ea = a.edges('svc', 0, 5000);
    expect(ea).toEqual(b.edges('svc', 0, 5000));
    const downs = ea.filter((e) => e.impaired);
    const ups = ea.filter((e) => !e.impaired);
    expect(downs.length).toBe(12);
    downs.forEach((d, i) => {
      const len = ups[i].tS - d.tS;
      expect(len).toBeGreaterThanOrEqual(35);
      expect(len).toBeLessThanOrEqual(40);
      if (i > 0) expect(d.tS - ups[i - 1].tS).toBeGreaterThanOrEqual(40);
    });
    const other = new AuthoredLinkImpairment([{ ...cfg, seed: 8 }]);
    other.start('x', 1000, 1200);
    expect(other.edges('svc', 0, 5000)).not.toEqual(ea);
  });

  it('reads nothing on another service, before the start and after the episode, and re-arming keeps the windows', () => {
    const a = new AuthoredLinkImpairment([cfg]);
    a.start('x', 100, 300);
    expect(a.at('svc', 99)).toBeNull();
    expect(a.at('svc', 105)).toEqual({ unavailable: true });
    expect(a.at('other', 105)).toBeNull();
    expect(a.at('svc', 401)).toBeNull();
    const before = a.edges('svc', 0, 400);
    a.start('x', 200, 300);
    expect(a.edges('svc', 0, 400)).toEqual(before);
    expect(a.edges('svc', 0, 600).length).toBeGreaterThan(before.length);
    a.stop('x', 250);
    expect(a.at('svc', 255)).toBeNull();
  });

  it('round-trips through its state and ignores unknown ids', () => {
    const a = new AuthoredLinkImpairment([cfg]);
    a.start('x', 10, 500);
    const b = new AuthoredLinkImpairment([cfg]);
    b.restoreState(JSON.parse(JSON.stringify({ episodes: [...a.getState().episodes, { id: 'gone', startS: 0, endS: 9 }] })));
    expect(b.getState()).toEqual(a.getState());
    expect(b.edges('svc', 0, 600)).toEqual(a.edges('svc', 0, 600));
  });
});

describe('S15 link impairment in the service model', () => {
  it('is dormant until the anomaly objective is live and leaves SkyLink and the local network up', () => {
    const svc = bootScenario(frontlineScenario15Data);
    expect(trace(svc, 90).every((r) => r === 'up:ok')).toBe(true);
    objectives.states.set('s15-record-anomaly', { isActive: true, isCompleted: false });
    const seen = trace(svc, 200);
    expect(seen).toContain('down:link-lost');
    expect(seen.every((r) => r === 'up:ok' || r === 'down:link-lost')).toBe(true);
    expect(svc.services?.layers(EUS).find((l) => l.layer === 'local')?.status).toBe('up');
    expect(svc.services?.layers(SKYLINK_SERVICE).every((l) => l.status === 'up')).toBe(true);
    expect(svc.services?.history(SKYLINK_SERVICE)).toEqual([]);
  });

  it('shows a loss window to a player who reads the registration every 30 s', () => {
    const svc = start();
    const reads: string[] = [];
    for (let i = 0; i < 12; i++) {
      tick(30);
      reads.push(String(svc.services?.takeSample(EUS, 'registration', 'terminal-app').value));
    }
    const first = reads.indexOf('down');
    expect(first).toBeGreaterThanOrEqual(0);
    // An up reading between two down readings: two separate windows seen
    const afterUp = reads.slice(first).join(',').includes('down,up,down') || reads.slice(first).join(',').includes('down,up,up,down');
    expect(afterUp).toBe(true);
  });

  it('is not cleared by a local modem reboot, and the windows still come without any reboot', () => {
    const svc = start();
    trace(svc, 120);
    while (reg(svc)?.status !== 'up') tick(1);
    svc.plant.startBoot('vsat-modem');
    const afterReboot = trace(svc, 400);
    expect(afterReboot).toContain('down:terminal-booting');
    expect(afterReboot.filter((r) => r === 'down:link-lost').length).toBeGreaterThan(30);
    expect(svc.plant.getPartState('vsat-modem')?.rebooting).toBe(false);
    // The registration history before the reboot already holds drops that were never a boot
    const reasons = new Set<string>();
    for (let i = 0; i < 300; i++) {
      tick(1);
      reasons.add(`${reg(svc)?.status}:${reg(svc)?.reason}`);
    }
    expect(reasons.has('down:link-lost')).toBe(true);
    expect(reasons.has('down:terminal-booting')).toBe(false);
  });

  it('keeps the same windows after a restore from mid-episode', () => {
    const control = start();
    trace(control, 150);
    const savedNowMs = SimClock.nowMs();
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    const expected = trace(control, 300);
    Service.destroy();
    EventBus.destroy();
    const again = bootScenario(frontlineScenario15Data);
    SimClock.setScenarioNowMs(savedNowMs);
    restoreManagerStates(saved);
    expect(trace(again, 300)).toEqual(expected);
    expect(expected).toContain('down:link-lost');
  });

  it('records alternating history edges for windows crossed by a large clock jump, in time order', () => {
    const svc = start();
    trace(svc, 20);
    const before = svc.services?.history(EUS).filter((e) => e.layer === 'registration').length ?? 0;
    SimClock.skip(900_000);
    svc.catchUp();
    const edges = (svc.services?.history(EUS) ?? []).filter((e) => e.layer === 'registration').slice(before);
    expect(edges.length).toBeGreaterThanOrEqual(10);
    expect(edges.map((e) => e.tS)).toEqual([...edges.map((e) => e.tS)].sort((a, b) => a - b));
    edges.slice(1).forEach((e, i) => expect(e.from).toBe(edges[i].to));
    expect(S15_EPISODE_S).toBeLessThan(2000);
    expect(S15_IMPAIRMENT).toBe('s15-eurosat-link-loss');
  });
});
