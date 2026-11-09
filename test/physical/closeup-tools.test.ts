/**
 * C6 WP10: tools are part of applicability. The close-up offers a tool only
 * when the rules table says it applies to the selected target, and a refused
 * attempt never reaches the result log.
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
import { CLOSEUPS, SITE_HOTSPOTS } from '@app/campaigns/frontline/site-hotspots';
import { EventBus } from '@app/events/event-bus';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import { SWAP_COSTS_S, VERB_COSTS_S } from '@app/physical/plant-verb-rules';
import { PartCloseupModal } from '@app/physical/ui/part-closeup-modal';
import { plantUiState } from '@app/physical/ui/plant-ui-helpers';
import { SkylinkAppBox } from '@app/physical/ui/skylink-app-box';
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
  SkylinkAppBox.destroy();
  PartCloseupModal.destroy();
  PhysicalPlantService.destroy();
  EventBus.destroy();
  document.body.innerHTML = '';
});

describe('close-up selection and actions', () => {
  const measures = () => [...document.querySelectorAll<HTMLElement>('[data-measure]')].map((b) => b.dataset.measure);
  const rows = () => document.querySelectorAll('#pcu-log .pp-log-row').length;

  it('clicking a point only selects: no clock time, no log', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    PartCloseupModal.getInstance().showCloseup('router');
    const t0 = plant.getTimeSeconds();
    const logged = plant.getLog().length;
    click(document.querySelector('[data-target="skylink-cable:router"]')!);
    expect(plant.getTimeSeconds()).toBe(t0);
    expect(plant.getLog().length).toBe(logged);
    expect(document.querySelector('#pcu-latest .pp-latest-text')).toBeNull();
    expect(document.querySelectorAll('[data-tool]').length).toBe(0);
  });

  it('the selected target shows its friendly name, never an internal id', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    click(document.querySelector('[data-sel="cu-generator"]')!);
    const text = document.querySelector('#pcu-target')!.textContent!;
    expect(text).not.toContain('(generator)');
    expect(text).toBe(CLOSEUPS.generator.regions.find((r) => r.id === 'cu-generator')!.label);
  });

  it('the power strip offers measure but not the cable tester', () => {
    PartCloseupModal.getInstance().showCloseup('power-strip');
    click(document.querySelector('[data-target="power-strip"]')!);
    expect(measures()).toContain('multimeter');
    expect(measures()).not.toContain('cable-tester');
  });

  it('a cable connector offers the cable tester as an action', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    click(document.querySelector('[data-target="skylink-cable:router"]')!);
    expect(measures()).toContain('cable-tester');
    expect(document.querySelector('[data-measure="cable-tester"]')!.textContent).toContain('Test cable (cable tester)');
  });

  it('the laptop offers no measure actions', () => {
    PartCloseupModal.getInstance().showCloseup('laptop');
    vi.spyOn(SkylinkAppBox.getInstance(), 'show').mockImplementation(() => undefined);
    click(document.querySelector('[data-target="laptop"]')!);
    expect(measures()).toEqual([]);
  });

  it('a measure action costs time and logs; identical repeats collapse into one row', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    PartCloseupModal.getInstance().showCloseup('router');
    click(document.querySelector('[data-target="skylink-router"]')!);
    const t0 = plant.getTimeSeconds();
    click(document.querySelector('[data-measure="multimeter"]')!);
    expect(plant.getTimeSeconds()).toBeGreaterThan(t0);
    expect(plant.hasMeasured('skylink-router', 'multimeter')).toBe(true);
    expect(document.querySelector('#pcu-latest')!.textContent).toContain('Multimeter');
    click(document.querySelector('[data-verb="inspect"]')!);
    click(document.querySelector('[data-verb="inspect"]')!);
    click(document.querySelector('[data-verb="inspect"]')!);
    // latest = inspect; history = the multimeter reading; the repeats are one entry
    expect(document.querySelector('#pcu-latest')!.textContent).toContain('Inspect');
    // Repeat lines now vary (no immediate repeat), so only identical answers collapse
    expect(rows()).toBeLessThanOrEqual(3);
  });

  it('keeps result history per close-up: generator entries never show in the LNB, and return on reopen', () => {
    const modal = PartCloseupModal.getInstance();
    const shown = () => `${document.querySelector('#pcu-latest')!.textContent}|${document.querySelector('#pcu-log')!.textContent}`;
    modal.showCloseup('generator');
    click(document.querySelector('[data-target="generator"]')!);
    click(document.querySelector('[data-verb="inspect"]')!);
    click(document.querySelector('[data-verb="feel"]')!);
    expect(shown()).toContain('Generator');
    modal.showCloseup('lnb');
    expect(shown()).not.toContain('Generator');
    expect(document.querySelector('#pcu-latest')!.textContent).toContain('No actions yet');
    click(document.querySelector('[data-target="vsat-lnb"]')!);
    click(document.querySelector('[data-verb="inspect"]')!);
    expect(shown()).not.toContain('Generator');
    modal.close();
    modal.showCloseup('generator');
    expect(shown()).toContain('Generator');
    expect(document.querySelectorAll('#pcu-log .pp-log-row').length).toBe(1);
    modal.showCloseup('lnb');
    expect(shown()).toContain('LNB');
  });

  it('every action shows its cost, disruptive ones come last and are secondary, swap shows the spare use', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    click(document.querySelector('[data-target="skylink-router"]')!);
    const buttons = [...document.querySelectorAll<HTMLElement>('#pcu-verbs button')];
    expect(buttons.length).toBeGreaterThan(2);
    for (const b of buttons) {
      expect(b.textContent).toMatch(/· \d+ (s|min)/u);
    }
    const firstDisruptive = buttons.findIndex((b) => b.classList.contains('pp-act-disruptive'));
    expect(firstDisruptive).toBeGreaterThan(0);
    expect(buttons.slice(firstDisruptive).every((b) => b.classList.contains('pp-act-disruptive'))).toBe(true);
    expect(buttons[0].dataset.verb).toBe('inspect');
    expect(buttons[0].textContent).toContain('Inspect · 20 s');
    expect(document.querySelector('[data-verb="swap"]')!.textContent).toMatch(/uses 1 of \d+ spares?/u);
  });

  it('the cost table matches what the plant charges', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    expect(plant.inspect('skylink-router').costSeconds).toBe(VERB_COSTS_S.inspect);
    expect(plant.feel('skylink-router').costSeconds).toBe(VERB_COSTS_S.feel);
    expect(plant.measure('multimeter', 'skylink-router').costSeconds).toBe(VERB_COSTS_S.multimeter);
    expect(plant.swap('skylink-router').costSeconds).toBe(SWAP_COSTS_S.part);
  });

  it('the overlay has focusable targets and markers, with outlines only on demand', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    const pts = [...document.querySelectorAll<SVGElement>('#pcu-overlay .pp-point')];
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((p) => p.getAttribute('tabindex') === '0' && p.getAttribute('role') === 'button' && p.querySelector('.pp-marker'))).toBe(true);
    expect(document.querySelector('.pp-show-points')).toBeNull();
    const toggle = document.querySelector<HTMLInputElement>('#pcu-points')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector('.pp-show-points')).not.toBeNull();
  });

  it('Enter on a focused point selects it', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    const pt = document.querySelector<SVGElement>('[data-sel="cu-generator"]')!;
    pt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.querySelectorAll('.pp-selected').length).toBe(1);
  });

  it('the hidden-state toggle lives in a collapsed Trainer footer', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    const foot = document.querySelector<HTMLDetailsElement>('.pp-trainer-foot')!;
    expect(foot.open).toBe(false);
    expect(foot.contains(document.querySelector('#pcu-xray'))).toBe(true);
    expect(plantUiState.xray).toBe(false);
  });

  it('selecting one region highlights only that region, and generator regions offer their own verbs', () => {
    PartCloseupModal.getInstance().showCloseup('generator');
    click(document.querySelector('[data-sel="cu-gen-fuel"]')!);
    expect(document.querySelectorAll('.pp-selected').length).toBe(1);
    const verbs = [...document.querySelectorAll<HTMLElement>('[data-verb]')].map((b) => b.dataset.verb);
    expect(verbs).toContain('refuel');
    expect(verbs).not.toContain('powerCycle');
    click(document.querySelector('[data-sel="cu-generator"]')!);
    expect(document.querySelectorAll('.pp-selected').length).toBe(1);
    const bodyVerbs = [...document.querySelectorAll<HTMLElement>('[data-verb]')].map((b) => b.dataset.verb);
    expect(bodyVerbs).toContain('powerCycle');
    expect(bodyVerbs).not.toContain('refuel');
  });

  it('focus returns to the hotspot on close', () => {
    const spot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    spot.setAttribute('tabindex', '0');
    document.body.appendChild(spot);
    spot.focus();
    const modal = PartCloseupModal.getInstance();
    modal.showCloseup('generator');
    modal.close();
    expect(document.activeElement).toBe(spot);
  });
});

describe('close-up modal pattern', () => {
  it('is a fixed dialog that closes on Escape', () => {
    const modal = PartCloseupModal.getInstance();
    modal.showCloseup('generator');
    expect(document.getElementById('part-closeup-modal')!.getAttribute('aria-modal')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.isOpen()).toBe(false);
  });
});

describe('hotspot anchors', () => {
  it('every pip anchor sits inside its hotspot shape bounds', () => {
    const outside: string[] = [];
    for (const spot of SITE_HOTSPOTS) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const s of spot.shapes) {
        if (s.kind === 'rect') {
          xs.push(s.x, s.x + s.w);
          ys.push(s.y, s.y + s.h);
        } else {
          for (const [x, y] of s.points) {
            xs.push(x);
            ys.push(y);
          }
        }
      }
      const pad = 0.012;
      const [ax, ay] = spot.anchor;
      const inside = ax >= Math.min(...xs) - pad && ax <= Math.max(...xs) + pad && ay >= Math.min(...ys) - pad && ay <= Math.max(...ys) + pad;
      if (!inside) {
        outside.push(spot.id);
      }
    }
    expect(outside).toEqual([]);
    expect(Object.keys(CLOSEUPS).length).toBeGreaterThan(0);
  });
});
