/**
 * M04 service state core: layer order and reason codes, sample provenance, freshness by age and
 * by config, event and session epoch, moisture flaps in the history, restrictions that outlive a
 * local restart, and the authored link source.
 */

import { AuthoredLinkSource } from '@app/physical/authored-link-source';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { LinkQualitySource, ServiceModelConfig } from '@app/physical/service-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const serviceCfg = (): ServiceModelConfig => ({
  paths: [
    {
      id: 'skylink',
      label: 'SkyLink',
      terminalPartId: 'skylink',
      localPartIds: ['router'],
      accountId: 'acct',
      providerId: 'prov',
      endpointIds: ['hq'],
      linkTargetIds: ['dish-plug'],
      profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
    },
  ],
  accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
  providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
  endpoints: [{ id: 'hq', reachable: true }],
});

function plantConfig(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      {
        id: 'skylink',
        kind: 'terminal',
        label: 'SkyLink',
        poweredBy: 'battery',
        nominalV: 12,
        mode: 'standby',
        modes: [
          { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
          { id: 'active', label: 'Active', loadW: 50, servesTraffic: true },
        ],
      },
    ],
    connectors: [{ id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' }],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
  };
}

function rig(link?: LinkQualitySource) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(plantConfig(), {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`m04:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  const model = new ServiceModel(serviceCfg(), plant, link, { now: () => t });
  const tick = (seconds: number): void => {
    for (let i = 0; i < seconds; i++) {
      t += 1;
      plant.update(1);
      model.update();
    }
  };
  // Boot time passes so the dish is not rebooting at t0
  plant.update(1);

  return { plant, model, tick, now: () => t, advance: (s: number) => (t += s) };
}

const reading = (model: ServiceModel, layer: string) => model.layers('skylink').find((l) => l.layer === layer);

describe('M04 layer order and reasons', () => {
  it('lists the layers in order and the standby terminal fails registration with mode-standby', () => {
    const { model } = rig();
    expect(model.layers('skylink').map((l) => l.layer)).toEqual(['power', 'local', 'registration', 'account', 'provider', 'application']);
    expect(reading(model, 'power')?.status).toBe('up');
    expect(reading(model, 'registration')).toMatchObject({ status: 'down', reason: 'mode-standby' });
    expect(model.firstFailure('skylink')?.layer).toBe('registration');
  });

  it('an active terminal brings the whole path up', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    expect(model.firstFailure('skylink')).toBeNull();
  });

  it('local reasons come from the local parts', () => {
    const fake = fakePlant({ unpowered: ['router'] });
    const model = new ServiceModel(serviceCfg(), fake, undefined, { now: () => 0 });
    expect(model.layers('skylink').find((l) => l.layer === 'local')).toMatchObject({ status: 'down', reason: 'local-unpowered', subjectId: 'router' });
    expect(model.layers('skylink').find((l) => l.layer === 'application')).toMatchObject({ status: 'down', reason: 'upstream-local' });
  });

  it('a terminal with no supply is a power failure and registration says upstream-power', () => {
    const fake = fakePlant({ unpowered: ['skylink'] });
    const model = new ServiceModel(serviceCfg(), fake, undefined, { now: () => 0 });
    expect(model.layers('skylink')[0]).toMatchObject({ layer: 'power', status: 'down', reason: 'no-power' });
    expect(model.layers('skylink')[2]).toMatchObject({ status: 'down', reason: 'upstream-power' });
  });

  it('a restricted account is degraded and a provider outage is down', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    model.setAccount({ id: 'acct', restriction: 'ground-capacity', capacityFactor: 0.4 });
    expect(reading(model, 'account')).toMatchObject({ status: 'degraded', reason: 'account-ground-capacity' });
    expect(reading(model, 'application')?.status).toBe('degraded');
    model.setProvider({ id: 'prov', status: 'outage' });
    expect(reading(model, 'provider')).toMatchObject({ status: 'down', reason: 'provider-outage' });
    expect(reading(model, 'application')).toMatchObject({ status: 'down', reason: 'upstream-provider' });
  });

  it('an unreachable endpoint downs the application layer only', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    model.setEndpoint({ id: 'hq', reachable: false });
    expect(
      model
        .layers('skylink')
        .filter((l) => l.status !== 'up')
        .map((l) => l.layer)
    ).toEqual(['application']);
  });

  it('a local restart never clears account or endpoint restrictions', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    model.setAccount({ id: 'acct', restriction: 'ground-capacity', capacityFactor: 0.4 });
    model.setEndpoint({ id: 'hq', reachable: true, policy: 'mobility-restricted' });
    // Reboot the router and the terminal
    const result = plant.powerCycle('router');
    expect(result.downtimeSeconds ?? 0).toBeGreaterThan(0);
    tick(200);
    expect(model.getAccount('acct')?.restriction).toBe('ground-capacity');
    expect(reading(model, 'account')?.status).toBe('degraded');
    expect(model.getEndpoint('hq')?.policy).toBe('mobility-restricted');
    expect(reading(model, 'application')?.status).toBe('degraded');
  });
});

describe('M04 samples', () => {
  it('a device indicator cannot read the application layer, account or provider', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    for (const layer of ['application', 'account', 'provider'] as const) {
      const s = model.takeSample('skylink', layer, 'device-indicator');
      expect(s.value).toBe('unknown');
      expect(model.freshness(s)).toBe('unavailable');
    }
    expect(model.takeSample('skylink', 'registration', 'device-indicator').value).toBe('up');
  });

  it('peekSample observes the same value but records nothing and notifies no one', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    let heard = 0;
    model.onSample(() => {
      heard += 1;
    });
    const peeked = model.peekSample('skylink', 'registration', 'terminal-app');
    expect(peeked.value).toBe('up');
    expect(heard).toBe(0);
    expect(model.latest('skylink', 'registration')).toBeNull();
    expect(model.takeSample('skylink', 'registration', 'terminal-app').value).toBe(peeked.value);
    expect(heard).toBe(1);
  });

  it('only a workload run or endpoint report reads the application layer', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    expect(model.takeSample('skylink', 'application', 'terminal-app').value).toBe('unknown');
    expect(model.takeSample('skylink', 'application', 'workload-run').value).toBe('up');
    model.setEndpoint({ id: 'hq', reachable: false });
    expect(model.takeSample('skylink', 'application', 'endpoint-report', 'hq').value).toBe('down');
  });

  it('numeric metrics come from the authored link, scaled by capacity', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    expect(model.takeSample('skylink', 'registration', 'local-probe', undefined, 'downMbps').value).toBe(100);
    model.setAccount({ id: 'acct', capacityFactor: 0.5 });
    const s = model.takeSample('skylink', 'application', 'workload-run', undefined, 'downMbps');
    expect(s).toMatchObject({ value: 50, unit: 'Mbps', metric: 'downMbps' });
    expect(model.takeSample('skylink', 'registration', 'local-probe', undefined, 'rttMs').value).toBe(40);
  });

  it('the link source can be replaced (SDK seam) and its answer is used as is', () => {
    const sdk: LinkQualitySource = { sample: () => ({ downMbps: 7, upMbps: 1, rttMs: 600, lossPct: 3, provenance: 'sdk' }) };
    const { model } = rig(sdk);
    expect(model.takeSample('skylink', 'registration', 'local-probe', undefined, 'rttMs').value).toBe(600);
  });

  it('a down terminal yields no link profile', () => {
    const { model } = rig();
    expect(model.takeSample('skylink', 'registration', 'local-probe', undefined, 'downMbps').value).toBe('down');
  });

  it('AuthoredLinkSource returns null when a traffic layer is down and a profile otherwise', () => {
    const cfg = serviceCfg();
    const src = new AuthoredLinkSource({
      path: () => cfg.paths[0],
      layers: () => [{ layer: 'registration', status: 'down', reason: 'x' }],
      account: () => cfg.accounts[0],
      provider: () => cfg.providers[0],
    });
    expect(src.sample('skylink', 0)).toBeNull();
    const up = new AuthoredLinkSource({
      path: () => cfg.paths[0],
      layers: () => [],
      account: () => ({ ...cfg.accounts[0], capacityFactor: 0.5 }),
      provider: () => ({ ...cfg.providers[0], capacityFactor: 0.5 }),
    });
    expect(up.sample('skylink', 0)).toMatchObject({ downMbps: 25, upMbps: 5, provenance: 'authored' });
  });
});

describe('M04 freshness', () => {
  const live = () => {
    const r = rig();
    r.plant.setPartMode('skylink', 'active');
    r.tick(1);

    return r;
  };

  it('is current, then stale by age', () => {
    const { model, advance } = live();
    const s = model.takeSample('skylink', 'registration', 'local-probe');
    expect(model.freshness(s)).toBe('current');
    advance(s.maxAgeS + 1);
    expect(model.freshness(s)).toBe('stale');
  });

  it('a config epoch bump invalidates', () => {
    const { model } = live();
    const s = model.takeSample('skylink', 'registration', 'local-probe');
    model.bumpConfig('test');
    expect(model.freshness(s)).toBe('invalidated');
  });

  it('an event epoch bump invalidates', () => {
    const { model } = live();
    const s = model.takeSample('skylink', 'provider', 'provider-portal');
    model.bumpEvent('evt');
    expect(model.freshness(s)).toBe('invalidated');
  });

  it('a mode change on the plant bumps the config epoch', () => {
    const { model, plant } = live();
    const s = model.takeSample('skylink', 'registration', 'local-probe');
    plant.setPartMode('skylink', 'standby');
    expect(model.freshness(s)).toBe('invalidated');
  });

  it('a restore starts a new session so earlier samples read stale', () => {
    const { model } = live();
    const s = model.takeSample('skylink', 'registration', 'local-probe');
    const saved = JSON.parse(JSON.stringify(model.getState()));
    model.restoreState(saved);
    expect(model.freshness(s)).toBe('stale');
    expect(model.getEpochs().session).toBe(1);
    expect(model.freshness(model.takeSample('skylink', 'registration', 'local-probe'))).toBe('current');
    expect(model.latest('skylink', 'registration')).not.toBeNull();
  });

  it('keeps account state across a checkpoint', () => {
    const { model } = live();
    model.setAccount({ id: 'acct', authorized: false });
    const saved = JSON.parse(JSON.stringify(model.getState()));
    model.setAccount({ id: 'acct', authorized: true });
    model.restoreState(saved);
    expect(model.getAccount('acct')?.authorized).toBe(false);
  });
});

describe('M04 history', () => {
  it('moisture on the dish plug produces timed registration flaps from one seeded fault', () => {
    const { model, plant, tick } = rig();
    plant.setPartMode('skylink', 'active');
    tick(1);
    plant.injectFault({ id: 'wet', target: 'dish-plug', kind: 'moisture', severity: 1 });
    tick(300);
    const flaps = model.history('skylink').filter((h) => h.layer === 'registration');
    expect(flaps.filter((h) => h.to === 'down').length).toBeGreaterThanOrEqual(2);
    expect(flaps.filter((h) => h.to === 'up').length).toBeGreaterThanOrEqual(2);
    expect(flaps[0]).toMatchObject({ from: 'up', to: 'down' });
    expect(new Set(flaps.map((f) => f.tS)).size).toBe(flaps.length);
    expect(flaps.filter((h) => h.to === 'down').length).toBeLessThanOrEqual(4);
    plant.seal('dish-plug');
    tick(100);
    expect(reading(model, 'registration')?.status).toBe('up');
  });
});

/** Minimal plant double for reason-code tests */
function fakePlant(opts: { unpowered?: string[] }) {
  const unpowered = new Set(opts.unpowered ?? []);

  return {
    getTimeSeconds: () => 0,
    isPartPowered: (id: string) => !unpowered.has(id),
    isLinkDropped: () => false,
    getPartMode: () => undefined,
    modeServesTraffic: () => true,
    isStarting: () => false,
    getPartState: (id: string) => ({ powered: !unpowered.has(id), rebooting: false }),
    isFaultActive: () => false,
  };
}

describe('M04 forecast mapping', () => {
  it('maps forecast part ids to service ids', () => {
    const { model } = rig();
    expect(model.servicesForParts(['skylink', 'other'])).toEqual(['skylink']);
    expect(model.servicesForParts(['other'])).toEqual([]);
  });
});
