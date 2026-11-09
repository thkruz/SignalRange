/**
 * M05 evidence log and diagnostic scorer: plant actions become frozen entries, relevant negatives
 * earn capped credit, lucky swaps are flagged, and any route to a supported fix passes.
 */

import { DependencyGraph } from '@app/physical/dependency-graph';
import { diagnosticScoreEffect, scoreDiagnosis } from '@app/physical/diagnostic-scorer';
import { EvidenceLog } from '@app/physical/evidence-log';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantFault } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function plantConfig(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'Skylink', poweredBy: 'router', viaCable: 'dish-cable', nominalV: 12, loadW: 40 },
      { id: 'aux', kind: 'router', label: 'Aux', poweredBy: 'battery', loadW: 5, nominalV: 12 },
    ],
    connectors: [
      { id: 'router:dc', feeds: 'router', partId: 'router' },
      { id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' },
      { id: 'aux:dc', feeds: 'aux', partId: 'aux' },
    ],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
    faults: [],
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
  };
}

function rig(faults: PlantFault[] = []) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const cfg = plantConfig();
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`m05:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  for (const f of faults) plant.injectFault(f);
  const service = cfg.service ? new ServiceModel(cfg.service, plant, undefined, { now: () => t }) : null;
  const log = new EvidenceLog(plant, service);
  const graph = new DependencyGraph(cfg);
  plant.update(1);

  return { plant, service, log, graph, advance: (s: number) => (t += s) };
}

const dishFault: PlantFault = { id: 'f-dish', target: 'dish-plug', kind: 'partial-seat' };
const powerFault: PlantFault = { id: 'f-dc', target: 'router:dc', kind: 'unseated' };

describe('M05 dependency graph', () => {
  it('puts the power chain, cables and connectors on the path and leaves the aux branch off', () => {
    const { graph } = rig();
    const ids = graph.pathIds('skylink');
    for (const id of ['skylink', 'router', 'battery', 'dish-cable', 'dish-plug', 'router:dc']) expect(ids.has(id)).toBe(true);
    expect(ids.has('aux')).toBe(false);
    expect(ids.has('aux:dc')).toBe(false);
    expect(graph.servicesFor('router:dc')).toEqual(['skylink']);
  });
});

describe('M05 evidence log', () => {
  it('turns plant actions into entries with frozen text and the facts first revealed', () => {
    const { plant, log } = rig([dishFault]);
    const result = plant.wiggle('dish-plug');
    const [entry] = log.entries('observation');
    expect(entry.text).toBe(result.observation);
    expect(entry.subject).toBe('dish-plug');
    expect(entry.positive).toBe(true);
    expect(entry.facts.length).toBeGreaterThan(0);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.facts)).toBe(true);
    expect(() => {
      (entry as { text: string }).text = 'changed';
    }).toThrow();
    plant.reseat('dish-plug');
    expect(log.entries('action')).toHaveLength(1);
    expect(log.entries('action')[0]).toMatchObject({ verb: 'reseat', effective: true, clearedTargets: ['dish-plug'] });
  });

  it('stamps samples and events, and tracks symptomatic services', () => {
    const { service, log } = rig();
    service?.takeSample('skylink', 'registration', 'terminal-app');
    service?.bumpEvent('storm');
    expect(log.entries().map((e) => e.source)).toEqual([{ sampleId: 'sample-1' }, { eventId: 'storm' }]);
    expect(log.entries('result')[0].subject).toBe('storm');
    expect(log.symptoms()).toEqual([]);
  });

  it('observedBefore matches inspect-then-reseat and fails reseat-then-inspect', () => {
    const good = rig([dishFault]);
    good.plant.wiggle('dish-plug');
    good.plant.reseat('dish-plug');
    const fact = good.log.entries()[0].facts[0].split('|')[1];
    expect(good.log.observedBefore('dish-plug', fact, 'dish-plug')).toBe(true);

    const bad = rig([dishFault]);
    bad.plant.reseat('dish-plug');
    bad.plant.wiggle('dish-plug');
    expect(bad.log.observedBefore('dish-plug', fact, 'dish-plug')).toBe(false);
  });

  it('round-trips through getState and restoreState', () => {
    const a = rig([dishFault]);
    a.plant.wiggle('dish-plug');
    const state = JSON.parse(JSON.stringify(a.log.getState()));
    const b = rig([dishFault]);
    b.log.restoreState(state);
    expect(b.log.entries()).toEqual(a.log.entries());
    expect(Object.isFrozen(b.log.entries()[0])).toBe(true);
    b.plant.wiggle('dish-plug');
    expect(b.log.entries().at(-1)?.id).toBe('ev-2');
  });

  it('keeps hypotheses as entries with their claim', () => {
    const { log } = rig();
    const h = log.addHypothesis({
      subject: 'dish-plug',
      source: {},
      facts: [],
      text: 'Loose plug',
      claim: { scope: 'part', targetId: 'dish-plug' },
      confidence: 'medium',
      citedEntryIds: [],
    });
    expect(h).toMatchObject({ kind: 'hypothesis', id: 'ev-1' });
    expect(log.entries('hypothesis')).toHaveLength(1);
  });
});

describe('M05 scoring', () => {
  it('a relevant test that reveals nothing is a useful negative, counted once; off-path tests are irrelevant', () => {
    const { plant, log, graph } = rig([dishFault]);
    plant.inspect('router:dc');
    plant.inspect('router:dc');
    plant.inspect('aux:dc');
    const s = scoreDiagnosis(log, plant, graph);
    expect(s).toMatchObject({ relevantTests: 1, usefulNegatives: 1, irrelevantTests: 2 });
  });

  it('a symptom narrows the candidate set to that service path', () => {
    const { plant, log, graph } = rig([dishFault]);
    // Nothing sampled: aux is off the only path, so it is irrelevant either way
    plant.wiggle('dish-plug');
    expect(scoreDiagnosis(log, plant, graph).relevantTests).toBe(1);
  });

  it('an effective swap with no earlier reveal is an unsupported fix and a lucky swap', () => {
    const { plant, log, graph } = rig([{ id: 'f-brick', target: 'router', kind: 'brick-dead' }]);
    const r = plant.swap('router');
    expect(r.cleared?.length).toBeGreaterThan(0);
    const s = scoreDiagnosis(log, plant, graph);
    expect(s).toMatchObject({ supportedFixes: 0, unsupportedFixes: 1, unsupportedSpares: 1, timeToCauseS: null });
    expect(s.firstCorrectActionS).not.toBeNull();
  });

  it('a multimeter upstream reveal supports the fix', () => {
    const { plant, log, graph } = rig([powerFault]);
    plant.measure('multimeter', 'router');
    plant.reseat('router:dc');
    const s = scoreDiagnosis(log, plant, graph);
    expect(s).toMatchObject({ supportedFixes: 1, unsupportedFixes: 0 });
    expect(s.timeToCauseS).not.toBeNull();
  });

  it('two different valid routes both pass', () => {
    const viaInspect = rig([powerFault]);
    viaInspect.plant.inspect('router:dc');
    viaInspect.plant.reseat('router:dc');
    const viaMeter = rig([powerFault]);
    viaMeter.plant.measure('multimeter', 'router');
    viaMeter.plant.reseat('router:dc');
    for (const r of [viaInspect, viaMeter]) {
      expect(scoreDiagnosis(r.log, r.plant, r.graph)).toMatchObject({ supportedFixes: 1, unsupportedFixes: 0 });
    }
  });

  it('an ineffective fix is neither supported nor unsupported', () => {
    const { plant, log, graph } = rig([dishFault]);
    plant.reseat('router:dc');
    expect(scoreDiagnosis(log, plant, graph)).toMatchObject({ supportedFixes: 0, unsupportedFixes: 0 });
  });
});

describe('M05 capped score effect', () => {
  const base = {
    relevantTests: 0,
    usefulNegatives: 0,
    irrelevantTests: 0,
    supportedFixes: 0,
    unsupportedFixes: 0,
    unsupportedSpares: 0,
    firstCorrectActionS: null,
    timeToCauseS: null,
    trips: 0,
    spotted: false,
  };

  it('scales then caps the bonus and the penalty', () => {
    expect(diagnosticScoreEffect({ ...base, usefulNegatives: 2 })).toMatchObject({ bonus: 2, penalty: 0, net: 2 });
    expect(diagnosticScoreEffect({ ...base, usefulNegatives: 50, unsupportedFixes: 50 })).toMatchObject({ bonus: 3, penalty: 4, net: -1 });
  });

  it('says nothing when there is nothing to explain', () => {
    expect(diagnosticScoreEffect(base).notes).toEqual([]);
  });
});
