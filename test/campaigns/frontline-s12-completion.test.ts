/**
 * M25 S12 completion: the EuroSat service is usable until the remote endpoint becomes unreachable. The player
 * marks the independent service path, records the symptoms with the remote value as last known, compares current
 * local and remote readings, states a bounded diagnosis, sends a referral package that changes no record, and
 * verifies recovery with a fresh test after the specialist answers. S12 has no fault, so there is no debrief
 * diagnosis to assert.
 */

import {
  FORWARD_ENDPOINT,
  FORWARD_EUROSAT_ENDPOINT,
  FORWARD_EUROSAT_PROVIDER,
  FORWARD_EUROSAT_SERVICE,
  FORWARD_EUROSAT_UNIT,
  FORWARD_PROVIDER,
  FORWARD_SKYLINK_ACCOUNT,
} from '@app/campaigns/frontline/forward-field-config';
import { S11_TRANSFER_CARD } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario12Data, S12_EVENT_INTERRUPTION, S12_EVENT_RECOVERED, S12_REFERRAL } from '@app/campaigns/frontline/scenario12';
import { EventBus } from '@app/events/event-bus';
import type { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, driveObjectives, type ObjectiveStates, tick, unmet } from './frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const states = objectives.states as ObjectiveStates;
const data = frontlineScenario12Data;
const EUS = FORWARD_EUROSAT_SERVICE;
const ENDPOINT_NODE = `endpoint:${FORWARD_EUROSAT_ENDPOINT}`;
const PATH = ['laptop', 'vsat-modem', `provider:${FORWARD_EUROSAT_PROVIDER}`, ENDPOINT_NODE];
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const resultIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('result') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'local' | 'registration' | 'application';
const value = (svc: PhysicalPlantService, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(EUS, layer)?.value) });

function takePath(svc: PhysicalPlantService): void {
  svc.services?.takeSample(EUS, 'local', 'local-probe');
  svc.services?.takeSample(EUS, 'registration', 'terminal-app');
  svc.services?.takeSample(EUS, 'application', 'endpoint-report');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's12-review-path': () => {
      takePath(svc);
      svc.evidence?.recordSelection(PATH, 'EuroSat service path');
      ok(
        svc.records?.submit('architecture', {
          local: value(svc, 'local'),
          application: value(svc, 'application'),
          shared: { value: 'workstation-and-power' },
          independent: { value: 'terminal-account-provider-endpoint' },
        })
      );
    },
    's12-record-symptoms': () => {
      tick(2);
      ok(svc.records?.submit('symptoms', { remote: { value: 'last-known' }, onset: { cites: resultIds(svc) } }));
    },
    's12-compare-observations': () => {
      takePath(svc);
      ok(
        svc.records?.submit('comparison', {
          local: value(svc, 'local'),
          registration: value(svc, 'registration'),
          application: value(svc, 'application'),
          limits: { value: 'remote-condition' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's12-bound-conclusion': () => {
      svc.evidence?.recordSelection([ENDPOINT_NODE], 'Remote endpoint segment');
      ok(
        svc.records?.submit('diagnosis', {
          segment: { value: 'remote-endpoint' },
          confidence: { value: 'likely-unconfirmed' },
          cause: { value: 'not-established' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's12-refer-incident': () => {
      ok(
        svc.records?.submit('referral-package', {
          segment: { value: 'remote-endpoint' },
          confidence: { value: 'likely-unconfirmed' },
          local: { value: 'unchanged' },
          evidence: { cites: obsIds(svc) },
        })
      );
      expect(svc.records?.equipment?.submitCorrection(S12_REFERRAL)?.ok).toBe(true);
      tick(2);
    },
    's12-verify-resolution': () => {
      tick(2);
      const start = svc.workloads?.start(S11_TRANSFER_CARD.id, EUS);
      expect(start?.ok).toBe(true);
      const run = svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
      expect(run?.status, JSON.stringify(run)).toBe('supported');
      svc.services?.takeSample(EUS, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('incident-update', {
          verified: { value: run?.id ?? '' },
          application: value(svc, 'application'),
          recovery: { value: 'fresh-test' },
          cause: { value: 'not-established' },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(12);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M25 S12 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order and leaves the unit record unchanged', () => {
    const svc = bootScenario(data);
    const before = svc.records?.equipment?.getRecord(FORWARD_EUROSAT_UNIT);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    expect(svc.records?.equipment?.getRecord(FORWARD_EUROSAT_UNIT)).toEqual(before);
    expect(svc.records?.equipment?.getRequest(S12_REFERRAL)?.status).toBe('approved');
  });

  it('keeps the application healthy until the symptoms objective starts, then takes the endpoint down', () => {
    const svc = bootScenario(data);
    takePath(svc);
    expect(svc.services?.latest(EUS, 'application')?.value).toBe('up');
    states.set('s12-record-symptoms', { isActive: true, isCompleted: false });
    tick(3);
    takePath(svc);
    expect(svc.services?.latest(EUS, 'application')?.value).toBe('down');
    expect(svc.services?.latest(EUS, 'local')?.value).toBe('up');
    expect(svc.services?.latest(EUS, 'registration')?.value).toBe('up');
    expect(S12_EVENT_INTERRUPTION).toBe('s12-endpoint-interruption');
  });

  it('does not accept a path that includes the Skylink-only parts', () => {
    const svc = bootScenario(data);
    takePath(svc);
    svc.evidence?.recordSelection([...PATH, `account:${FORWARD_SKYLINK_ACCOUNT}`, `provider:${FORWARD_PROVIDER}`, `endpoint:${FORWARD_ENDPOINT}`], 'Everything');
    expect(incomplete(svc, 's12-review-path')).toContain('EuroSat path marked without the Skylink-only parts');
    svc.evidence?.recordSelection(PATH, 'EuroSat path');
    expect(incomplete(svc, 's12-review-path')).not.toContain('EuroSat path marked without the Skylink-only parts');
  });

  it('rejects a diagnosis that blames local equipment or claims a physical cause', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's12-compare-observations' });
    const blame = svc.records?.submit('diagnosis', {
      segment: { value: 'local-network' },
      confidence: { value: 'likely-unconfirmed' },
      cause: { value: 'not-established' },
      basis: { cites: obsIds(svc) },
    });
    expect(blame?.ok).toBe(false);
    const certain = svc.records?.submit('diagnosis', {
      segment: { value: 'remote-endpoint' },
      confidence: { value: 'confirmed' },
      cause: { value: 'failed-radio' },
      basis: { cites: obsIds(svc) },
    });
    expect(certain?.ok).toBe(false);
    svc.evidence?.recordSelection(['laptop', ENDPOINT_NODE], 'Blames the workstation');
    expect(incomplete(svc, 's12-bound-conclusion')).toContain('Remote segment marked after the interruption');
  });

  it('holds the specialist answer until the referral is sent and does not count it as recovery', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's12-bound-conclusion' });
    states.set('s12-refer-incident', { isActive: true, isCompleted: false });
    tick(5);
    expect(incomplete(svc, 's12-refer-incident')).toContain('Referral sent to the specialist');
    expect(incomplete(svc, 's12-refer-incident')).toContain('Specialist response received');
    expect(svc.services?.latest(EUS, 'application')?.value).not.toBe('up');
  });

  it('does not verify from a healthy reading taken before the incident or before the recovery', () => {
    const svc = bootScenario(data);
    const early = svc.workloads?.start(S11_TRANSFER_CARD.id, EUS);
    svc.workloads?.waitForRun(early?.ok ? early.run.id : '');
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's12-refer-incident' });
    states.set('s12-verify-resolution', { isActive: true, isCompleted: false });
    expect(incomplete(svc, 's12-verify-resolution')).toContain('New task window supported after the response');
    expect(S12_EVENT_RECOVERED).toBe('s12-endpoint-recovered');
  });

  it('restores a checkpoint taken during the interruption with the endpoint still unreachable', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's12-bound-conclusion' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    again.services?.takeSample(EUS, 'application', 'endpoint-report');
    expect(again.services?.latest(EUS, 'application')?.value).toBe('down');
    expect(again.services?.latest(EUS, 'application')?.value).not.toBe('up');
  });
});
