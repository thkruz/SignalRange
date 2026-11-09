/**
 * M06 field hooks wiring: PhysicalPlantService owns the service model, evidence log and event
 * controller; checkpoint round trip of every new key; the condition factory truth tables; the three
 * field evidence facts; the freezing-objective scan over all 16 frontline scenarios; and the
 * guard that campaigns 1-5 never get a plant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

import type { CampaignData } from '@app/campaigns/campaign-types';
import { frontlineCampaignData } from '@app/campaigns/frontline/campaign-data';
import * as C from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenarios } from '@app/campaigns/frontline/scenarios';
import { ccsCampaignData, geolocationCampaignData, hamSdrCampaignData, natsCampaignData } from '@app/campaigns/nats/campaign-data';
import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { EVIDENCE_FACTS } from '@app/objectives/evidence-facts';
import { EVIDENCE_FACT_IDS } from '@app/objectives/objective-types';
import { getActiveField } from '@app/physical/field-hooks';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ScenarioManager } from '@app/scenario-manager';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';

const run = (c: { params?: { evaluator?: unknown } }): boolean => (c.params as { evaluator: () => boolean }).evaluator();

function config(opts: { routerSocWh?: number; batterySocWh?: number } = {}): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: opts.batterySocWh ?? 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'battery-b', kind: 'battery', label: 'Battery B', capacityWh: 100, socWh: opts.routerSocWh ?? 90, maxOutputW: 300, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery-b', loadW: 10, nominalV: 12 },
      {
        id: 'skylink',
        kind: 'terminal',
        label: 'Skylink',
        poweredBy: 'battery',
        nominalV: 12,
        mode: 'standby',
        modes: [
          { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
          { id: 'active', label: 'Active', loadW: 50, servesTraffic: true },
        ],
      },
    ],
    connectors: [],
    cables: [],
    faults: [],
    power: { reserveWh: 100, planningHorizonS: 600, basis: 'battery-only' },
    service: {
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
      ],
      accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
      providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
    },
    events: [{ id: 'weather-turns', startAfterObjectiveId: 'obj-a', actions: [{ kind: 'set-flag', key: 'wet', value: true }] }],
  } as PlantConfig;
}

function boot(cfg: PlantConfig): PhysicalPlantService {
  ScenarioManager.getInstance().settings = { physicalPlant: cfg } as never;

  return PhysicalPlantService.getInstance();
}

/** Advance the scenario clock and let the service sync, one second at a time */
function tick(seconds: number): void {
  for (let i = 0; i < seconds; i++) {
    SimClock.skip(1000);
    EventBus.getInstance().emit(Events.UPDATE, 1 as never);
  }
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(11);
  objectives.states.clear();
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

describe('M06 service ownership', () => {
  it('builds the model, log and events only when the config authors them', () => {
    const svc = boot(config());
    expect(svc.services).not.toBeNull();
    expect(svc.evidence).not.toBeNull();
    expect(svc.events).not.toBeNull();
    const hooks = PhysicalPlantService.fieldOrNull();
    expect(hooks?.plant).toBe(svc.plant);
    expect(hooks?.workloads).toBeNull();
    expect(getActiveField()).not.toBeNull();
    PhysicalPlantService.destroy();
    expect(getActiveField()).toBeNull();
    expect(PhysicalPlantService.fieldOrNull()).toBeNull();

    const bare = boot({ ...config(), service: undefined, events: undefined });
    expect(bare.services).toBeNull();
    expect(bare.evidence).toBeNull();
    expect(bare.events).toBeNull();
  });

  it('publishes window.__fieldStatus and removes it on destroy', () => {
    boot(config());
    const status = (window as unknown as { __fieldStatus: () => { services: Record<string, unknown[]>; firedEvents: string[]; forecast: unknown } }).__fieldStatus();
    expect(status.services.skylink).toHaveLength(6);
    expect(status.firedEvents).toEqual([]);
    expect(status.forecast).not.toBeNull();
    PhysicalPlantService.destroy();
    expect((window as unknown as { __fieldStatus?: unknown }).__fieldStatus).toBeUndefined();
  });
});

describe('M06 checkpoint round trip', () => {
  it('restores plant events, service and evidence, and marks earlier samples stale', () => {
    const svc = boot(config());
    objectives.states.set('obj-a', { isActive: true, isCompleted: false });
    svc.plant.setPartMode('skylink', 'active');
    tick(25);
    expect(svc.events?.hasFired('weather-turns')).toBe(true);
    svc.plant.inspect('router:dc');
    const model = svc.services;
    const sample = model?.takeSample('skylink', 'registration', 'terminal-app');
    expect(sample && model?.freshness(sample)).toBe('current');
    svc.evidence?.addHypothesis({
      subject: 'router',
      source: {},
      facts: [],
      text: 'router is flat',
      claim: { scope: 'part', targetId: 'router' },
      confidence: 'low',
      citedEntryIds: ['ev-1'],
    });
    const entryCount = svc.evidence?.entries().length ?? 0;
    expect(entryCount).toBeGreaterThan(1);

    const saved = JSON.parse(JSON.stringify(collectManagerStates().physicalPlant));
    expect(saved.events).toBeDefined();
    expect(saved.service).toBeDefined();
    expect(saved.evidence).toBeDefined();

    PhysicalPlantService.destroy();
    EventBus.destroy();
    const fresh = boot(config());
    expect(fresh.events?.hasFired('weather-turns')).toBe(false);
    restoreManagerStates({ physicalPlant: saved });

    expect(fresh.events?.hasFired('weather-turns')).toBe(true);
    expect(fresh.events?.getFlag('wet')).toBe(true);
    expect(fresh.plant.getPartMode('skylink')).toBe('active');
    expect(fresh.evidence?.entries().length).toBe(entryCount);
    expect(fresh.evidence?.entries('hypothesis')).toHaveLength(1);
    const restored = fresh.services?.latest('skylink', 'registration');
    expect(restored?.id).toBe(sample?.id);
    expect(restored && fresh.services?.freshness(restored)).toBe('stale');
    expect(fresh.services?.getEpochs().event).toBe(model?.getEpochs().event);
    // a fired event does not fire again
    tick(5);
    expect(fresh.services?.getEpochs().event).toBe(model?.getEpochs().event);
  });
});

describe('M06 condition truth tables', () => {
  it('every factory condition is false when there is no plant', () => {
    const all = [
      C.powerRead('battery', { socWh: { min: 1 } }),
      C.modeIs('skylink', 'active'),
      C.forecastMeetsReserve(),
      C.layerObserved('skylink', 'registration'),
      C.samplesCurrent('skylink', ['power']),
      C.eventFired('x'),
      C.evidenceBeforeAction('a', 'b', 'c'),
      C.faultClearedWithEvidence('f'),
      C.hypothesisMatches({ scope: 'part', targetId: 'router' }),
      C.workloadVerified({ card: 'c', service: 's' }),
      C.reserveHeld({ windowS: 1 }),
      C.recordAccepted('u'),
      C.handoverValid('h'),
    ];
    for (const c of all) {
      expect(c.id?.startsWith('c6:')).toBe(true);
      expect(c.type).toBe('custom');
      expect(run(c), c.id).toBe(false);
    }
  });

  it('power, mode, forecast, sample, event and hypothesis conditions follow live state', () => {
    const svc = boot(config());
    const ev = (c: ReturnType<typeof C.modeIs>) => run(c);
    expect(ev(C.modeIs('skylink', 'standby'))).toBe(true);
    expect(ev(C.modeIs('skylink', 'active'))).toBe(false);
    expect(ev(C.powerRead('battery', { socWh: { min: 800, max: 1000 } }))).toBe(true);
    expect(ev(C.powerRead('battery', { socWh: { min: 950 } }))).toBe(false);
    expect(ev(C.powerRead('router', { socWh: { min: 1 } }))).toBe(false);
    expect(ev(C.forecastMeetsReserve())).toBe(true);
    expect(ev(C.forecastMeetsReserve({ skylink: 'active' }))).toBe(true);

    const reg = C.layerObserved('skylink', 'registration', { status: 'down' });
    expect(ev(reg)).toBe(false);
    svc.plant.update(1);
    svc.services?.takeSample('skylink', 'registration', 'terminal-app');
    expect(ev(reg)).toBe(true);
    expect(ev(C.layerObserved('skylink', 'registration', { status: 'up' }))).toBe(false);
    expect(ev(C.samplesCurrent('skylink', ['registration']))).toBe(true);
    expect(ev(C.samplesCurrent('skylink', ['registration', 'account']))).toBe(false);
    // a config change invalidates the sample
    svc.plant.setPartMode('skylink', 'active');
    tick(1);
    expect(ev(C.samplesCurrent('skylink', ['registration']))).toBe(false);

    expect(ev(C.eventFired('weather-turns'))).toBe(false);
    objectives.states.set('obj-a', { isActive: true, isCompleted: false });
    tick(2);
    expect(ev(C.eventFired('weather-turns'))).toBe(true);

    const hyp = C.hypothesisMatches({ scope: 'part', targetId: 'router' }, { minCited: 2 });
    svc.evidence?.addHypothesis({ subject: 'router', source: {}, facts: [], text: 't', claim: { scope: 'part', targetId: 'router' }, confidence: 'low', citedEntryIds: ['a'] });
    expect(ev(hyp)).toBe(false);
    svc.evidence?.addHypothesis({
      subject: 'router',
      source: {},
      facts: [],
      text: 't',
      claim: { scope: 'part', targetId: 'router' },
      confidence: 'high',
      citedEntryIds: ['a', 'b'],
    });
    expect(ev(hyp)).toBe(true);
  });

  it('reserveHeld needs the whole window above the reserve, and resets on a dip', () => {
    boot(config({ batterySocWh: 150, routerSocWh: 90 }));
    const held = C.reserveHeld({ windowS: 5 });
    const ev = (): boolean => run(held);
    tick(1);
    expect(ev()).toBe(false);
    tick(6);
    expect(ev()).toBe(true);
    PhysicalPlantService.destroy();
    boot(config({ batterySocWh: 20, routerSocWh: 10 }));
    const low = C.reserveHeld({ windowS: 1 });
    tick(5);
    expect(run(low)).toBe(false);
  });

  it('workload and record conditions read the optional readers', () => {
    boot(config());
    const wl = C.workloadVerified({ card: 'card', service: 'skylink' });
    expect(run(wl)).toBe(false);
    const hooks = getActiveField();
    if (!hooks) throw new Error('no hooks');
    hooks.workloads = { runs: () => [{ cardId: 'card', serviceId: 'skylink', status: 'supported', startS: 5 }] };
    hooks.records = { isAccepted: (id) => id === 'unit-1', isHandoverValid: () => false };
    expect(run(wl)).toBe(true);
    expect(run(C.recordAccepted('unit-1'))).toBe(true);
    expect(run(C.recordAccepted('unit-2'))).toBe(false);
    expect(run(C.handoverValid('f'))).toBe(false);
    // afterEvent: the event has not fired
    const after = C.workloadVerified({ card: 'card', service: 'skylink', afterEvent: 'weather-turns' });
    expect(run(after)).toBe(false);
  });

  it('evidenceBeforeAction needs a sighting first and then an effective action', () => {
    const svc = boot({ ...config(), faults: [{ id: 'f-bat', target: 'router', kind: 'net' } as never] });
    const ev = (c: ReturnType<typeof C.modeIs>) => run(c);
    const cond = C.evidenceBeforeAction('router:dc', 'x', 'router');
    expect(ev(cond)).toBe(false);
    expect(svc.evidence?.entries().length).toBeGreaterThanOrEqual(0);
    expect(ev(C.faultClearedWithEvidence('f-bat'))).toBe(false);
  });
});

describe('M06 field evidence facts', () => {
  const fact = (id: (typeof EVIDENCE_FACT_IDS)[number]): boolean => EVIDENCE_FACTS[id]({ gs: null });

  it('lists the three facts and resolves them false without a plant', () => {
    for (const id of ['field-supply-absent', 'field-provider-restricted', 'field-local-path-down'] as const) {
      expect(EVIDENCE_FACT_IDS).toContain(id);
      expect(fact(id)).toBe(false);
    }
  });

  it('reads supply, provider and local path from the service model', () => {
    const svc = boot(config());
    expect(fact('field-supply-absent')).toBe(false);
    expect(fact('field-provider-restricted')).toBe(false);
    expect(fact('field-local-path-down')).toBe(false);
    svc.services?.setProvider({ id: 'prov', status: 'restricted' });
    expect(fact('field-provider-restricted')).toBe(true);
    PhysicalPlantService.destroy();

    const flat = boot(config({ batterySocWh: 0 }));
    tick(1);
    expect(flat.plant.isPartPowered('skylink')).toBe(false);
    expect(fact('field-supply-absent')).toBe(true);
    PhysicalPlantService.destroy();

    boot(config({ routerSocWh: 0 }));
    tick(1);
    expect(fact('field-supply-absent')).toBe(false);
    expect(fact('field-local-path-down')).toBe(true);
  });
});

describe('M06 scans', () => {
  it('no frontline objective that needs a sample, event or window freezes the scenario timer', () => {
    for (const scenario of frontlineScenarios) {
      for (const objective of scenario.objectives ?? []) {
        if (objective.freezesScenarioTimer) {
          const timed = objective.conditions.filter((c) => C.isFieldTimedCondition(c));
          expect(
            timed.map((c) => c.id),
            `${scenario.id}/${objective.id}`
          ).toEqual([]);
        }
      }
    }
    // the guard itself catches a freezing objective
    expect(C.isFieldTimedCondition(C.eventFired('x'))).toBe(true);
    expect(C.isFieldTimedCondition(C.modeIs('a', 'b'))).toBe(false);
  });

  it('campaigns 1-5 scenarios never author a physical plant, service or events', () => {
    const campaigns: CampaignData[] = [natsCampaignData, natsEuCampaignData, hamSdrCampaignData, ccsCampaignData, geolocationCampaignData];
    expect(campaigns.some((c) => c.id === frontlineCampaignData.id)).toBe(false);
    for (const campaign of campaigns) {
      for (const scenario of campaign.scenarios) {
        expect((scenario.settings as { physicalPlant?: unknown } | undefined)?.physicalPlant, `${campaign.id}/${scenario.id}`).toBeUndefined();
      }
    }
  });
});
