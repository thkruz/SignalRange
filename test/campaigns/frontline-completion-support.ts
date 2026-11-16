/**
 * Shared driver for the frontline scenario completion tests (M20). It boots the plant from a
 * scenario's own settings, ticks the sim clock like the app does, and evaluates the authored
 * conditions the way the objectives engine would for the three condition types these scenarios use.
 */

import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { Condition, Objective } from '@app/objectives/objective-types';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { ScenarioManager } from '@app/scenario-manager';
import { SimClock } from '@app/simulation/sim-clock';

export type ObjectiveStates = Map<string, { isActive: boolean; isCompleted: boolean }>;

/** A fresh deep copy of the scenario's plant config, so a test never mutates the shared scenario data */
export function bootScenario(data: FrontlineScenarioData): PhysicalPlantService {
  const cfg = structuredClone(data.settings?.physicalPlant);
  ScenarioManager.getInstance().settings = { physicalPlant: cfg } as never;

  return PhysicalPlantService.getInstance();
}

export function tick(seconds = 1): void {
  for (let i = 0; i < seconds; i++) {
    SimClock.skip(1000);
    EventBus.getInstance().emit(Events.UPDATE, 1 as never);
  }
}

export function conditionMet(c: Condition, svc: PhysicalPlantService): boolean {
  if (c.type === 'custom') {
    return (c.params as { evaluator: () => boolean }).evaluator();
  }
  if (c.type === 'part-inspected') {
    return svc.plant.hasInspected((c.params as { partId: string }).partId);
  }
  if (c.type === 'plant-fault-cleared') {
    return !svc.plant.getFaults().some((f) => f.id === (c.params as { faultId: string }).faultId);
  }
  if (c.type === 'status-check') {
    // The QuizManager grades the answer; the unit test treats the quiz as answered
    return true;
  }
  throw new Error(`Unhandled condition type ${c.type}`);
}

export const unmet = (obj: Objective, svc: PhysicalPlantService): string[] => obj.conditions.filter((c) => !conditionMet(c, svc)).map((c) => c.description ?? c.type);

export function activate(states: ObjectiveStates, obj: Objective): void {
  states.set(obj.id, { isActive: true, isCompleted: false });
}

export function complete(states: ObjectiveStates, obj: Objective): void {
  states.set(obj.id, { isActive: false, isCompleted: true });
}

/**
 * Runs the objectives in authored order: each one must be incomplete (or only quiz-gated) before the
 * player acts, complete after, and its prerequisites must already be complete.
 */
export function driveObjectives(
  data: FrontlineScenarioData,
  svc: PhysicalPlantService,
  states: ObjectiveStates,
  acts: Record<string, () => void>,
  opts: { stopAfter?: string; startAt?: string } = {}
): string[] {
  const done: string[] = [];
  const objectives = data.objectives as Objective[];
  let started = opts.startAt === undefined;
  for (const obj of objectives) {
    if (!started) {
      if (obj.id !== opts.startAt) {
        continue;
      }
      started = true;
    }
    for (const pre of obj.prerequisiteObjectiveIds ?? []) {
      if (states.get(pre)?.isCompleted !== true) {
        throw new Error(`${obj.id}: prerequisite ${pre} is not complete`);
      }
    }
    activate(states, obj);
    tick();
    const act = acts[obj.id];
    if (!act) {
      throw new Error(`No player actions for ${obj.id}`);
    }
    act();
    const missing = unmet(obj, svc);
    if (missing.length > 0) {
      throw new Error(`${obj.id} is not complete after the player's actions; unmet: ${missing.join(' | ')}`);
    }
    complete(states, obj);
    done.push(obj.id);
    tick();
    if (opts.stopAfter === obj.id) {
      break;
    }
  }

  return done;
}
