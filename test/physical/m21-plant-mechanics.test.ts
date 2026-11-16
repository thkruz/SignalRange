/**
 * M21 shared mechanics: the reboot-part event action, startBoot, spendTime, samplesFor and the
 * new frontline condition factories on a staged scenario plant.
 */

import { SKYLINK_SERVICE } from '@app/campaigns/frontline/camp-field-config';
import { hypothesisFiled, interruptionPattern, negativeChecksKept, sampleAfterEvent } from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenario4Data } from '@app/campaigns/frontline/scenario4';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantEventConfig } from '@app/physical/physical-plant-types';
import { PlantEventController, type PlantEventTarget } from '@app/physical/plant-event-controller';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, conditionMet, tick } from '../campaigns/frontline-completion-support';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(5);
  objectives.states.clear();
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

describe('M21 reboot-part event', () => {
  it('calls the target once and survives a restore without re-firing', () => {
    const events: PlantEventConfig[] = [{ id: 'reboot', startAfterObjectiveId: 'anchor', actions: [{ kind: 'reboot-part', partId: 'skylink-dish' }] }];
    const rebootPart = vi.fn();
    const target: PlantEventTarget = { injectFault: vi.fn(), clearFault: vi.fn(() => true), setWeather: vi.fn(), rebootPart };
    const controller = new PlantEventController(events, target);
    controller.update(5);
    expect(rebootPart).not.toHaveBeenCalled();
    objectives.states.set('anchor', { isActive: true, isCompleted: false });
    controller.update(10);
    controller.update(20);
    expect(rebootPart).toHaveBeenCalledTimes(1);
    expect(rebootPart).toHaveBeenCalledWith('skylink-dish');
    const again = new PlantEventController(events, target);
    again.restoreState(controller.getState());
    again.update(30);
    expect(rebootPart).toHaveBeenCalledTimes(1);
  });

  it('ignores the action on a target without rebootPart', () => {
    const events: PlantEventConfig[] = [{ id: 'reboot', startAfterObjectiveId: 'anchor', actions: [{ kind: 'reboot-part', partId: 'x' }] }];
    objectives.states.set('anchor', { isActive: true, isCompleted: false });
    const controller = new PlantEventController(events, { injectFault: vi.fn(), clearFault: vi.fn(() => true), setWeather: vi.fn() });
    controller.update(1);
    expect(controller.hasFired('reboot')).toBe(true);
  });
});

describe('M21 startBoot, spendTime and samplesFor', () => {
  it('startBoot holds registration down for the 90 s boot, then it comes up', () => {
    const svc = bootScenario(frontlineScenario4Data);
    tick(200);
    expect(svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'local-probe').value).toBe('up');
    svc.plant.startBoot('skylink-dish');
    tick(1);
    expect(svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'local-probe').value).toBe('down');
    tick(100);
    expect(svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'local-probe').value).toBe('up');
  });

  it('startBoot ignores an unknown part', () => {
    const svc = bootScenario(frontlineScenario4Data);
    expect(() => svc.plant.startBoot('no-such-part')).not.toThrow();
  });

  it('spendTime advances the scenario clock and ignores zero or negative', () => {
    const svc = bootScenario(frontlineScenario4Data);
    tick(1);
    const t0 = svc.plant.getTimeSeconds();
    svc.plant.spendTime(15);
    expect(svc.plant.getTimeSeconds()).toBe(t0 + 15);
    svc.plant.spendTime(0);
    svc.plant.spendTime(-5);
    expect(svc.plant.getTimeSeconds()).toBe(t0 + 15);
  });

  it('samplesFor returns copies in the order taken, per service', () => {
    const svc = bootScenario(frontlineScenario4Data);
    svc.services?.takeSample(SKYLINK_SERVICE, 'power', 'device-indicator');
    svc.services?.takeSample(SKYLINK_SERVICE, 'local', 'device-indicator');
    svc.services?.takeSample('camp-vsat', 'power', 'device-indicator');
    const list = svc.services?.samplesFor(SKYLINK_SERVICE) ?? [];
    expect(list.map((s) => s.layer)).toEqual(['power', 'local']);
    const first = list[0].value;
    list[0].value = 'down';
    expect(svc.services?.samplesFor(SKYLINK_SERVICE)[0].value).toBe(first);
    expect(svc.services?.samplesFor('nope')).toEqual([]);
  });
});

describe('M21 condition factories', () => {
  it('interruptionPattern is false with no history', () => {
    const svc = bootScenario(frontlineScenario4Data);
    expect(conditionMet(interruptionPattern(SKYLINK_SERVICE, 1), svc)).toBe(false);
  });

  it('negativeChecksKept and hypothesisFiled stay false on an empty log', () => {
    const svc = bootScenario(frontlineScenario4Data);
    expect(conditionMet(negativeChecksKept(1), svc)).toBe(false);
    expect(conditionMet(hypothesisFiled(['a']), svc)).toBe(false);
  });

  it('sampleAfterEvent is false before the event fires', () => {
    const svc = bootScenario(frontlineScenario4Data);
    svc.services?.takeSample(SKYLINK_SERVICE, 'registration', 'local-probe');
    expect(conditionMet(sampleAfterEvent(SKYLINK_SERVICE, 'registration', 'down', 's4-obstruction'), svc)).toBe(false);
  });
});
