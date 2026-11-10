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
