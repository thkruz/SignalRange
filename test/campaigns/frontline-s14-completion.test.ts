/**
 * M26 S14 completion: the provider lifts the S10 ground restriction (only), the player measures the restored SkyLink
 * service, compares SkyLink and EuroSat against the same tasks, maps the dependencies both share, chooses an
 * active/standby arrangement that keeps the 200 Wh reserve, runs a planned SkyLink outage on a running clock and hands
 * both connections over. The S13 remote mobility policy stays in force from start to finish.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { FORWARD_EUROSAT_SERVICE, FORWARD_PROVIDER, FORWARD_REMOTE_ENDPOINT, FORWARD_REMOTE_SERVICE, FORWARD_SKYLINK_ACCOUNT } from '@app/campaigns/frontline/forward-field-config';
import { S11_INTERACTIVE_CARD, S11_TRANSFER_CARD } from '@app/campaigns/frontline/scenario11';
import { frontlineScenario14Data, S14_EVENT_EXERCISE, S14_EVENT_LIFT, S14_EVENT_NOTICE, S14_EVENT_RETURN } from '@app/campaigns/frontline/scenario14';
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
const data = frontlineScenario14Data;
const EUS = FORWARD_EUROSAT_SERVICE;
const REMOTE = FORWARD_REMOTE_SERVICE;
const INTERACTIVE = S11_INTERACTIVE_CARD.id;
const TRANSFER = S11_TRANSFER_CARD.id;
const incomplete = (svc: PhysicalPlantService, id: string): string[] => unmet(data.objectives.find((o) => o.id === id) as never, svc);
const obsIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('observation') ?? []).map((e) => e.id);
const resultIds = (svc: PhysicalPlantService): string[] => (svc.evidence?.entries('result') ?? []).map((e) => e.id);
const ok = (res: ReturnType<NonNullable<PhysicalPlantService['records']>['submit']> | undefined): void => {
  expect(res?.ok, JSON.stringify(res?.validation.fields.filter((f) => !f.ok))).toBe(true);
};
type Layer = 'registration' | 'account' | 'application' | 'provider';
const value = (svc: PhysicalPlantService, id: string, layer: Layer): { value: string } => ({ value: String(svc.services?.latest(id, layer)?.value) });
const energy = (svc: PhysicalPlantService): { value: number } => ({ value: Math.round(svc.plant.getPowerReadings().socWh['power-station']) });
const remote = (svc: PhysicalPlantService) => svc.services?.getState().endpoints.find((e) => e.id === FORWARD_REMOTE_ENDPOINT);

function run(svc: PhysicalPlantService, card: string, service: string) {
  const start = svc.workloads?.start(card, service);
  expect(start?.ok, JSON.stringify(start)).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

function acts(svc: PhysicalPlantService): Record<string, () => void> {
  return {
    's14-confirm-restoration': () => {
      tick(25);
      const verified = run(svc, INTERACTIVE, SKYLINK_SERVICE);
      expect(verified?.status).toBe('supported');
      svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'provider-portal');
      svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('restoration', {
          notice: { cites: resultIds(svc) },
          account: value(svc, SKYLINK_SERVICE, 'account'),
          verified: { value: verified?.id ?? '' },
          remote: value(svc, REMOTE, 'application'),
          policy: { value: 'remains-in-force' },
        })
      );
    },
    's14-compare-services': () => {
      const skylink = run(svc, INTERACTIVE, SKYLINK_SERVICE);
      const eurosat = run(svc, INTERACTIVE, EUS);
      const transfer = run(svc, TRANSFER, EUS);
      expect(eurosat?.status).toBe('unsupported');
      svc.services?.takeSample(SKYLINK_SERVICE, 'application', 'endpoint-report');
      svc.services?.takeSample(EUS, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('comparison', {
          skylink: { value: skylink?.id ?? '' },
          eurosat: { value: eurosat?.id ?? '' },
          transfer: { value: transfer?.id ?? '' },
          unmet: { value: 'delay' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's14-check-dependencies': () => {
      svc.evidence?.recordSelection(['power-station', 'power-strip', 'laptop'], 'Parts both terminals depend on');
      ok(
        svc.records?.submit('dependencies', {
          shared: { value: 'workstation-and-power' },
          separate: { value: 'terminal-account-provider-endpoint' },
          covered: { value: 'terminal-or-service' },
          uncovered: { value: 'power-or-workstation' },
        })
      );
    },
    's14-select-readiness': () => {
      svc.plant.setPartMode('vsat-modem', 'standby');
      tick(2);
      svc.plant.inspect('power-station');
      ok(
        svc.records?.submit('readiness', {
          active: { value: 'run' },
          standby: { value: 'standby' },
          energy: energy(svc),
          recovery: { value: 'about-20-s' },
          reason: { value: 'interactive-needs-skylink' },
        })
      );
    },
    's14-test-readiness': () => {
      svc.plant.setPartMode('vsat-modem', 'run');
      tick(25);
      svc.services?.takeSample(SKYLINK_SERVICE, 'provider', 'provider-portal');
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      const transfer = run(svc, TRANSFER, EUS);
      expect(transfer?.status).toBe('supported');
      svc.services?.takeSample(SKYLINK_SERVICE, 'provider', 'provider-portal');
      svc.services?.takeSample(EUS, 'registration', 'terminal-app');
      svc.plant.inspect('power-station');
      ok(
        svc.records?.submit('transition', {
          skylink: value(svc, SKYLINK_SERVICE, 'provider'),
          registration: value(svc, EUS, 'registration'),
          verified: { value: transfer?.id ?? '' },
          energy: energy(svc),
          interactive: { value: 'unavailable' },
          basis: { cites: obsIds(svc) },
        })
      );
    },
    's14-handover-dual-service': () => {
      svc.plant.setPartMode('skylink-dish', 'standby');
      tick(2);
      svc.plant.inspect('power-station');
      svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'provider-portal');
      svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
      ok(
        svc.records?.submit('dual-handover', {
          active: { value: 'run' },
          standby: { value: 'standby' },
          energy: energy(svc),
          skylink: value(svc, SKYLINK_SERVICE, 'account'),
          remote: value(svc, REMOTE, 'application'),
          policy: { value: 'remains-in-force' },
          shared: { value: 'workstation-and-power' },
          unsupported: { value: INTERACTIVE },
        })
      );
    },
  };
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(14);
  states.clear();
});

afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('M26 S14 completion', () => {
  it('has no placeholder gates and nothing passes before the player acts', () => {
    expect(data.mechanicTodos).toEqual([]);
    expect(JSON.stringify(data.objectives)).not.toContain('pending:');
    const svc = bootScenario(data);
    for (const o of data.objectives) {
      expect(unmet(o as never, svc).length, `${o.id} must not pass on its own`).toBeGreaterThan(0);
    }
  });

  it('completes every objective in order, ends on EuroSat with SkyLink in standby and the remote policy untouched', () => {
    const svc = bootScenario(data);
    const done = driveObjectives(data, svc, states, acts(svc), {});
    expect(done).toEqual(data.objectives.map((o) => o.id));
    tick(2);
    expect(svc.plant.getPartMode('vsat-modem')).toBe('run');
    expect(svc.plant.getPartMode('skylink-dish')).toBe('standby');
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBeUndefined();
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    expect(remote(svc)?.reachable).toBe(false);
    // The exercise ends with the last objective: SkyLink service returns
    expect(svc.services?.getProvider(FORWARD_PROVIDER)?.status).toBe('normal');
    expect(S14_EVENT_RETURN).toBe('s14-skylink-returns');
  });

  it('never freezes the scenario clock', () => {
    expect(data.objectives.some((o) => o.freezesScenarioTimer)).toBe(false);
  });

  it('lifts only the ground restriction: the account recovers while the remote policy stays', () => {
    const svc = bootScenario(data);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    states.set('s14-confirm-restoration', { isActive: true, isCompleted: false });
    tick(5);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    tick(20);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBeUndefined();
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.capacityFactor).toBe(1);
    expect(remote(svc)?.policy).toBe('mobility-restricted');
    expect(remote(svc)?.reachable).toBe(false);
    expect(S14_EVENT_NOTICE).toBe('s14-restoration-notice');
    expect(S14_EVENT_LIFT).toBe('s14-ground-restriction-lifted');
  });

  it('does not accept the notice, or a measurement taken while the restriction was active, as the restoration', () => {
    const svc = bootScenario(data);
    states.set('s14-confirm-restoration', { isActive: true, isCompleted: false });
    tick(3);
    svc.services?.takeSample(SKYLINK_SERVICE, 'account', 'provider-portal');
    const early = run(svc, INTERACTIVE, SKYLINK_SERVICE);
    expect(incomplete(svc, 's14-confirm-restoration').join('|')).toContain('Interactive task verified on SkyLink after the change');
    tick(25);
    // The early run and account sample predate the change; the form must not take them
    const res = svc.records?.submit('restoration', {
      notice: { cites: resultIds(svc) },
      account: { value: 'degraded' },
      verified: { value: early?.id ?? '' },
      remote: value(svc, REMOTE, 'application'),
      policy: { value: 'remains-in-force' },
    });
    expect(res?.ok).toBe(false);
    expect(incomplete(svc, 's14-confirm-restoration').length).toBeGreaterThan(0);
  });

  it('rejects a handover that claims the remote policy was lifted with the ground restriction', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's14-test-readiness' });
    svc.services?.takeSample(REMOTE, 'application', 'endpoint-report');
    const res = svc.records?.submit('dual-handover', {
      active: { value: 'run' },
      standby: { value: 'standby' },
      energy: energy(svc),
      skylink: value(svc, SKYLINK_SERVICE, 'account'),
      remote: { value: 'up' },
      policy: { value: 'lifted' },
      shared: { value: 'workstation-and-power' },
      unsupported: { value: INTERACTIVE },
    });
    expect(res?.ok).toBe(false);
  });

  it('keeps both terminals running from passing the reserve check, and a standby modem passes it', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's14-check-dependencies' });
    states.set('s14-select-readiness', { isActive: true, isCompleted: false });
    svc.plant.setPartMode('vsat-modem', 'run');
    tick(2);
    expect(svc.plant.forecast({}).meetsReserve).toBe(false);
    expect(incomplete(svc, 's14-select-readiness').join('|')).toContain('Forecast keeps the 200 Wh reserve');
    svc.plant.setPartMode('vsat-modem', 'standby');
    tick(2);
    expect(svc.plant.forecast({}).meetsReserve).toBe(true);
    expect(incomplete(svc, 's14-select-readiness')).not.toContain('Forecast keeps the 200 Wh reserve with this arrangement');
  });

  it('needs the standby terminal to finish its startup before the exercise is verified', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's14-select-readiness' });
    states.set('s14-test-readiness', { isActive: true, isCompleted: false });
    tick(2);
    expect(svc.services?.getProvider(FORWARD_PROVIDER)?.status).toBe('outage');
    // The modem is still in standby: the transfer cannot be supported on EuroSat
    const early = svc.workloads?.start(TRANSFER, EUS);
    const result = early?.ok ? svc.workloads?.waitForRun(early.run.id) : undefined;
    expect(result?.status).not.toBe('supported');
    expect(incomplete(svc, 's14-test-readiness').length).toBeGreaterThan(0);
    // The interactive task has no supported route while SkyLink is out
    const interactive = svc.workloads?.start(INTERACTIVE, SKYLINK_SERVICE);
    const iRun = interactive?.ok ? svc.workloads?.waitForRun(interactive.run.id) : undefined;
    expect(iRun?.status).not.toBe('supported');
    expect(S14_EVENT_EXERCISE).toBe('s14-readiness-exercise');
  });

  it('restores a checkpoint taken after the readiness choice and finishes the exercise from it', () => {
    const svc = bootScenario(data);
    driveObjectives(data, svc, states, acts(svc), { stopAfter: 's14-select-readiness' });
    const saved = JSON.parse(JSON.stringify(collectManagerStates()));
    Service.destroy();
    const again = bootScenario(data);
    restoreManagerStates(saved);
    tick(2);
    expect(again.plant.getPartMode('skylink-dish')).toBe('run');
    expect(again.plant.getPartMode('vsat-modem')).toBe('standby');
    expect(again.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBeUndefined();
    expect(remote(again)?.policy).toBe('mobility-restricted');
    expect(again.plant.forecast({}).meetsReserve).toBe(true);
    const done = driveObjectives(data, again, states, acts(again), { startAt: 's14-test-readiness' });
    expect(done).toEqual(['s14-test-readiness', 's14-handover-dual-service']);
    expect(remote(again)?.policy).toBe('mobility-restricted');
  });
});
