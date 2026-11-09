import type { FrontlineScenarioData } from '@app/campaigns/frontline/scenario-support';
import { frontlineScenario1Data } from '@app/campaigns/frontline/scenario1';
import { frontlineScenario2Data } from '@app/campaigns/frontline/scenario2';
import { frontlineScenario3Data } from '@app/campaigns/frontline/scenario3';
import { frontlineScenario4Data } from '@app/campaigns/frontline/scenario4';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@app/physical/physical-plant-service', () => ({
  PhysicalPlantService: { plantOrNull: vi.fn() },
}));

function makePlant(scenario: FrontlineScenarioData): PhysicalPlantManager {
  const config = scenario.settings.physicalPlant;
  if (!config) {
    throw new Error('Test requires an authored plant');
  }
  let now = 0;
  const plant = new PhysicalPlantManager(structuredClone(config), {
    now: () => now,
    skip: (seconds) => {
      now += seconds;
    },
    env: () => ({ ambientC: 15, windMps: 0, rainMmH: 0 }),
    rng: () => ({ next: () => 0.5 }),
  });
  vi.mocked(PhysicalPlantService.plantOrNull).mockReturnValue(plant);

  return plant;
}

function evaluate(scenario: FrontlineScenarioData, conditionId: string): boolean {
  const condition = scenario.objectives?.flatMap((objective) => objective.conditions).find((candidate) => candidate.id === conditionId);
  expect(condition?.type).toBe('custom');
  const evaluator = condition?.params?.evaluator;
  expect(evaluator).toBeTypeOf('function');

  return evaluator?.() ?? false;
}

afterEach(() => vi.resetAllMocks());

describe('Frontline camp physical assessments', () => {
  it('keeps the reduced S2 starting reserve isolated from the healthy S1 kit', () => {
    const energy = (scenario: FrontlineScenarioData) => scenario.settings.physicalPlant?.parts.find((part) => part.id === 'power-station')?.socWh;
    expect(energy(frontlineScenario1Data)).toBe(900);
    expect(energy(frontlineScenario2Data)).toBe(450);
  });

  it('does not award evidence when no plant exists', () => {
    vi.mocked(PhysicalPlantService.plantOrNull).mockReturnValue(null);
    expect(evaluate(frontlineScenario3Data, 's3-observed-connector-evidence')).toBe(false);
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(false);
    expect(evaluate(frontlineScenario4Data, 's4-observed-environment-evidence')).toBe(false);
    expect(evaluate(frontlineScenario4Data, 's4-evidence-before-correction')).toBe(false);
  });

  it('requires actual S3 fault evidence before an effective repair', () => {
    const plant = makePlant(frontlineScenario3Data);
    expect(plant.getFaults()).toEqual([{ id: 'c6-s3-terminal-moisture', target: 'spacey-cable:dish', kind: 'moisture', severity: 0.8 }]);
    expect(evaluate(frontlineScenario3Data, 's3-observed-connector-evidence')).toBe(false);
    plant.inspect('spacey-router');
    expect(evaluate(frontlineScenario3Data, 's3-observed-connector-evidence')).toBe(false);
    plant.inspect('spacey-cable:dish');
    expect(evaluate(frontlineScenario3Data, 's3-observed-connector-evidence')).toBe(true);
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(false);
    plant.seal('spacey-cable:dish');
    expect(plant.isFaultCleared('c6-s3-terminal-moisture')).toBe(true);
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(true);
    expect(evaluate(frontlineScenario3Data, 'c6:workloadVerified:ola-check:skylink:after-c6-s3-terminal-moisture')).toBe(false);
  });

  it('accepts the supported connector replacement after observation', () => {
    const plant = makePlant(frontlineScenario3Data);
    plant.inspect('spacey-cable:dish');
    plant.swap('spacey-cable:dish');
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(true);
    expect(plant.getSpares()['connector-kit']).toBe(0);
  });

  it('rejects an S3 repair performed before fault evidence was collected', () => {
    const plant = makePlant(frontlineScenario3Data);
    plant.seal('spacey-cable:dish');
    plant.inspect('spacey-cable:dish');
    expect(plant.isFaultCleared('c6-s3-terminal-moisture')).toBe(true);
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(false);
  });

  it('preserves evidence and repair ordering through a checkpoint restore', () => {
    const plant = makePlant(frontlineScenario3Data);
    plant.inspect('spacey-cable:dish');
    plant.seal('spacey-cable:dish');
    const checkpoint = plant.getState();
    const restored = makePlant(frontlineScenario3Data);
    restored.restoreState(checkpoint);
    expect(evaluate(frontlineScenario3Data, 's3-observed-connector-evidence')).toBe(true);
    expect(evaluate(frontlineScenario3Data, 's3-evidence-before-intervention')).toBe(true);
  });

  it('keeps S4 recovery healthy until the future stage event injects the obstruction', () => {
    const plant = makePlant(frontlineScenario4Data);
    expect(plant.getFaults()).toEqual([]);
    expect(evaluate(frontlineScenario4Data, 's4-observed-environment-evidence')).toBe(false);
    // Stand in for the s4-obstruction event, which the completion test drives for real.
    plant.injectFault({ id: 'c6-s4-terminal-obstruction', target: 'spacey-dish', kind: 'net' });
    plant.inspect('spacey-dish');
    expect(evaluate(frontlineScenario4Data, 's4-observed-environment-evidence')).toBe(true);
    expect(evaluate(frontlineScenario4Data, 's4-evidence-before-correction')).toBe(false);
    plant.removeNet('spacey-dish');
    expect(plant.isFaultCleared('c6-s4-terminal-obstruction')).toBe(true);
    expect(evaluate(frontlineScenario4Data, 's4-evidence-before-correction')).toBe(true);
    expect(evaluate(frontlineScenario4Data, 'c6:workloadVerified:ola-check:skylink:after-c6-s4-terminal-obstruction')).toBe(false);
  });

  it('rejects an S4 correction that preceded inspection', () => {
    const plant = makePlant(frontlineScenario4Data);
    plant.injectFault({ id: 'c6-s4-terminal-obstruction', target: 'spacey-dish', kind: 'net' });
    plant.removeNet('spacey-dish');
    plant.inspect('spacey-dish');
    expect(evaluate(frontlineScenario4Data, 's4-evidence-before-correction')).toBe(false);
  });
});
