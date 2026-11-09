/**
 * M24 unit tests: the freshnessIs handover rule, the diagram-selection condition, workloadVerified afterHandover,
 * the forward field config and the capacity-restriction workload rule.
 */

import { applyForwardField, FORWARD_SKYLINK_ACCOUNT } from '@app/campaigns/frontline/forward-field-config';
import { diagramSelection, workloadVerified } from '@app/campaigns/frontline/frontline-conditions';
import { frontlineScenario9Data } from '@app/campaigns/frontline/scenario9';
import { frontlineScenario10Data } from '@app/campaigns/frontline/scenario10';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootScenario, conditionMet, tick } from '../campaigns/frontline-completion-support';

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

function takeThree(svc: PhysicalPlantService): void {
  svc.services?.takeSample('skylink', 'local', 'local-probe');
  svc.services?.takeSample('skylink', 'registration', 'terminal-app');
  svc.services?.takeSample('skylink', 'application', 'endpoint-report');
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(24);
});

afterEach(() => {
  PhysicalPlantService.destroy();
  EventBus.destroy();
});

describe('M24 freshnessIs rule', () => {
  const answers = (v: string) => ({ local: { value: v }, registration: { value: v }, remote: { value: v } });

  it('accepts the real freshness and rejects the other answers', () => {
    const svc = bootScenario(frontlineScenario9Data);
    takeThree(svc);
    expect(svc.records?.submit('freshness', answers('last-known'))?.ok).toBe(false);
    expect(svc.records?.submit('freshness', answers('current'))?.ok).toBe(true);
  });

  it('reads a sample as last-known once an event invalidates it', () => {
    const svc = bootScenario(frontlineScenario9Data);
    takeThree(svc);
    svc.services?.bumpEvent('test-event');
    expect(svc.records?.submit('freshness', answers('current'))?.ok).toBe(false);
    expect(svc.records?.submit('freshness', answers('last-known'))?.ok).toBe(true);
  });

  it('fails while a layer has never been read', () => {
    const svc = bootScenario(frontlineScenario9Data);
    expect(svc.records?.submit('freshness', answers('unavailable'))?.ok).toBe(false);
  });
});

describe('M24 diagramSelection condition', () => {
  it('needs all included nodes, none of the excluded ones, and a selection after the event when given', () => {
    const svc = bootScenario(frontlineScenario9Data);
    const cond = diagramSelection({ include: ['a', 'b'], exclude: ['z'] }, 'sel');
    expect(conditionMet(cond, svc)).toBe(false);
    svc.evidence?.recordSelection(['a'], 'partial');
    svc.evidence?.recordSelection(['a', 'b', 'z'], 'excluded');
    expect(conditionMet(cond, svc)).toBe(false);
    svc.evidence?.recordSelection(['a', 'b'], 'good');
    expect(conditionMet(cond, svc)).toBe(true);
    expect(conditionMet(diagramSelection({ include: ['a'], afterEvent: 'never-fires' }, 'timed'), svc)).toBe(false);
    expect(conditionMet(diagramSelection({ include: ['a'], diagramId: 'other' }, 'other diagram'), svc)).toBe(false);
  });
});

describe('M24 workloadVerified afterHandover', () => {
  it('ignores runs that started before the form was filed', () => {
    const svc = bootScenario(frontlineScenario9Data);
    const cond = workloadVerified({ card: 'fwd-first', service: 'skylink', afterHandover: 'delivery' }, 'run');
    const start = svc.workloads?.start('fwd-first', 'skylink');
    svc.workloads?.waitForRun(start?.ok ? start.run.id : '');
    tick(2);
    expect(conditionMet(cond, svc)).toBe(false);
    svc.records?.submit('delivery', { serial: { value: 'matches' }, account: { value: 'matches' }, stock: { value: 'matches-list' }, camp: { value: 'not-certified' } });
    expect(svc.records?.handoverFiledAtS?.('delivery')).not.toBeNull();
    expect(conditionMet(cond, svc)).toBe(false);
    tick(2);
    const again = svc.workloads?.start('fwd-first', 'skylink');
    svc.workloads?.waitForRun(again?.ok ? again.run.id : '');
    expect(conditionMet(cond, svc)).toBe(true);
  });
});

describe('M24 forward field config', () => {
  it('turns the generator off, runs on batteries and wires the diagram highlight option', () => {
    const s9 = bootScenario(frontlineScenario9Data).plant.getConfig();
    expect(s9.parts.find((p) => p.id === 'generator')?.running).toBe(false);
    expect(s9.diagram?.highlightShared).toBe(false);
    PhysicalPlantService.destroy();
    expect(bootScenario(frontlineScenario10Data).plant.getConfig().diagram?.highlightShared).toBe(true);
  });

  it('refuses a kit without the Skylink parts', () => {
    const cfg = structuredClone(frontlineScenario9Data.settings?.physicalPlant);
    if (!cfg) {
      throw new Error('S9 has no plant');
    }
    cfg.parts = cfg.parts.filter((p) => p.id !== 'spacey-dish');
    expect(() => applyForwardField(cfg, [], [])).toThrow();
    expect(FORWARD_SKYLINK_ACCOUNT).toBe('forward-skylink');
  });
});

describe('M24 capacity restriction and workload cards', () => {
  it('lets the card limits decide under an account restriction, while an endpoint fault still caps at degraded', () => {
    const svc = bootScenario(frontlineScenario10Data);
    svc.services?.setAccount?.({ id: FORWARD_SKYLINK_ACCOUNT, restriction: 'ground-capacity', capacityFactor: 0.25 });
    const verdict = (card: string): string | undefined => {
      const start = svc.workloads?.start(card, 'skylink');
      return svc.workloads?.waitForRun(start?.ok ? start.run.id : '')?.status;
    };
    expect(verdict('fwd-report')).toBe('supported');
    expect(verdict('fwd-feed')).not.toBe('supported');
  });
});
