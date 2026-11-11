import { describe, expect, it, vi } from 'vitest';
import { fieldDefaultTabId } from '../../../src/pages/mission-control/field-default-tab';
import { type PlantLike, TentControl, tentControlView } from '../../../src/pages/mission-control/tent-control';

function fakePlant(over: Partial<{ outside: boolean; mode: string; trips: number; spotted: boolean }> = {}) {
  const state = { outside: false, mode: 'camp', trips: 0, spotted: false, ...over };
  const plant: PlantLike = {
    isOutside: () => state.outside,
    getSiteMode: () => state.mode,
    getReport: () => ({ trips: state.trips, spotted: state.spotted }),
    getTripLimit: () => 3,
    goOutside: vi.fn(() => {
      state.outside = true;
      state.trips += 1;
    }),
    returnInside: vi.fn(() => {
      state.outside = false;
    }),
  };

  return { plant, state };
}

describe('fieldDefaultTabId', () => {
  it('lands on Site when the scenario has a plant', () => {
    expect(fieldDefaultTabId(true, 'station-skylink', 'station-skylink')).toBe('site');
  });
  it('keeps the registered default, then the first tab, without a Site tab', () => {
    expect(fieldDefaultTabId(false, 'station-skylink', 'dashboard')).toBe('station-skylink');
    expect(fieldDefaultTabId(false, null, 'dashboard')).toBe('dashboard');
  });
});

describe('tentControlView', () => {
  it('is hidden without a plant or on a forward site', () => {
    expect(tentControlView(null)).toBeNull();
    expect(tentControlView(fakePlant({ mode: 'forward' }).plant)).toBeNull();
  });
  it('describes inside and outside', () => {
    expect(tentControlView(fakePlant().plant)).toMatchObject({ location: 'Inside the tent', action: 'Step outside', trips: '0/3' });
    expect(tentControlView(fakePlant({ outside: true, trips: 1, spotted: true }).plant)).toMatchObject({
      location: 'Outside',
      action: 'Go back in',
      trips: '1/3',
      spotted: true,
    });
  });
});

describe('TentControl', () => {
  it('stays hidden without a plant', () => {
    const host = document.createElement('div');
    new TentControl(host, () => null);
    expect(host.querySelector<HTMLElement>('#tent-control')!.style.display).toBe('none');
  });

  it('steps out and back in through the plant', () => {
    const host = document.createElement('div');
    const { plant } = fakePlant();
    const control = new TentControl(host, () => plant);
    const button = host.querySelector<HTMLButtonElement>('#tent-toggle')!;
    expect(host.querySelector<HTMLElement>('#tent-control')!.style.display).toBe('');
    expect(button.textContent).toBe('Step outside');
    button.click();
    // Stepping out asks first and shows the trip it will spend
    expect(plant.goOutside).not.toHaveBeenCalled();
    expect(host.querySelector('#tent-confirm-text')!.textContent).toBe('This uses trip 1 of 3.');
    host.querySelector<HTMLButtonElement>('#tent-cancel')!.click();
    expect(plant.goOutside).not.toHaveBeenCalled();
    button.click();
    host.querySelector<HTMLButtonElement>('#tent-confirm')!.click();
    expect(plant.goOutside).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe('Go back in');
    expect(host.querySelector('#tent-location-text')!.textContent).toBe('Outside');
    expect(host.querySelector('#tent-trips')!.textContent).toBe('1/3');
    button.click();
    expect(plant.returnInside).toHaveBeenCalledTimes(1);
    expect(host.querySelector('#tent-location-text')!.textContent).toBe('Inside the tent');
    control.dispose();
    expect(host.querySelector('#tent-control')).toBeNull();
  });
});

describe('TentControl.requestToggle (field HUD flap)', () => {
  it('runs the follow-up only after the step out is confirmed, and drops it on cancel', () => {
    const host = document.createElement('div');
    const { plant } = fakePlant();
    const control = new TentControl(host, () => plant);
    expect(TentControl.active()).toBe(control);
    const after = vi.fn();
    control.requestToggle(after);
    expect(after).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('#tent-cancel')!.click();
    expect(after).not.toHaveBeenCalled();
    expect(plant.goOutside).not.toHaveBeenCalled();
    control.requestToggle(after);
    host.querySelector<HTMLButtonElement>('#tent-confirm')!.click();
    expect(plant.goOutside).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    // Going back in needs no confirmation
    const back = vi.fn();
    control.requestToggle(back);
    expect(plant.returnInside).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    control.dispose();
    expect(TentControl.active()).toBeNull();
  });

  it('moves focus to the confirm button, cancels on Escape and hands focus back to the flap', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const flap = document.createElement('button');
    document.body.append(flap);
    const { plant } = fakePlant();
    const control = new TentControl(host, () => plant);
    flap.focus();
    const after = vi.fn();
    control.requestToggle(after);
    expect(control.confirming).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('#tent-confirm'));
    const box = host.querySelector<HTMLElement>('#tent-confirm-box')!;
    expect(box.getAttribute('role')).toBe('group');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    box.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(control.confirming).toBe(false);
    expect(plant.goOutside).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(flap);
    control.dispose();
    host.remove();
    flap.remove();
  });
});

describe('Go to a part across the flap (the sheet is down while the ask is open)', () => {
  it('spends exactly one trip on confirm and none on cancel; Cancel runs the pick-the-sheet-back-up callback', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const { plant, state } = fakePlant();
    const control = new TentControl(host, () => plant);
    // What SiteTab.visitPart_ passes: the close-up on confirm, the sheet picked back up on cancel
    const showCloseup = vi.fn();
    const pickSheetUp = vi.fn();
    control.requestToggle(showCloseup, pickSheetUp);
    host.querySelector<HTMLButtonElement>('#tent-cancel')!.click();
    expect(state.trips).toBe(0);
    expect(showCloseup).not.toHaveBeenCalled();
    expect(pickSheetUp).toHaveBeenCalledTimes(1);
    control.requestToggle(showCloseup, pickSheetUp);
    host.querySelector<HTMLButtonElement>('#tent-confirm')!.click();
    expect(state.trips).toBe(1);
    expect(showCloseup).toHaveBeenCalledTimes(1);
    expect(pickSheetUp).toHaveBeenCalledTimes(1);
    control.dispose();
    host.remove();
  });
});
