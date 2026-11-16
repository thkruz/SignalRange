/**
 * P19 round 1: a lens look ticks only the part that owns the lens, looks survive reset and checkpoints, and a connector
 * probed in another part's close-up does not count for its owning part.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('draggabilly', () => ({
  default: class {
    on() {
      return this;
    }
    destroy() {
      return undefined;
    }
    enable() {
      return undefined;
    }
    disable() {
      return undefined;
    }
  },
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ objectivesManager: { getObjectiveState: () => undefined } }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

import { frontlineScenario11Data } from '@app/campaigns/frontline/scenario11';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantState } from '@app/physical/physical-plant-types';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { bootScenario } from '../campaigns/frontline-completion-support';

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const plant = () => PhysicalPlantService.getInstance().plant;

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(11);
  document.body.innerHTML = '<div id="root"></div><div id="canvas-content"></div>';
  bootScenario(frontlineScenario11Data);
});

afterEach(() => {
  PartCloseupModal.destroy();
  PhysicalPlantService.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

const lensOf = (service: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-fp-led][data-svc-service="${service}"]`);

describe('lens look ownership (S11 router and modem close-up)', () => {
  it('reading a router lens ticks the router, not the delivered modem', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const lens = [...document.querySelectorAll<HTMLElement>('[data-fp-led]')].find((el) => el.dataset.svcService !== 'forward-eurosat');
    expect(lens, 'a router-owned lens').toBeTruthy();
    click(lens!);
    expect(plant().hasInspected('skylink-router')).toBe(true);
    expect(plant().hasInspected('vsat-modem')).toBe(false);
  });

  it('reading the modem lens ticks the modem', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const lens = lensOf('forward-eurosat');
    expect(lens, 'a modem-owned lens').toBeTruthy();
    click(lens!);
    expect(plant().hasInspected('vsat-modem')).toBe(true);
  });
});

describe('looks share the plant lifecycle', () => {
  it('reset clears a lights-only look', () => {
    plant().noteLookedAt('skylink-router');
    expect(plant().hasInspected('skylink-router')).toBe(true);
    plant().reset();
    expect(plant().hasInspected('skylink-router')).toBe(false);
  });

  it('a checkpoint keeps a lights-only look and an older checkpoint without the field restores empty', () => {
    plant().noteLookedAt('skylink-router');
    const saved = JSON.parse(JSON.stringify(plant().getState())) as PlantState;
    plant().reset();
    expect(plant().hasInspected('skylink-router')).toBe(false);
    plant().restoreState(saved);
    expect(plant().hasInspected('skylink-router')).toBe(true);
    const old = { ...saved } as { lookedAt?: string[] };
    delete old.lookedAt;
    plant().restoreState(old as never);
    expect(plant().hasInspected('skylink-router')).toBe(false);
  });
});

describe('connector probed in another part close-up', () => {
  it('the dish-end plug in the router-wall cable picture does not count as inspecting the dish', () => {
    PartCloseupModal.getInstance().showCloseup('skylink-cable');
    click(document.querySelector('[data-target="skylink-cable:dish"]')!);
    click(document.querySelector<HTMLElement>('[data-verb="inspect"]')!);
    expect(plant().hasInspected('skylink-cable:dish')).toBe(true);
    expect(plant().hasInspected('skylink-dish')).toBe(false);
  });
});
