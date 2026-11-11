/**
 * @file field-rig - A self-contained Campaign 6 field site for the dev gallery
 * @description Real PhysicalPlantManager, ServiceModel, EvidenceLog, FieldRecords, EquipmentLedger and
 * WorkloadRunner built from a small authored config, with no singletons. The laptop apps, radio,
 * clipboard sheets, documents and MissionRunner read from it exactly as they read the live site.
 */
import { type EquipmentConfig, EquipmentLedger } from '@app/physical/equipment-records';
import { EvidenceLog } from '@app/physical/evidence-log';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceLayer, ServiceSample } from '@app/physical/service-types';
import { WorkloadRunner } from '@app/physical/workload-runner';
import { fnv1a, RngStream } from '@app/simulation/rng';

const FORM: HandoverFormConfig = {
  id: 'h1',
  title: 'Shift handover',
  documentSection: 'Handover',
  fields: [
    { key: 'reg', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'registration' } } },
    { key: 'soc', label: 'Battery Wh', required: true, rule: { powerWithin: { metric: 'socWh', tol: 20, partId: 'battery' } } },
    { key: 'why', label: 'Basis', required: true, rule: { cites: 'observation', min: 1 } },
  ],
};

const EQUIPMENT: EquipmentConfig = {
  units: [
    {
      unitId: 'u1',
      label: 'SkyLink terminal',
      record: { serial: 'SN-1', accountId: 'acct-a', configVersion: 'v1' },
      installed: { serial: 'SN-1', accountId: 'acct-b', configVersion: 'v1' },
    },
    { unitId: 'u2', label: 'Router', record: { serial: 'SN-2', accountId: 'acct-a', configVersion: 'v1' } },
  ],
  notices: [
    { id: 'n1', version: 1, providerId: 'skylink-ops', affects: {}, kind: 'maintenance', issuedAtS: 10, text: 'Maintenance window tonight.' },
    { id: 'n2', version: 1, providerId: 'skylink-ops', affects: {}, kind: 'ground-capacity', issuedAtS: 30, text: 'Ground capacity reduced.' },
  ],
  requests: [{ id: 'req1', unitId: 'u1', field: 'accountId', to: 'acct-b', responseEventId: 'ev1' }],
};

function plantConfig(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'laptop', kind: 'client', label: 'Laptop', poweredBy: 'battery', loadW: 45, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
      { id: 'vsat-modem', kind: 'modem', label: 'VSAT modem', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
    faults: [],
    service: {
      paths: [
        {
          id: 'skylink',
          label: 'SkyLink',
          terminalPartId: 'skylink',
          localPartIds: ['router', 'laptop'],
          accountId: 'acct',
          providerId: 'prov',
          endpointIds: ['ops-center'],
          profile: { downMbps: 120, upMbps: 18, rttMs: 42, lossPct: 0.4, rttSpreadMs: 6 },
        },
        {
          id: 'vsat',
          label: 'EuroSat VSAT',
          terminalPartId: 'vsat-modem',
          localPartIds: ['router'],
          accountId: 'acct2',
          providerId: 'prov2',
          profile: { downMbps: 12, upMbps: 3, rttMs: 640, lossPct: 1.1, rttSpreadMs: 40 },
        },
      ],
      accounts: [
        { id: 'acct', unitId: 'u1', authorized: true, capacityFactor: 1 },
        { id: 'acct2', unitId: 'u2', authorized: true, capacityFactor: 1 },
      ],
      providers: [
        { id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] },
        { id: 'prov2', status: 'normal', capacityFactor: 1, noticeIds: [] },
      ],
      endpoints: [{ id: 'ops-center', reachable: true }],
    },
    workloads: {
      cards: [
        { id: 'chat', version: 1, label: 'Team chat', minDownMbps: 1, windowS: 20, priority: 'routine' },
        { id: 'video', version: 1, label: 'Video briefing', minDownMbps: 80, windowS: 20, priority: 'mission' },
        { id: 'sync', version: 1, label: 'Map sync', minDownMbps: 5, windowS: 30, priority: 'background' },
      ],
    },
    power: { reserveWh: 200, planningHorizonS: 5400, basis: 'battery-only' },
  } as unknown as PlantConfig;
}

export interface FieldRig {
  plant: PhysicalPlantManager;
  service: ServiceModel;
  evidence: EvidenceLog;
  records: FieldRecords;
  ledger: EquipmentLedger;
  runner: WorkloadRunner;
  /** Scenario seconds on the rig clock */
  now(): number;
  advance(seconds: number): void;
  /** Take a sample the way the apps' check callback does, spending no time */
  check(serviceId: string, layer: ServiceLayer, via: ServiceSample['provenance'], endpointId?: string, metric?: ServiceSample['metric']): ServiceSample;
}

export function createFieldRig(): FieldRig {
  let t = 120;
  const streams = new Map<string, RngStream>();
  const cfg = plantConfig();
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`gallery:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  const service = new ServiceModel(cfg.service as never, plant, undefined, { now: () => t });
  const evidence = new EvidenceLog(plant, service);
  const ledger = new EquipmentLedger(EQUIPMENT, () => t);
  const runner = new WorkloadRunner(cfg.workloads as never, service, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
  });
  const deps: FieldRecordsDeps = {
    plant,
    service,
    evidence,
    runs: () => runner.getRuns(),
    getCardVersion: () => 1,
    equipment: ledger,
  };
  const records = new FieldRecords([FORM], deps);
  plant.update(1);

  return {
    plant,
    service,
    evidence,
    records,
    ledger,
    runner,
    now: () => t,
    advance: (seconds) => {
      t += seconds;
      plant.update(1);
    },
    check: (serviceId, layer, via, endpointId, metric = 'status') => service.takeSample(serviceId, layer, via, endpointId, metric),
  };
}
