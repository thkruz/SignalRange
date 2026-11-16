import { frontlineCampaignData } from '@app/campaigns/frontline/campaign-data';
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { createFrontlineSettings, pendingMechanic } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenarios } from '@app/campaigns/frontline/scenarios';
import { Character, CharacterNames, Emotion, getCharacterAvatarUrl } from '@app/modal/character-enum';
import { describe, expect, it } from 'vitest';

describe('Frontline authored curriculum', () => {
  it('registers sixteen ordered drafts alongside the sandboxes', () => {
    expect(frontlineScenarios.map((scenario) => scenario.number)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    expect(new Set(frontlineScenarios.map((scenario) => scenario.id)).size).toBe(16);
    expect(new Set(frontlineScenarios.map((scenario) => scenario.url)).size).toBe(16);
    expect(frontlineCampaignData.scenarios?.map((scenario) => scenario.id)).toEqual([
      'frontline-sandbox',
      'frontline-sandbox-forward',
      'frontline-sandbox-forward-eurosat',
      ...frontlineScenarios.map((scenario) => scenario.id),
    ]);
  });

  for (const scenario of frontlineScenarios) {
    describe(scenario.id, () => {
      it('has a reachable objective graph and dialogue keyed to real objectives', () => {
        const objectives = scenario.objectives ?? [];
        expect(objectives.length).toBeGreaterThanOrEqual(6);
        const reached = new Set<string>();
        for (const objective of objectives) {
          expect(reached.has(objective.id), `Duplicate objective ${objective.id}`).toBe(false);
          for (const prerequisite of objective.prerequisiteObjectiveIds ?? []) {
            expect(reached.has(prerequisite), `${objective.id} has a missing or later prerequisite ${prerequisite}`).toBe(true);
          }
          expect(objective.conditions.length, objective.id).toBeGreaterThan(0);
          reached.add(objective.id);
        }
        const expectedPrerequisites = scenario.number === 1 ? [] : [`frontline-scenario${scenario.number - 1}`];
        expect(scenario.prerequisiteScenarioIds ?? []).toEqual(expectedPrerequisites);
        expect(scenario.dialogClips?.intro?.text).toBeTruthy();
        for (const clips of [scenario.dialogClips?.objectives, scenario.dialogClips?.objectivesOnStart]) {
          for (const [objectiveId, clip] of Object.entries(clips ?? {})) {
            expect(reached.has(objectiveId), `Orphan dialogue ${objectiveId}`).toBe(true);
            expect(clip.text).toBeTruthy();
            expect(CharacterNames[clip.character]).toBeTruthy();
          }
        }
      });

      it('is playable only once no mechanic TODOs remain, and keeps any TODOs traceable', () => {
        expect(scenario.isDisabled).toBe(scenario.mechanicTodos.length > 0);
        // A converted scenario (M20) has no todos left and no pending gates; an unconverted one still has both
        const todos = new Map(scenario.mechanicTodos.map((todo) => [todo.id, todo]));
        expect(todos.size).toBe(scenario.mechanicTodos.length);
        const objectives = scenario.objectives ?? [];
        for (const todo of todos.values()) {
          expect(todo.requirement.trim().length).toBeGreaterThan(0);
          expect(todo.acceptanceCriteria.length).toBeGreaterThan(0);
          expect(todo.objectiveIds.length).toBeGreaterThan(0);
          for (const objectiveId of todo.objectiveIds) {
            expect(
              objectives.some((objective) => objective.id === objectiveId),
              `${todo.id} references ${objectiveId}`
            ).toBe(true);
          }
        }
        let blockedCount = 0;
        for (const objective of objectives) {
          for (const condition of objective.conditions) {
            expect(condition.type, 'service-continuity currently always passes').not.toBe('service-continuity');
            if (condition.type !== 'custom') {
              continue;
            }
            expect(condition.id, `${objective.id}: custom checks need stable IDs`).toBeTruthy();
            expect(condition.params?.evaluator).toBeTypeOf('function');
            if (!condition.id?.startsWith('pending:')) {
              continue;
            }
            const todoId = condition.id!.slice('pending:'.length);
            expect(todos.get(todoId)?.objectiveIds, `Undocumented blocker ${todoId}`).toContain(objective.id);
            expect(condition.params?.evaluator?.(), `${todoId} must fail closed`).toBe(false);
            blockedCount++;
          }
        }
        if (todos.size === 0) {
          expect(blockedCount, 'a scenario with no TODOs keeps no pending gates').toBe(0);
        } else {
          expect(blockedCount).toBeGreaterThan(0);
        }
      });

      it('references configured physical targets and valid knowledge-check options', () => {
        const plant = scenario.settings.physicalPlant!;
        expect(plant).toBeDefined();
        const targets = new Set([...plant.parts, ...plant.cables, ...plant.connectors].map((item) => item.id));
        for (const objective of scenario.objectives ?? []) {
          for (const condition of objective.conditions) {
            if (['part-inspected', 'part-measured', 'part-swapped'].includes(condition.type)) {
              expect(targets.has(condition.params?.partId ?? ''), `${objective.id} names an unavailable part`).toBe(true);
            }
            if (condition.type === 'status-check') {
              const { options, correctIndex, question, explanation, character } = condition.params ?? {};
              expect(question).toBeTruthy();
              expect(explanation).toBeTruthy();
              expect(options?.length).toBeGreaterThanOrEqual(1);
              expect(options?.length).toBeLessThanOrEqual(4);
              expect(Number.isInteger(correctIndex)).toBe(true);
              expect(correctIndex).toBeGreaterThanOrEqual(0);
              expect(correctIndex).toBeLessThan(options!.length);
              expect(character, 'C6 must not fall back to the NATS instructor').toBeDefined();
            }
          }
        }
      });
    });
  }
});

describe('Frontline authoring safeguards', () => {
  it('fails closed even if someone bypasses the disabled scenario card', () => {
    const condition = pendingMechanic('C6-TEST', 'Fresh Service Verification');
    expect(condition.params?.evaluator?.()).toBe(false);
    expect(condition.mustMaintain).toBe(true);
  });

  it('isolates authored physical state between scenarios and the sandbox', () => {
    const first = createFrontlineSettings(1);
    const second = createFrontlineSettings(2);
    const originalLabel = frontlinePlantConfig.parts[0].label;
    first.physicalPlant!.parts[0].label = 'Changed only in this exercise';
    expect(second.physicalPlant!.parts[0].label).toBe(originalLabel);
    expect(frontlinePlantConfig.parts[0].label).toBe(originalLabel);
    first.groundStations[0].name = 'Changed station';
    expect(second.groundStations[0].name).toBe('Kivilahti Training Camp');
  });

  it('does not inherit the camp trip limit at the forward location', () => {
    expect(createFrontlineSettings(8).physicalPlant?.tripLimit).toBe(3);
    expect(createFrontlineSettings(8).physicalPlant?.site?.mode).toBe('camp');
    expect(createFrontlineSettings(9).physicalPlant?.site?.mode).toBe('forward');
  });

  it('keeps draft portraits usable across emotions without requesting nonexistent variants', () => {
    for (const character of [Character.ALEKSANDRA_WYSOCKA, Character.MAREK_DOMANSKI, Character.IRENA_MAZUR, Character.TOMASZ_WRONA]) {
      expect(getCharacterAvatarUrl(character, Emotion.HAPPY)).toBe('/images/placeholder-avatar.png');
      expect(getCharacterAvatarUrl(character, Emotion.CONCERNED)).toBe('/images/placeholder-avatar.png');
    }
  });
});
