/**
 * Phase 38.1 WP4: the physical-plant UI. Site tab hotspots, the close-up verb
 * path, the trainer inject/clear, the SkyLink panel and the Frontline gate.
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

import { frontlinePlantConfig } from '@app/campaigns/frontline/plant-config';
import { hotspotsForView, SITE_HOTSPOTS } from '@app/campaigns/frontline/site-hotspots';
import { EventBus } from '@app/events/event-bus';
import { SiteTab } from '@app/pages/mission-control/tabs/site-tab';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { buildTrigger, PlantTrainerBox } from '@app/physical/ui/plant-trainer-box';
import { FAULT_KINDS, validTargets } from '@app/physical/ui/plant-ui-helpers';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';

function plantService() {
  return PhysicalPlantService.getInstance();
}

beforeEach(() => {
  EventBus.destroy();
  SimClock.reset();
  Rng.setSeed(7);
  document.body.innerHTML = '<div id="root"></div><div id="canvas-content"></div>';
  ScenarioManager.getInstance().settings = { physicalPlant: frontlinePlantConfig } as never;
});

afterEach(() => {
  PartCloseupModal.destroy();
  PlantTrainerBox.destroy();
  PhysicalPlantService.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

describe('SiteTab', () => {
  it('renders only the current view and opens a close-up on click', () => {
    plantService();
    const tab = new SiteTab('canvas-content');
    expect(tab.getView()).toBe('inside');
    const inside = hotspotsForView('inside');
    expect(document.querySelectorAll('.pp-hotspot').length).toBe(inside.length);
    for (const spot of SITE_HOTSPOTS) {
      const present = document.querySelector(`[data-hotspot="${spot.id}"]`) !== null;
      expect(present).toBe(spot.view === 'inside');
    }
    expect(document.querySelector<HTMLImageElement>('.pp-stage img')!.src).toContain('site-inside.webp');
    document.querySelector<SVGElement>('[data-hotspot="site-in-power-station"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(PartCloseupModal.getInstance().currentId()).toBe('power-station');
    tab.dispose();
  });

  it('go outside opens a trip and swaps the view; go inside closes it', () => {
    const plant = plantService().plant;
    const tab = new SiteTab('canvas-content');
    document.querySelector<SVGElement>('[data-hotspot="site-in-door"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tab.getView()).toBe('outside');
    expect(plant.isOutside()).toBe(true);
    expect(plant.getReport().trips).toBe(1);
    expect(document.getElementById('site-trips')!.textContent).toBe(`1/${plant.getTripLimit()}`);
    expect(document.querySelector<HTMLImageElement>('.pp-stage img')!.src).toContain('site-outside.webp');
    for (const spot of SITE_HOTSPOTS) {
      expect(document.querySelector(`[data-hotspot="${spot.id}"]`) !== null).toBe(spot.view === 'outside');
    }
    expect(document.querySelector('[data-hotspot="site-out-generator"]')).not.toBeNull();
    document.querySelector<SVGElement>('[data-hotspot="site-out-door"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tab.getView()).toBe('inside');
    expect(plant.isOutside()).toBe(false);
    expect(plant.getReport().trips).toBe(1);
    tab.dispose();
  });

  it('the strip toggle switches views too', () => {
    const plant = plantService().plant;
    const tab = new SiteTab('canvas-content');
    tab.setView('outside');
    expect(tab.getView()).toBe('outside');
    expect(plant.isOutside()).toBe(true);
    tab.setView('inside');
    expect(tab.getView()).toBe('inside');
    expect(plant.isOutside()).toBe(false);
    tab.dispose();
  });

  it('every hotspot belongs to a view and is a close-up or a door', () => {
    for (const spot of SITE_HOTSPOTS) {
      expect(['inside', 'outside']).toContain(spot.view);
      expect(Boolean(spot.closeup) !== Boolean(spot.action)).toBe(true);
    }
    expect(hotspotsForView('inside').some((h) => h.action === 'go-outside')).toBe(true);
    expect(hotspotsForView('outside').some((h) => h.action === 'go-inside')).toBe(true);
  });

  it('shows the header strip state and the way back inside', () => {
    const plant = plantService().plant;
    const tab = new SiteTab('canvas-content');
    expect(document.getElementById('site-location-text')!.textContent).toBe('Inside');
    plant.clearSnow('skylink-dish');
    tab.activate();
    expect(document.getElementById('site-location-text')!.textContent).toBe('Outside');
    expect(document.getElementById('site-trips')!.textContent).toBe(`1/${plant.getTripLimit()}`);
    tab.setView('inside');
    expect(plant.isOutside()).toBe(false);
    tab.dispose();
  });
});

describe('SiteTab view derives from the plant', () => {
  it('a fresh tab instance shows outside when the manager is outside', () => {
    const plant = plantService().plant;
    const first = new SiteTab('canvas-content');
    first.setView('outside');
    first.dispose();
    document.body.innerHTML = '<div id="root"></div><div id="canvas-content"></div>';
    const second = new SiteTab('canvas-content');
    expect(second.getView()).toBe('outside');
    expect(plant.isOutside()).toBe(true);
    expect(document.querySelector<HTMLImageElement>('.pp-stage img')!.src).toContain('site-outside.webp');
    expect(document.getElementById('site-outside-note')!.style.display).toBe('');
    expect(document.getElementById('site-outside-note')!.textContent).toBe('Outside. Go inside to use the laptop.');
    second.dispose();
  });

  it('re-activating repaints when the manager changed behind the tab', () => {
    const plant = plantService().plant;
    const tab = new SiteTab('canvas-content');
    tab.deactivate();
    plant.goOutside();
    tab.activate();
    expect(tab.getView()).toBe('outside');
    expect(document.querySelector<HTMLImageElement>('.pp-stage img')!.src).toContain('site-outside.webp');
    plant.returnInside();
    tab.activate();
    expect(document.querySelector<HTMLImageElement>('.pp-stage img')!.src).toContain('site-inside.webp');
    expect(document.getElementById('site-outside-note')!.style.display).toBe('none');
    tab.dispose();
  });

  it('outside, inside, outside again counts two trips', () => {
    const plant = plantService().plant;
    const tab = new SiteTab('canvas-content');
    tab.setView('outside');
    tab.setView('inside');
    tab.setView('outside');
    expect(plant.getReport().trips).toBe(2);
    tab.dispose();
  });
});

describe('PartCloseupModal', () => {
  it('a verb button calls the plant and logs the observation with its cost', () => {
    const plant = plantService().plant;
    const modal = PartCloseupModal.getInstance();
    modal.showCloseup('lnb');
    const probe = document.querySelector<SVGElement>('[data-target="vsat-feed"]');
    expect(probe).not.toBeNull();
    probe!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const before = plant.getLog().length;
    document.querySelector<HTMLElement>('[data-verb="inspect"]')!.click();
    expect(plant.getLog().length).toBe(before + 1);
    expect(plant.getLog().at(-1)?.verb).toBe('inspect');
    const row = document.querySelector('#pcu-latest');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Inspect');
    expect(row!.textContent).toMatch(/\d+ s|\d+ min/u);
  });

  it('measuring is an action: selecting a probe is free, the Measure button reads it', () => {
    const plant = plantService().plant;
    const modal = PartCloseupModal.getInstance();
    modal.showCloseup('router');
    document.querySelector<SVGElement>('[data-target="skylink-router"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(plant.hasMeasured('skylink-router', 'multimeter')).toBe(false);
    document.querySelector<HTMLElement>('[data-measure="multimeter"]')!.click();
    expect(plant.hasMeasured('skylink-router', 'multimeter')).toBe(true);
    expect(document.querySelector('#pcu-latest')!.textContent).toContain('Multimeter');
  });
});

describe('PlantTrainerBox', () => {
  it('injects a fault on a valid target and clears it', () => {
    const plant = plantService().plant;
    const trainer = PlantTrainerBox.getInstance();
    trainer.show();
    const kind = document.getElementById('pt-kind') as HTMLSelectElement;
    kind.value = 'unseated';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    const target = document.getElementById('pt-target') as HTMLSelectElement;
    expect(target.options.length).toBe(validTargets(plant, 'unseated').length);
    target.value = 'vsat-feed';
    document.getElementById('pt-inject')!.click();
    expect(plant.getFaults().some((f) => f.kind === 'unseated' && f.target === 'vsat-feed')).toBe(true);
    expect(plant.getConnectorState('vsat-feed')?.seated).toBe('out');

    document.querySelector<HTMLElement>('[data-clear-fault]')!.click();
    expect(plant.getFaults().some((f) => f.target === 'vsat-feed' && f.kind === 'unseated')).toBe(false);
  });

  it('offers a valid target for every fault kind and resets the plant', () => {
    const plant = plantService().plant;
    for (const def of FAULT_KINDS) {
      expect(validTargets(plant, def.kind).length, def.kind).toBeGreaterThan(0);
    }
    plant.injectFault({ id: 'x', target: 'vsat-feed', kind: 'corrosion' });
    PlantTrainerBox.getInstance().show();
    document.getElementById('pt-reset')!.click();
    expect(plant.getFaults().some((f) => f.id === 'x')).toBe(false);
  });

  it('builds triggers', () => {
    expect(buildTrigger('windMps', 8)).toEqual({ windMps: '>8' });
    expect(buildTrigger('always', 0)).toEqual({ always: true });
  });
});
