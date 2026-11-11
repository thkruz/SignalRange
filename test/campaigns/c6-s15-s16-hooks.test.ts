/**
 * S15 unreachable-reserve fail check and S16 supply-restart alarm / energy cost hooks.
 */

import { reserveUnreachable, reserveUnreachableMessage } from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenario15Data, S15_PARK_DELAY_S } from '@app/campaigns/frontline/scenario15';
import { frontlineScenario16Data } from '@app/campaigns/frontline/scenario16';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService as Service } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, conditionMet, tick } from './frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }), hasInstance: () => true, destroy: () => undefined },
}));

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(1);
});
afterEach(() => {
  Service.destroy();
  EventBus.destroy();
});

describe('S15 unreachable reserve', () => {
  it('declares the objective with a fail check and message', () => {
    const objective = frontlineScenario15Data.objectives?.find((o) => o.id === 's15-maintain-supported-work');
    expect(objective?.failWhen).toBeDefined();
    expect(typeof objective?.failMessage).toBe('function');
  });

  it('does not fire at the start or while the modem can still be parked in time', () => {
    const svc = bootScenario(frontlineScenario15Data);
    expect(svc.plant.reserveOutlook()?.unreachable).toBe(false);
    expect(conditionMet(reserveUnreachable(), svc)).toBe(false);
    tick(S15_PARK_DELAY_S - 300);
    expect(svc.plant.reserveOutlook()?.unreachable).toBe(false);
  });

  it('fires once even standby everywhere cannot hold the reserve, and the message quotes the forecast', () => {
    const svc = bootScenario(frontlineScenario15Data);
    tick(S15_PARK_DELAY_S * 2.5);
    const outlook = svc.plant.reserveOutlook();
    expect(outlook?.unreachable).toBe(true);
    expect(outlook?.bestProjectedWh).toBeLessThan(outlook?.reserveWh ?? 0);
    expect(conditionMet(reserveUnreachable(), svc)).toBe(true);
    const message = reserveUnreachableMessage('the end of the shift');
    expect(message).toContain('150 Wh reserve');
    expect(message).toContain('lowest-power mode');
  });
});

describe('S16 supply restart alarm and energy cost', () => {
  it('records a supply-caused terminal restart and notifies the listener, pointing at the supply', () => {
    const svc = bootScenario(frontlineScenario16Data);
    const heard: string[] = [];
    svc.plant.setSupplyRestartListener((r) => heard.push(`${r.label}|${r.sourceLabel}`));
    svc.plant.injectFault({ id: 'test-seat', target: 'ps:ac-out', kind: 'partial-seat' });
    tick(1800);
    const restarts = svc.plant.getSupplyRestarts();
    expect(restarts.length).toBeGreaterThan(0);
    expect(heard.length).toBe(restarts.length);
    expect(restarts[0].sourceLabel.length).toBeGreaterThan(0);
  });

  it('reports the battery draw so action buttons can show an energy cost', () => {
    const svc = bootScenario(frontlineScenario16Data);
    expect(svc.plant.getBatteryDrawW()).toBeGreaterThan(0);
  });
});
