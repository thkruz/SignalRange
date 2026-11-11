/**
 * Phase 44 slice 7: the router faceplate carries status lights. Looking at one is the old "Observe light"
 * check: a device-indicator sample, 5 s of scenario time, no layer truth until the player looks.
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
import { Events } from '@app/events/events';
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

const lensOf = (layer: string): HTMLElement => document.querySelector<HTMLElement>(`#pcu-lenses [data-fp-led][data-svc-layer="${layer}"]`)!;

describe('faceplate status lights', () => {
  it('the router lenses sit over the painting, unread, with no field-service table and none on the plate', () => {
    PartCloseupModal.getInstance().showCloseup('router');
    const lenses = [...document.querySelectorAll<HTMLElement>('#pcu-lenses [data-fp-led]')];
    expect(lenses.length).toBeGreaterThanOrEqual(3);
    expect(lenses.every((l) => l.dataset.ledState === 'unread')).toBe(true);
    expect(lenses.every((l) => l.dataset.ledValue === '')).toBe(true);
    expect(lenses.map((l) => l.getAttribute('aria-label'))).toContain('Look at Power light');
    expect(lenses.every((l) => l.tagName === 'BUTTON')).toBe(true);
    expect(document.querySelectorAll('#pcu-indicators [data-fp-led]').length).toBe(0);
    expect(document.querySelector('#part-closeup-modal .fsp-table')).toBeNull();
  });

  it('a part with no painted LED area keeps its lenses on the plate', () => {
    PartCloseupModal.getInstance().showCloseup('skylink-dish');
    expect(document.querySelectorAll('#pcu-indicators [data-fp-led]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelectorAll('#pcu-lenses [data-fp-led]').length).toBe(0);
  });

  it('looking at a lens takes one device-indicator sample, spends 5 s and writes the light-checked note for that bank', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    PartCloseupModal.getInstance().showCloseup('router');
    const t0 = plant.getTimeSeconds();
    const model = PhysicalPlantService.servicesOrNull()!;
    const serviceId = lensOf('power').dataset.svcService!;
    const before = model.samplesFor(serviceId).length;
    click(lensOf('power'));
    const samples = model.samplesFor(serviceId);
    expect(samples.length).toBe(before + 1);
    expect(samples.at(-1)).toMatchObject({ layer: 'power', provenance: 'device-indicator' });
    expect(plant.getTimeSeconds() - t0).toBe(5);
    expect(lensOf('power').dataset.ledState).not.toBe('unread');
    expect(lensOf('power').dataset.ledFresh).toBe('current');
    expect(lensOf('local').dataset.ledState).toBe('unread');
    const note = document.querySelector(`#pcu-indicators [data-fp-bank="${serviceId}"] [data-fp-note]`)!;
    expect(note.textContent).toContain('Light checked: Power');
  });

  it('a reading that ages past its window renders stale or invalidated, not current', () => {
    const plant = PhysicalPlantService.getInstance().plant;
    PartCloseupModal.getInstance().showCloseup('router');
    click(lensOf('power'));
    plant.spendTime(3600);
    EventBus.getInstance().emit(Events.UPDATE);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    EventBus.getInstance().emit(Events.UPDATE);
    expect(['stale', 'invalidated']).toContain(lensOf('power').dataset.ledFresh);
  });
});

describe('faceplate controls survive the refresh', () => {
  const press = (modal: PartCloseupModal) => {
    modal.showCloseup('router');
    modal.selectTarget('skylink-router');
    const button = document.querySelector<HTMLButtonElement>('#pcu-verbs [data-verb="inspect"]')!;
    button.focus();

    return button;
  };

  it('does not rebuild the controls across ticks when nothing changed, and keeps focus', () => {
    const modal = PartCloseupModal.getInstance();
    const button = press(modal);
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    for (let i = 0; i < 4; i++) {
      now += 1500;
      EventBus.getInstance().emit(Events.UPDATE);
    }
    expect(button.isConnected).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('#pcu-verbs [data-verb="inspect"]')).toBe(button);
  });

  it('a press leaves the same button in place, focused, and shows it pressed through a class on the live node', () => {
    const modal = PartCloseupModal.getInstance();
    const button = press(modal);
    click(button);
    const after = document.querySelector<HTMLButtonElement>('#pcu-verbs [data-verb="inspect"]')!;
    expect(after).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.classList.contains('fp-thrown')).toBe(true);
  });

  it('restores focus to the same control when a rebuild does happen', () => {
    const modal = PartCloseupModal.getInstance();
    const button = press(modal);
    const verbs = document.querySelector<HTMLElement>('#pcu-verbs')!;
    verbs.dataset.sig = 'stale signature';
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    now += 1500;
    EventBus.getInstance().emit(Events.UPDATE);
    const rebuilt = document.querySelector<HTMLButtonElement>('#pcu-verbs [data-verb="inspect"]')!;
    expect(rebuilt).not.toBe(button);
    expect(document.activeElement).toBe(rebuilt);
  });

  it('the pressed state is keyed by part and action and cleared when the close-up closes', () => {
    vi.useFakeTimers();
    const modal = PartCloseupModal.getInstance();
    const button = press(modal);
    click(button);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    modal.close();
    expect(button.classList.contains('fp-thrown')).toBe(false);
    vi.useRealTimers();
  });
});
