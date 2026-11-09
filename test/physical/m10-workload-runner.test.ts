/**
 * M10 workload runner: assess without a run, profile comparison with the remote leg, bounded
 * runs on the scenario clock, shared capacity by priority, invalidation by epoch and card
 * version, checkpoint restore, and the service wiring.
 */

import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { WorkloadRunner } from '@app/physical/workload-runner';
import type { RequirementCard } from '@app/physical/workload-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const serviceCfg = (): ServiceModelConfig => ({
  paths: [
    {
      id: 'skylink',
      label: 'Skylink',
      terminalPartId: 'skylink',
      localPartIds: ['router'],
      accountId: 'acct',
      providerId: 'prov',
      profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
    },
    {
      id: 'eurosat',
      label: 'EuroSat',
      terminalPartId: 'skylink',
      localPartIds: ['router'],
      accountId: 'acct',
      providerId: 'prov',
      profile: { downMbps: 60, upMbps: 10, rttMs: 600, lossPct: 0.1 },
      remoteLeg: { kind: 'radio', rttMs: 50, downMbps: 40 },
    },
  ],
  accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
  providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
});

const plantConfig = (): PlantConfig => ({
  parts: [
    { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
    { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
    {
      id: 'skylink',
      kind: 'terminal',
      label: 'Skylink',
      poweredBy: 'battery',
      nominalV: 12,
      mode: 'active',
      modes: [
        { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
        { id: 'active', label: 'Active', loadW: 50, servesTraffic: true },
      ],
    },
  ],
  connectors: [],
  cables: [],
});

const CARDS: RequirementCard[] = [
  { id: 'video', version: 1, label: 'Video', minDownMbps: 30, maxRttMs: 100, windowS: 60, priority: 'mission' },
  { id: 'bulk', version: 1, label: 'Bulk', minDownMbps: 50, windowS: 120, priority: 'background' },
  { id: 'chat', version: 1, label: 'Chat', minDownMbps: 1, maxRttMs: 800, windowS: 30, priority: 'routine' },
];

function rig() {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(plantConfig(), {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`m10:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  const model = new ServiceModel(serviceCfg(), plant, undefined, { now: () => t });
  const runner = new WorkloadRunner({ cards: CARDS }, model, {
    now: () => t,
    skip: (s) => {
      t += s;
      plant.update(s);
      model.update();
    },
  });
  const tick = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant.update(1);
      model.update();
      runner.update();
    }
  };
  plant.update(1);

  return { plant, model, runner, tick, now: () => t };
}

describe('M10 assess and compare', () => {
  it('supports a service that meets every bound and names the unmet metric otherwise', () => {
    const { runner } = rig();
    expect(runner.assess('video', 'skylink')?.status).toBe('supported');
    const bulk = runner.assess('bulk', 'skylink');
    expect(bulk?.status).toBe('supported');
    // EuroSat: remote leg caps the rate at 40 and adds 50 ms; bulk needs 50, 40 is 20 % short
    const euroBulk = runner.assess('bulk', 'eurosat');
    expect(euroBulk?.status).toBe('degraded');
    expect(euroBulk?.unmet).toEqual(['downMbps']);
    expect(euroBulk?.effective).toMatchObject({ downMbps: 40, rttMs: 650 });
    const euroVideo = runner.assess('video', 'eurosat');
    expect(euroVideo?.status).toBe('unsupported');
    expect(euroVideo?.unmet).toEqual(['rttMs']);
  });

  it('compares one card across services and ignores unknown ones', () => {
    const { runner } = rig();
    const cmp = runner.compare('chat', ['skylink', 'eurosat', 'nope']);
    expect(cmp.map((a) => [a.serviceId, a.status])).toEqual([
      ['skylink', 'supported'],
      ['eurosat', 'supported'],
    ]);
    expect(runner.assess('missing', 'skylink')).toBeNull();
  });

  it('reads unsupported with a layer reason when a layer is down', () => {
    const { runner, plant } = rig();
    plant.setPartMode('skylink', 'standby');
    const a = runner.assess('chat', 'skylink');
    expect(a?.status).toBe('unsupported');
    expect(a?.reason.startsWith('layer:')).toBe(true);
    expect(a?.effective).toBeNull();
  });

  it('sees a provider capacity cut in the effective rate', () => {
    const { runner, model } = rig();
    model.setProvider({ id: 'prov', capacityFactor: 0.25 });
    expect(runner.assess('video', 'skylink')?.effective?.downMbps).toBe(25);
    expect(runner.assess('video', 'skylink')?.status).toBe('degraded');
  });
});

describe('M10 runs', () => {
  it('runs for its window on the scenario clock and ends supported with workload-run samples', () => {
    const { runner, model, tick } = rig();
    const res = runner.start('video', 'skylink');
    expect(res.ok).toBe(true);
    const id = res.ok ? res.run.id : '';
    tick(59);
    expect(runner.getRun(id)?.status).toBe('running');
    tick(1);
    const run = runner.getRun(id);
    expect(run?.status).toBe('supported');
    expect(run?.sampleIds.length).toBe(3);
    const sample = model.latest('skylink', 'application');
    expect(sample?.provenance).toBe('workload-run');
    expect(model.freshness(sample!)).toBe('current');
    expect(runner.runs().some((r) => r.cardId === 'video' && r.status === 'supported')).toBe(true);
  });

  it('keeps the worst suitability seen during the window', () => {
    const { runner, model, tick } = rig();
    const id = (runner.start('video', 'skylink') as { run: { id: string } }).run.id;
    tick(20);
    model.setProvider({ id: 'prov', capacityFactor: 0.1 });
    tick(5);
    model.setProvider({ id: 'prov', capacityFactor: 1 });
    tick(40);
    const run = runner.getRun(id);
    // Provider change is not a config bump, so the run finishes with its worst reading
    expect(run?.status).toBe('unsupported');
    expect(run?.unmet).toContain('downMbps');
  });

  it('rejects unknown cards, unknown services and duplicate runs', () => {
    const { runner } = rig();
    expect(runner.start('x', 'skylink')).toEqual({ ok: false, reason: 'unknown-card' });
    expect(runner.start('video', 'x')).toEqual({ ok: false, reason: 'unknown-service' });
    runner.start('video', 'skylink');
    expect(runner.start('video', 'skylink')).toEqual({ ok: false, reason: 'already-running' });
  });

  it('waitForRun burns the remaining window and finishes', () => {
    const { runner, now } = rig();
    const t0 = now();
    const id = (runner.start('chat', 'skylink') as { run: { id: string } }).run.id;
    expect(runner.waitForRun(id)?.status).toBe('supported');
    expect(now() - t0).toBe(30);
  });

  it('aborts on request', () => {
    const { runner } = rig();
    const id = (runner.start('chat', 'skylink') as { run: { id: string } }).run.id;
    expect(runner.abort(id)).toBe(true);
    expect(runner.getRun(id)?.status).toBe('aborted');
    expect(runner.abort(id)).toBe(false);
  });
});

describe('M10 shared capacity and priority', () => {
  it('splits the rate by priority weight while runs overlap', () => {
    const { runner } = rig();
    runner.start('video', 'skylink');
    const bulk = (runner.start('bulk', 'skylink') as { run: { id: string } }).run;
    // mission 4 + background 1: bulk gets 20 %, 20 Mbps against a 50 needed
    expect(runner.shareOf(bulk as never)).toBeCloseTo(0.2);
    expect(runner.getRun(bulk.id)?.worst).toBe('unsupported');
    expect(runner.getRun(bulk.id)?.unmet).toEqual(['downMbps']);
  });

  it('lets the player raise the background weight', () => {
    const { runner } = rig();
    runner.setPriority('bulk', 4);
    runner.start('video', 'skylink');
    const bulk = (runner.start('bulk', 'skylink') as { run: { id: string } }).run;
    expect(runner.shareOf(bulk as never)).toBeCloseTo(0.5);
    // 50 Mbps share meets the bound exactly
    expect(runner.getRun(bulk.id)?.worst).toBe('supported');
    // video now only gets 50 against 30 needed
    expect(runner.getPriority('video')).toBe(4);
  });

  it('a run alone has full capacity', () => {
    const { runner } = rig();
    const bulk = (runner.start('bulk', 'skylink') as { run: { id: string } }).run;
    expect(runner.shareOf(bulk as never)).toBe(1);
  });
});

describe('M10 invalidation', () => {
  it('aborts a running run when the configuration changes under it', () => {
    const { runner, model, tick } = rig();
    const id = (runner.start('video', 'skylink') as { run: { id: string } }).run.id;
    tick(10);
    model.bumpConfig('test');
    tick(1);
    const run = runner.getRun(id);
    expect(run?.status).toBe('aborted');
    expect(run?.invalidatedBy).toBe('config');
  });

  it('invalidates a finished run when an event fires afterwards', () => {
    const { runner, model, tick } = rig();
    const id = (runner.start('chat', 'skylink') as { run: { id: string } }).run.id;
    tick(30);
    expect(runner.getRun(id)?.invalidatedBy).toBeUndefined();
    model.bumpEvent('storm');
    tick(1);
    expect(runner.getRun(id)?.status).toBe('supported');
    expect(runner.getRun(id)?.invalidatedBy).toBe('event');
  });

  it('a card revision bumps its version and invalidates older runs', () => {
    const { runner, tick } = rig();
    const id = (runner.start('chat', 'skylink') as { run: { id: string } }).run.id;
    tick(30);
    const next = runner.reviseCard({ id: 'chat', minDownMbps: 90 });
    expect(next?.version).toBe(2);
    expect(runner.getRun(id)?.invalidatedBy).toBe('card-version');
    expect(runner.assess('chat', 'skylink')?.cardVersion).toBe(2);
    expect(runner.reviseCard({ id: 'nope' })).toBeNull();
  });
});

describe('M10 checkpoint', () => {
  it('restores a running run as aborted by reload and stops counting finished runs', () => {
    const { runner, model, tick, plant, now } = rig();
    runner.start('chat', 'skylink');
    tick(30);
    runner.start('video', 'skylink');
    runner.setPriority('bulk', 3);
    const state = JSON.parse(JSON.stringify(runner.getState()));
    const fresh = new WorkloadRunner({ cards: CARDS }, model, { now });
    fresh.restoreState(state);
    void plant;
    const runs = fresh.getRuns();
    expect(runs.map((r) => r.status)).toEqual(['supported', 'aborted']);
    expect(runs.every((r) => r.invalidatedBy === 'reload')).toBe(true);
    expect(fresh.getPriority('bulk')).toBe(3);
    expect(fresh.runs().some((r) => r.status === 'supported' && !r.invalidatedBy)).toBe(false);
  });
});
