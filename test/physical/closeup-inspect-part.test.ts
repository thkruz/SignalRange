/**
 * P19: a player who opens a part's close-up and uses the Inspect button on the part, on one of its
 * connectors, or on its status lights must tick the "part-inspected" row for that part.
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

import { campServiceConfig } from '@app/campaigns/frontline/camp-field-config';
import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(7);
  document.body.innerHTML = '<div id="root"></div><div id="canvas-content"></div>';
  ScenarioManager.getInstance().settings = { physicalPlant: { ...frontlinePlantConfig, service: campServiceConfig() } } as never;
  PhysicalPlantService.getInstance();
});

afterEach(() => {
  vi.restoreAllMocks();
  PartCloseupModal.destroy();
  PhysicalPlantService.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

const inspectVia = (closeup: 'power-station' | 'router' | 'skylink-dish', selector: string) => {
  PartCloseupModal.getInstance().showCloseup(closeup);
  click(document.querySelector(selector)!);
  const btn = document.querySelector<HTMLElement>('[data-verb="inspect"]');
  expect(btn, `Inspect offered after selecting ${selector}`).not.toBeNull();
  click(btn!);
};

describe('player path ticks part-inspected', () => {
  it('power station body', () => {
    inspectVia('power-station', '[data-target="power-station"]');
    expect(PhysicalPlantService.getInstance().plant.hasInspected('power-station')).toBe(true);
  });
  it('power station DC outputs', () => {
    inspectVia('power-station', '[data-target="ps:dc-out"]');
    expect(PhysicalPlantService.getInstance().plant.hasInspected('power-station')).toBe(true);
  });
  it('router body', () => {
    inspectVia('router', '[data-target="skylink-router"]');
    expect(PhysicalPlantService.getInstance().plant.hasInspected('skylink-router')).toBe(true);
  });
  it('router DC input', () => {
    inspectVia('router', '[data-target="router:dc"]');
    expect(PhysicalPlantService.getInstance().plant.hasInspected('skylink-router')).toBe(true);
  });
  it('dish panel', () => {
    inspectVia('skylink-dish', '[data-target="skylink-dish"]');
    expect(PhysicalPlantService.getInstance().plant.hasInspected('skylink-dish')).toBe(true);
  });
});

describe('reading status lights', () => {
  it('a lens look in the dish close-up counts as inspecting the dish', () => {
    PartCloseupModal.getInstance().showCloseup('skylink-dish');
    const lens = document.querySelector<HTMLElement>('[data-fp-led]');
    expect(lens, 'dish close-up shows a light').not.toBeNull();
    click(lens!);
    expect(PhysicalPlantService.getInstance().plant.hasInspected('skylink-dish')).toBe(true);
  });
});
