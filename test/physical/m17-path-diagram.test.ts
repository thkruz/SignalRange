/**
 * M17 service-path diagram: model segments, shared dependencies, layout, evidence selection,
 * panel behaviour.
 */

import { FieldPathDiagramPanel } from '@app/pages/mission-control/tabs/field-path-diagram-panel';
import { DependencyGraph } from '@app/physical/dependency-graph';
import { diagnosticScoreEffect, scoreDiagnosis } from '@app/physical/diagnostic-scorer';
import { EvidenceLog } from '@app/physical/evidence-log';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import { buildServicePathDiagram, layoutDiagram } from '@app/physical/service-path-diagram';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

function cfg(): PlantConfig {
  const profile = { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 };

  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'router', viaCable: 'dish-cable', nominalV: 12, loadW: 40 },
      { id: 'eurosat', kind: 'terminal', label: 'EuroSat', poweredBy: 'battery', nominalV: 12, loadW: 40 },
    ],
    connectors: [{ id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' }],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
    faults: [],
    service: {
      paths: [
        { id: 'skylink', label: 'SkyLink', terminalPartId: 'skylink', localPartIds: ['router'], accountId: 'a1', providerId: 'skylink-ops', endpointIds: ['hq'], profile },
        {
          id: 'eurosat',
          label: 'EuroSat',
          terminalPartId: 'eurosat',
          localPartIds: [],
          accountId: 'a2',
          providerId: 'eurosat-ops',
          remoteLeg: { kind: 'fiber', rttMs: 20, downMbps: 50 },
          profile,
        },
      ],
      accounts: [
        { id: 'a1', unitId: 'u1', authorized: true, capacityFactor: 1 },
        { id: 'a2', unitId: 'u2', authorized: true, capacityFactor: 1 },
      ],
      providers: [
        { id: 'skylink-ops', status: 'normal', capacityFactor: 1, noticeIds: [] },
        { id: 'eurosat-ops', status: 'normal', capacityFactor: 1, noticeIds: [] },
      ],
      endpoints: [{ id: 'hq', reachable: true }],
    },
  };
}

function rig() {
  let t = 100;
  const config = cfg();
  const plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => new RngStream(fnv1a(`m17:${name}`)),
  });
  const service = new ServiceModel(config.service as NonNullable<PlantConfig['service']>, plant, undefined, { now: () => t });
  const log = new EvidenceLog(plant, service);
  plant.update(1);

  return { plant, log, service, config };
}

describe('M17 diagram model', () => {
  const diagram = buildServicePathDiagram(cfg(), (id) => id.toUpperCase());

  it('builds one lane per service with the five segments in order', () => {
    expect(diagram.lanes.map((l) => l.serviceId)).toEqual(['skylink', 'eurosat']);
    const sky = diagram.lanes[0].nodes;
    expect(sky.map((n) => n.segment)).toEqual(['power', 'power', 'local', 'link', 'provider', 'provider', 'remote']);
    expect(sky.map((n) => n.id)).toEqual(expect.arrayContaining(['battery', 'dish-cable', 'router', 'skylink', 'account:a1', 'provider:skylink-ops', 'endpoint:hq']));
    expect(sky.find((n) => n.id === 'battery')?.label).toBe('BATTERY');
    expect(diagram.lanes[1].nodes.some((n) => n.id === 'remote-leg:eurosat')).toBe(true);
  });

  it('marks nodes on more than one lane as shared and nothing else', () => {
    expect(diagram.sharedIds).toEqual(['battery']);
    expect(diagram.lanes[0].nodes.find((n) => n.id === 'battery')?.serviceIds).toEqual(['skylink', 'eurosat']);
    expect(diagram.lanes[0].nodes.find((n) => n.id === 'router')?.serviceIds).toEqual(['skylink']);
  });

  it('has no lanes without a service config and lays every node out once', () => {
    expect(buildServicePathDiagram({ ...cfg(), service: undefined }).lanes).toEqual([]);
    const layout = layoutDiagram(diagram);
    expect(layout.placements).toHaveLength(diagram.lanes.reduce((n, l) => n + l.nodes.length, 0));
    expect(layout.height).toBeGreaterThan(layout.laneTops[1]);
  });

  it('agrees with the dependency graph on shared power parts', () => {
    const graph = new DependencyGraph(cfg());
    for (const id of diagram.sharedIds) expect(graph.servicesFor(id).length).toBeGreaterThan(1);
  });
});

describe('M17 selection as evidence', () => {
  it('records a frozen selection entry that the scorer ignores', () => {
    const { log, config, plant } = rig();
    const before = scoreDiagnosis(log, plant, new DependencyGraph(config));
    const entry = log.recordSelection(['battery', 'router'], 'Marked.');
    expect(entry.selection).toEqual(['battery', 'router']);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(log.selections('service-path')).toHaveLength(1);
    expect(log.selections('other')).toHaveLength(0);
    const after = scoreDiagnosis(log, plant, new DependencyGraph(config));
    expect(diagnosticScoreEffect(after)).toEqual(diagnosticScoreEffect(before));
  });
});

describe('M17 panel', () => {
  function panelRig(withPlant = true, shared = true) {
    const r = rig();
    const host = document.createElement('div');
    const panel = new FieldPathDiagramPanel(host, { plant: () => (withPlant ? r.plant : null), evidence: () => r.log, highlightShared: () => shared });
    panel.sync();

    return { ...r, host, panel };
  }

  it('is hidden without a plant', () => {
    const { host } = panelRig(false);
    expect(host.style.display).toBe('none');
  });

  it('draws nodes, highlights shared ones, and can hide the highlight', () => {
    const { host } = panelRig();
    expect(host.querySelectorAll('[data-pd-node]').length).toBe(12);
    expect(host.querySelectorAll('.fpd-shared').length).toBe(2);
    const off = panelRig(true, false);
    expect(off.host.querySelectorAll('.fpd-shared').length).toBe(0);
  });

  it('gives every drawn node a unique DOM id even when a node is shared by two services', () => {
    const { host } = panelRig();
    const ids = [...host.querySelectorAll('[data-pd-node]')].map((n) => n.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toggles by click and records the selection as one evidence entry', () => {
    const { host, panel, log } = panelRig();
    host.querySelector('[data-pd-node="router"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel.getSelection()).toEqual(['router']);
    expect(host.querySelectorAll('.fpd-selected').length).toBe(1);
    expect(panel.toggle('nope')).toBe(false);
    panel.toggle('battery');
    expect(host.querySelectorAll('.fpd-selected').length).toBe(3);
    host.querySelector<HTMLButtonElement>('[data-pd-act="record"]')?.click();
    const [entry] = log.selections();
    expect(entry.selection).toEqual(['router', 'battery']);
    expect(entry.text).toContain('Router');
    expect(panel.getSelection()).toEqual([]);
  });

  it('refuses an empty record and clears on request', () => {
    const { panel, log } = panelRig();
    expect(panel.record()).toBe('empty');
    expect(log.selections()).toHaveLength(0);
    panel.toggle('router');
    panel.clearSelection();
    expect(panel.getSelection()).toEqual([]);
  });
});
