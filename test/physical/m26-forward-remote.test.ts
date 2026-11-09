/**
 * M26: the remote SkyLink path, the dual-readiness plan, and the workload runner's handling of a down layer behind a
 * degraded (restricted) account.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import {
  applyForwardDualReadiness,
  applyForwardRemote,
  DUAL_RESERVE_WH,
  DUAL_START_WH,
  FORWARD_REMOTE_ENDPOINT,
  FORWARD_REMOTE_SERVICE,
  FORWARD_SKYLINK_ACCOUNT,
} from '@app/campaigns/frontline/forward-field-config';
import { frontlineScenario13Data } from '@app/campaigns/frontline/scenario13';
import { frontlineScenario14Data } from '@app/campaigns/frontline/scenario14';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario } from '../campaigns/frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(26);
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

function runCard(svc: PhysicalPlantService, card: string, service: string) {
  const start = svc.workloads?.start(card, service);
  expect(start?.ok, JSON.stringify(start)).toBe(true);

  return svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
}

describe('M26 forward remote path', () => {
  it('adds a remote path with its own endpoint on the SkyLink terminal, account and provider', () => {
    const svc = bootScenario(frontlineScenario13Data);
    const state = svc.services?.getState();
    const remote = svc.services?.getPath(FORWARD_REMOTE_SERVICE);
    const skylink = svc.services?.getPath(SKYLINK_SERVICE);
    expect(remote?.endpointIds).toEqual([FORWARD_REMOTE_ENDPOINT]);
    expect(remote?.accountId).toBe(skylink?.accountId);
    expect(remote?.providerId).toBe(skylink?.providerId);
    expect(state?.endpoints.find((e) => e.id === FORWARD_REMOTE_ENDPOINT)).toMatchObject({ reachable: true });
  });

  it('starts S14 with the remote policy in force and the ground restriction separate', () => {
    const svc = bootScenario(frontlineScenario14Data);
    expect(svc.services?.getState().endpoints.find((e) => e.id === FORWARD_REMOTE_ENDPOINT)).toMatchObject({ reachable: false, policy: 'mobility-restricted' });
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
  });

  it('throws when the field layer is missing', () => {
    expect(() => applyForwardRemote({ parts: [] } as never)).toThrow();
    expect(() => applyForwardDualReadiness({ parts: [] } as never)).toThrow();
  });

  it('dual readiness: both terminals switchable, two running misses the reserve, one running keeps it', () => {
    const svc = bootScenario(frontlineScenario14Data);
    expect(svc.plant.getPowerReadings().reserveWh).toBe(DUAL_RESERVE_WH);
    expect(svc.plant.getPowerReadings().socWh['power-station']).toBeLessThanOrEqual(DUAL_START_WH);
    expect(svc.plant.forecast({}).meetsReserve).toBe(false);
    expect(svc.plant.forecast({ 'vsat-modem': 'standby' }).meetsReserve).toBe(true);
    expect(svc.plant.forecast({ 'skylink-dish': 'standby' }).meetsReserve).toBe(true);
  });
});

describe('workload runner: a down layer behind a degraded account', () => {
  it('reports a down remote endpoint as unsupported even though the account layer is degraded first', () => {
    const svc = bootScenario(frontlineScenario14Data);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    const result = runCard(svc, 'fwd-transfer', FORWARD_REMOTE_SERVICE);
    expect(result?.status).toBe('unsupported');
  });

  it('still supports a run on a restricted account when every other layer is up', () => {
    const svc = bootScenario(frontlineScenario14Data);
    expect(svc.services?.getAccount(FORWARD_SKYLINK_ACCOUNT)?.restriction).toBe('ground-capacity');
    const result = runCard(svc, 'fwd-transfer', SKYLINK_SERVICE);
    expect(result?.status).toBe('supported');
  });
});
