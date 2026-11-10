/**
 * M25 S11 completion: the EuroSat terminal arrives as a layer on the forward site. The player reconciles the
 * delivery and accepts the authorized record, commissions the terminal (startup time, registration, account),
 * measures every layer, assesses both tasks against the GEO delay, verifies only the supported transfer after
 * the assessment, and reports the restored and unavailable work with the SkyLink restriction still in force.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { FORWARD_EUROSAT_ACCOUNT, FORWARD_EUROSAT_SERVICE, FORWARD_EUROSAT_UNIT, FORWARD_SKYLINK_ACCOUNT } from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario11Data, S11_INTERACTIVE_CARD, S11_TRANSFER_CARD } from '@app/campaigns/frontline/scenario11';
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
const data = frontlineScenario11Data;
const EUS = FORWARD_EUROSAT_SERVICE;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'power' | 'local' | 'registration' | 'account' | 'application';
const value = (svc: PhysicalPlantService, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(EUS, layer)?.value) });

function takeAll(svc: PhysicalPlantService): void {
  svc.services?.takeSample(EUS, 'power', 'device-indicator');
  svc.services?.takeSample(EUS, 'local', 'local-probe');
  svc.services?.takeSample(EUS, 'registration', 'terminal-app');
  svc.services?.takeSample(EUS, 'account', 'provider-portal');
  svc.services?.takeSample(EUS, 'application', 'endpoint-report');
}

function runCard(svc: PhysicalPlantService, cardId: string) {
  const start = svc.workloads?.start(cardId, EUS);
  expect(start?.ok).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's11-receive-equipment': () => {
      svc.plant.inspect('vsat-modem');
      ok(svc.records?.submit('delivery', { serial: { value: 'matches' }, account: { value: 'matches' }, accessories: { value: 'complete' }, depot: { value: 'hardware-only' } }));
      expect(svc.records?.equipment?.accept(FORWARD_EUROSAT_UNIT).ok).toBe(true);
    },
    's11-commission-terminal': () => {
      svc.plant.setPartMode('vsat-modem', 'run');
      tick(25);
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.services?.takeSample(EUS, 'account', 'provider-portal');
      ok(
        svc.records?.submit('commissioning', {
          unit: { value: FORWARD_EUROSAT_UNIT },
          mode: { value: 'run' },
          registration: value(svc, 'registration'),
          account: value(svc, 'account'),
          service: { value: 'ready-not-proven' },
        })
      );
    },
    's11-measure-service': () => {
      takeAll(svc);
      for (const m of ['rttMs', 'downMbps', 'lossPct', 'jitterMs'] as const) svc.services?.takeSample(EUS, 'registration', 'terminal-app', undefined, m);
      ok(
        svc.records?.submit('measurement', {
          local: value(svc, 'local'),
          application: value(svc, 'application'),
          samples: { cites: obsIds(svc) },
          delay: { value: 'much-higher' },
          jitter: { value: String(svc.services?.latest(EUS, 'registration')?.value) },
        })
      );
    },
    's11-select-workload': () => {
      const run = runCard(svc, S11_INTERACTIVE_CARD.id);
      expect(run?.status, JSON.stringify(run)).toBe('unsupported');
      ok(svc.records?.submit('suitability', { transfer: { value: 'supported' }, interactive: { value: 'unsupported' }, unmet: { value: 'delay' }, basis: { cites: obsIds(svc) } }));
    },
    's11-verify-workload': () => {
      const run = runCard(svc, S11_TRANSFER_CARD.id);
      expect(run?.status, JSON.stringify(run)).toBe('supported');
      svc.services?.takeSample(EUS, 'application', 'endpoint-report');
    },
    's11-handover-capability': () => {
      svc.plant.inspect('power-station');
      svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'provider-portal');
      const run = svc.workloads?.runs().find((r) => r.cardId === S11_TRANSFER_CARD.id && r.status === 'supported');
      ok(
        svc.records?.submit('capability', {
          verified: { value: run?.id ?? '' },
          energy: { value: Math.round(svc.plant.getPowerReadings().socWh['power-station']) },
          skylink: { value: String(svc.services?.latest(SKYLINK_SERVICE, 'account')?.value) },
          restored: { value: S11_TRANSFER_CARD.id },
          unavailable: { value: S11_INTERACTIVE_CARD.id },
          restriction: { value: 'remains-active' },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(11);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M25 S11 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order with the SkyLink restriction still in force', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    const skylink = svc.services?.getState().accounts.find((a) => a.id === FORWARD_SKYLINK_ACCOUNT);
    expect(skylink?.restriction).toBe('ground-capacity');
    expect(svc.services?.getState().accounts.some((a) => a.id === FORWARD_EUROSAT_ACCOUNT)).toBe(true);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
  });

  it('refuses to accept the record before the player reconciles it, and inspection alone does not pass', () => {
    const svc = bootScenario(data);
    states.set('s11-receive-equipment', { isActive: true, isCompleted: false });
    svc.plant.inspect('vsat-modem');
    expect(incomplete(svc, 's11-receive-equipment')).toEqual(['Delivery and account reconciled with the record', 'Authorized EuroSat configuration accepted']);
    const bad = svc.records?.submit('delivery', {
      serial: { value: 'differs' },
      account: { value: 'matches' },
      accessories: { value: 'complete' },
      depot: { value: 'hardware-only' },
    });
    expect(bad?.ok).toBe(false);
  });

  it('keeps the terminal unregistered until it is switched on and its startup time has passed', () => {
    const svc = bootScenario(data);
    svc.services?.takeSample(EUS, 'registration', 'terminal-app');
    expect(svc.services?.latest(EUS, 'registration')?.value).not.toBe('up');
    svc.plant.setPartMode('vsat-modem', 'run');
    tick(5);
    svc.services?.takeSample(EUS, 'registration', 'terminal-app');
    expect(svc.services?.latest(EUS, 'registration')?.value).not.toBe('up');
    tick(25);
    svc.services?.takeSample(EUS, 'registration', 'terminal-app');
    expect(svc.services?.latest(EUS, 'registration')?.value).toBe('up');
  });

  it('does not accept a commissioning form that claims the service is proven, or a stale registration', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's11-receive-equipment' });
    svc.plant.setPartMode('vsat-modem', 'run');
    tick(25);
    svc.services?.takeSample(EUS, 'registration', 'terminal-app');
    svc.services?.takeSample(EUS, 'account', 'provider-portal');
    const bad = svc.records?.submit('commissioning', {
      unit: { value: FORWARD_EUROSAT_UNIT },
      mode: { value: 'run' },
      registration: value(svc, 'registration'),
      account: value(svc, 'account'),
      service: { value: 'proven' },
    });
    expect(bad?.ok).toBe(false);
  });

  it('shows the interactive task unsupported on EuroSat and the transfer supported', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's11-measure-service' });
    expect(runCard(svc, S11_INTERACTIVE_CARD.id)?.status).toBe('unsupported');
    expect(runCard(svc, S11_TRANSFER_CARD.id)?.status).toBe('supported');
  });

  it('does not count a transfer run made before the suitability assessment', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's11-measure-service' });
    states.set('s11-select-workload', { isActive: true, isCompleted: false });
    runCard(svc, S11_TRANSFER_CARD.id);
    runCard(svc, S11_INTERACTIVE_CARD.id);
    ok(svc.records?.submit('suitability', { transfer: { value: 'supported' }, interactive: { value: 'unsupported' }, unmet: { value: 'delay' }, basis: { cites: obsIds(svc) } }));
    states.set('s11-select-workload', { isActive: false, isCompleted: true });
    states.set('s11-verify-workload', { isActive: true, isCompleted: false });
    expect(incomplete(svc, 's11-verify-workload')).toContain('Supported task window run after the assessment');
    runCard(svc, S11_TRANSFER_CARD.id);
    expect(incomplete(svc, 's11-verify-workload')).not.toContain('Supported task window run after the assessment');
  });

  it('restores a checkpoint taken after commissioning with the terminal still running and accepted', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's11-commission-terminal' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(3);
    expect(again.plant.getPartMode('vsat-modem')).toBe('run');
    expect(again.records?.equipment?.isAccepted(FORWARD_EUROSAT_UNIT)).toBe(true);
    again.services?.takeSample(EUS, 'registration', 'terminal-app');
    expect(again.services?.latest(EUS, 'registration')?.value).toBe('up');
    expect(incomplete(again, 's11-commission-terminal')).toEqual([]);
  });
});
