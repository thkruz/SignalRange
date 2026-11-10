/**
 * M02 objective-anchored plant event controller: fires once after its anchor, offset and
 * requiresFired respected, restore never re-applies and never drops a fault.
 */

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, PlantEventConfig } from '@app/physical/physical-plant-types';
import { PlantEventController, type PlantEventTarget } from '@app/physical/plant-event-controller';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const objectives = vi.hoisted(() => ({ states: new Map<string, { isActive: boolean; isCompleted: boolean }>() }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: (id: string) => objectives.states.get(id) } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

const FAULT_ID = 'c6-s4-terminal-obstruction';
const ANCHOR = 's4-observe-recovery';

const s4Events: PlantEventConfig[] = [
  {
    id: 'obstruction',
    startAfterObjectiveId: ANCHOR,
    actions: [{ kind: 'inject-fault', fault: { id: FAULT_ID, target: 'skylink-dish', kind: 'net' } }],
  },
];

const live = (id: string): void => {
  objectives.states.set(id, { isActive: true, isCompleted: false });
};

function makeRig(events: PlantEventConfig[]) {
  const config: PlantConfig = { ...structuredClone(frontlinePlantConfig), faults: [], events };
  let t = 0;
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(config, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`m02:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  const weather = vi.fn();
  const target: PlantEventTarget = {
    injectFault: vi.fn((f) => plant.injectFault(f)),
    clearFault: vi.fn((id) => plant.clearFault(id)),
    setWeather: weather,
  };
  const controller = new PlantEventController(events, target);

  return { plant, target, controller, weather };
}

const hasFault = (plant: PhysicalPlantManager): boolean => plant.getFaults().some((f) => f.id === FAULT_ID);

describe('M02 plant event controller', () => {
  beforeEach(() => objectives.states.clear());

  it('stays dormant until the anchor is live, then fires once on the same update (S4 shape)', () => {
    const { plant, target, controller } = makeRig(s4Events);
    controller.update(10);
    controller.update(500);
    expect(hasFault(plant)).toBe(false);
    expect(controller.hasFired('obstruction')).toBe(false);

    live(ANCHOR);
    controller.update(900);
    expect(hasFault(plant)).toBe(true);
    expect(controller.firedAtS('obstruction')).toBe(900);

    controller.update(901);
    controller.update(2000);
    expect(target.injectFault).toHaveBeenCalledTimes(1);
  });

  it('a slow reader gets the event relative to when the anchor came up', () => {
    const { controller } = makeRig([{ ...s4Events[0], offsetS: 30 }]);
    live(ANCHOR);
    controller.update(5000);
    expect(controller.hasFired('obstruction')).toBe(false);
    controller.update(5029);
    expect(controller.hasFired('obstruction')).toBe(false);
    controller.update(5030);
    expect(controller.firedAtS('obstruction')).toBe(5030);
  });

  it('a completed anchor counts as live', () => {
    const { controller } = makeRig(s4Events);
    objectives.states.set(ANCHOR, { isActive: false, isCompleted: true });
    controller.update(1);
    expect(controller.hasFired('obstruction')).toBe(true);
  });

  it('requiresFired holds an event until the earlier one has fired', () => {
    const events: PlantEventConfig[] = [
      { id: 'external', startAfterObjectiveId: 'a', requiresFired: ['local'], actions: [{ kind: 'set-flag', key: 'ext', value: true }] },
      { id: 'local', startAfterObjectiveId: 'b', actions: [{ kind: 'set-flag', key: 'loc', value: 1 }] },
    ];
    const { controller } = makeRig(events);
    live('a');
    controller.update(10);
    expect(controller.hasFired('external')).toBe(false);
    live('b');
    controller.update(20);
    expect(controller.hasFired('local')).toBe(true);
    expect(controller.hasFired('external')).toBe(true);
    expect(controller.getFlags()).toEqual({ ext: true, loc: 1 });
  });

  it('weather, clear-fault and flag actions run', () => {
    const events: PlantEventConfig[] = [
      {
        id: 'on',
        startAfterObjectiveId: 'a',
        actions: [
          { kind: 'inject-fault', fault: { id: FAULT_ID, target: 'skylink-dish', kind: 'net' } },
          { kind: 'set-weather', weather: { snow: true } },
        ],
      },
      {
        id: 'off',
        startAfterObjectiveId: 'a',
        requiresFired: ['on'],
        offsetS: 60,
        actions: [
          { kind: 'clear-fault', faultId: FAULT_ID },
          { kind: 'set-flag', key: 'k', value: 'v' },
        ],
      },
    ];
    const { plant, controller, weather } = makeRig(events);
    live('a');
    controller.update(0);
    expect(hasFault(plant)).toBe(true);
    expect(weather).toHaveBeenCalledWith({ snow: true });
    controller.update(60);
    expect(hasFault(plant)).toBe(false);
    expect(controller.getFlag('k')).toBe('v');
  });

  it('restore after fire neither re-injects nor drops the fault', () => {
    const first = makeRig(s4Events);
    live(ANCHOR);
    first.controller.update(100);
    const plantState = JSON.parse(JSON.stringify(first.plant.getState()));
    const eventState = JSON.parse(JSON.stringify(first.controller.getState()));

    objectives.states.clear();
    const second = makeRig(s4Events);
    second.plant.restoreState(plantState);
    second.controller.restoreState(eventState);
    expect(second.controller.hasFired('obstruction')).toBe(true);
    expect(hasFault(second.plant)).toBe(true);
    live(ANCHOR);
    second.controller.update(200);
    expect(second.target.injectFault).not.toHaveBeenCalled();
    expect(hasFault(second.plant)).toBe(true);
  });

  it('restore before fire still fires, keeping the original anchor time', () => {
    const events = [{ ...s4Events[0], offsetS: 100 }];
    const first = makeRig(events);
    live(ANCHOR);
    first.controller.update(1000);
    const eventState = JSON.parse(JSON.stringify(first.controller.getState()));
    expect(eventState.fired).toEqual([]);

    const second = makeRig(events);
    second.controller.restoreState(eventState);
    second.controller.update(1099);
    expect(second.controller.hasFired('obstruction')).toBe(false);
    second.controller.update(1100);
    expect(hasFault(second.plant)).toBe(true);
  });

  it('onFire reports each event once with its time', () => {
    const { controller, target } = makeRig(s4Events);
    const onFire = vi.fn();
    target.onFire = onFire;
    live(ANCHOR);
    controller.update(7);
    controller.update(8);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire).toHaveBeenCalledWith('obstruction', 7, undefined);
  });
});
