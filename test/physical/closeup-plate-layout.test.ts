/**
 * Issue 305 (Phase 44 slice 7): the close-up is the device and its plate, not a website with a side panel.
 * Latest result and History moved to a paper service tag under the painting; the record each action writes
 * (verb, target, cost, observation) and the sim time it spends are unchanged, and the device name is not repeated.
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
import { CLOSEUPS } from '@app/campaigns/frontline/site-hotspots';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { VERB_COSTS_S } from '@app/physical/plant-verb-rules';
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
  ScenarioManager.getInstance().settings = { physicalPlant: frontlinePlantConfig } as never;
  PhysicalPlantService.getInstance();
});

afterEach(() => {
  vi.restoreAllMocks();
  PartCloseupModal.destroy();
  PhysicalPlantService.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

describe('close-up plate layout', () => {
  it('Latest result and History sit on the service tag, not in a side panel; the plate holds the controls only', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const tag = document.querySelector('#pcu-tag')!;
    expect(tag.contains(document.querySelector('#pcu-latest'))).toBe(true);
    expect(tag.contains(document.querySelector('#pcu-log'))).toBe(true);
    const plate = document.querySelector('#pcu-faceplate')!;
    expect(plate.contains(document.querySelector('#pcu-latest'))).toBe(false);
    expect(plate.contains(document.querySelector('#pcu-verbs'))).toBe(true);
    expect(plate.contains(document.querySelector('#pcu-title'))).toBe(true);
  });

  it('an action still spends its time and writes the same record to the tag', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    PartCloseupModal.getInstance().showCloseup('router');
    click(document.querySelector('[data-target="skylink-router"]')!);
    const t0 = plant.getTimeSeconds();
    click(document.querySelector('[data-verb="inspect"]')!);
    expect(plant.getTimeSeconds() - t0).toBeGreaterThanOrEqual(VERB_COSTS_S.inspect);
    const meta = document.querySelector('#pcu-latest .pp-latest-meta')!.textContent!;
    expect(meta).toContain('Inspect');
    expect(meta).toContain('SkyLink router');
    expect(document.querySelector('#pcu-latest .pp-latest-text')!.textContent!.length).toBeGreaterThan(0);
  });

  it('the device name is engraved once: a selection that is the device itself adds no second name', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    click(document.querySelector('[data-target="skylink-router"]')!);
    const target = document.querySelector<HTMLElement>('#pcu-target')!;
    expect(document.querySelector('#pcu-title')!.textContent).toBe(CLOSEUPS.router.title);
    expect(target.textContent).toBe(CLOSEUPS.router.title);
    expect(target.hidden).toBe(true);
    click(document.querySelector('[data-target="skylink-cable:router"]')!);
    expect(target.hidden).toBe(false);
  });

  it('the generator reads its fuel on a gauge on the plate, not as a chip', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    click(document.querySelector('[data-target="generator"]')!);
    const gauge = document.querySelector('#pcu-tags .fp-gauge')!;
    expect(gauge.getAttribute('role')).toBe('meter');
    expect(Number(gauge.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(document.querySelector('#pcu-faceplate')!.contains(gauge)).toBe(true);
  });

  it('the tooltip never repeats the device name the plate already engraves', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const hit = document.querySelector<HTMLElement>(`#pcu-overlay [data-label="${CLOSEUPS.router.title}"]`);
    expect(hit, 'the device hit area is labelled with the device name').not.toBeNull();
    hit!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector<HTMLElement>('#pcu-callout')!.hidden).toBe(true);
  });

  it('repeatsPlate_ hides the callout for the laptop region and shows it for a part with its own name', () => {
    PartCloseupModal.getInstance().showCloseup('laptop');
    const repeats = (label: string, sel = ''): boolean => {
      const hit = document.createElement('div');
      hit.dataset.label = label;
      hit.dataset.sel = sel;

      return (PartCloseupModal.getInstance() as unknown as { repeatsPlate_(h: HTMLElement): boolean }).repeatsPlate_(hit);
    };
    expect(repeats('Laptop: internet up')).toBe(true);
    expect(repeats('Laptop (opens the SkyLink app)', 'cu-laptop')).toBe(true);
    expect(repeats('Power light', 'cu-light')).toBe(false);
  });

  it('the viewing aids are stencilled switches on the plate, keyboard reachable, not form checkboxes', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const points = document.querySelector<HTMLElement>('#pcu-points')!;
    const xray = document.querySelector<HTMLElement>('#pcu-xray')!;
    for (const el of [points, xray]) {
      expect(el.tagName).toBe('BUTTON');
      expect(el.getAttribute('role')).toBe('switch');
      expect(el.getAttribute('aria-checked')).toBe('false');
    }
    expect(document.querySelectorAll('#pcu-faceplate input[type="checkbox"]').length).toBe(0);
    points.click();
    expect(document.querySelector('#pcu-points')!.getAttribute('aria-checked')).toBe('true');
  });

  it('a lens look keeps its stamp for screen readers and shows no floating tooltip', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    // The jsdom plant has no service model, so no lens is built: put one where the lights component puts it
    const host = document.querySelector<HTMLElement>('#pcu-lenses')!;
    host.innerHTML = '<button type="button" class="fp-led" data-fp-led data-label="Power light"></button>';
    const lens = host.querySelector<HTMLElement>('[data-fp-led]')!;
    lens.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    lens.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    click(lens);
    const callout = document.querySelector<HTMLElement>('#pcu-callout')!;
    expect(callout.hidden).toBe(true);
    expect(callout.textContent).toBe('');
  });
});
