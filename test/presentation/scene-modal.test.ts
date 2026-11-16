import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { missionOpening } from '../../src/presentation/mission-opening';
import { type SceneData, SceneModal } from '../../src/presentation/scene-modal';
import type { ScenarioData } from '../../src/ScenarioData';

vi.mock('../../src/presentation/transitions', () => ({ fade: () => null, preloadArtwork: vi.fn() }));
const scene: SceneData = {
  label: 'Shift begins',
  title: 'First Day',
  image: '/room.webp',
  imageAlt: 'Station interior',
  facts: [{ label: 'Station', value: 'Vermont' }],
  actionLabel: 'Start',
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('scene modal lifecycle', () => {
  it('waits for an explicit Start and restores focus after acceptance', async () => {
    const prior = document.createElement('button');
    document.body.append(prior);
    prior.focus();
    const modal = new SceneModal(scene, vi.fn());
    const settled = vi.fn();
    void modal.result.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Start');
    document.querySelector<HTMLButtonElement>('.scene-start')!.click();
    await expect(modal.result).resolves.toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(prior);
  });

  it('cancels on back/Escape and never accepts a disposed scene', async () => {
    const back = vi.fn();
    const modal = new SceneModal(scene, back);
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(modal.result).resolves.toBe(false);
    expect(back).toHaveBeenCalledOnce();
    const other = new SceneModal(scene, back);
    document.querySelector<HTMLButtonElement>('.scene-start')!.click();
    other.dispose();
    await expect(other.result).resolves.toBe(false);
  });

  it('supports an epilogue and renders authored content as text', async () => {
    const modal = new SceneModal(
      { ...scene, label: 'Campaign complete', title: '<img src=x>', actionLabel: 'Continue', body: 'Your final service record.', participants: [{ name: '<b>Crew</b>' }] },
      vi.fn()
    );
    expect(document.querySelector('h1')!.textContent).toBe('<img src=x>');
    expect(document.querySelector('h1 img')).toBeNull();
    expect(document.querySelector('.scene-body')!.textContent).toBe('Your final service record.');
    expect(document.querySelector('.scene-start')!.textContent).toBe('Continue');
    modal.dispose();
    await expect(modal.result).resolves.toBe(false);
  });

  it('keeps the final message before the service record and task codes collapsed', () => {
    const modal = new SceneModal(
      {
        ...scene,
        body: 'The next watch has your log.',
        attribution: 'Station crew',
        record: {
          title: 'Service record',
          note: 'Recorded results.',
          awards: [{ title: '<b>Watch complete</b>', description: 'All missions.' }],
          taskCodes: ['T0081', 'T0153'],
          totalTasks: 2,
        },
      },
      vi.fn()
    );
    const content = document.querySelector('.scene-content')!;
    expect(content.textContent!.indexOf('The next watch')).toBeLessThan(content.textContent!.indexOf('Service record'));
    expect(document.querySelector('details')!.open).toBe(false);
    expect(document.querySelector('summary')!.textContent).toContain('2 / 2 NICE tasks');
    expect(document.querySelector('.scene-awards b')).toBeNull();
    expect(document.querySelector('.scene-task-codes')!.textContent).toContain('Diagnose network connectivity problems');
    expect(document.querySelector('.scene-task-codes')!.textContent).toContain('Monitor network capacity and performance');
    expect(document.querySelector('.scene-task-codes code')!.textContent).toBe('T0081');
    modal.dispose();
  });
});

describe('mission opening metadata', () => {
  const scenario = {
    id: 'nats-scenario1',
    url: 'nats/scenarios/nats-scenario1',
    title: 'First Day',
    number: 1,
    missionType: 'Routine',
    settings: { groundStations: [{ name: 'Vermont' }], scenarioStartWallTime: '07:30:00', scenarioStartDate: '2026-02-03' },
  } as ScenarioData;
  it('expands the campaign with a prologue and keeps the place and actual time secondary', () => {
    const data = missionOpening(scenario)!;
    expect(data.subtitle).toBe('Vermont · 07:30:00 UTC');
    expect(data.facts).toEqual([]);
    expect(data.participants).toBeUndefined();
    expect(data.title).not.toBe(scenario.title);
    expect(data.body?.split('\n\n')).toHaveLength(3);
    expect(data.image).toBe('/images/scenes/nats-v2.webp');
  });
  it('allows mission-specific scenes and does not invent a campaign image for plugins', () => {
    const data = missionOpening({
      ...scenario,
      id: 'external-one',
      url: 'external/scenarios/one',
      imageUrl: 'external/one.png',
      openingScene: { title: 'Authored opening', image: '/custom.webp' },
    })!;
    expect(data.title).toBe('Authored opening');
    expect(data.image).toBe('/custom.webp');
    expect(
      missionOpening({ ...scenario, id: 'external-one', url: 'external/scenarios/one', imageUrl: 'external/one.png', openingScene: { body: 'A new shift.' } })?.image
    ).toContain('/assets/campaigns/external/one.png');
  });
  it('skips later missions unless a story scene has been authored', () => {
    expect(missionOpening({ ...scenario, id: 'nats-scenario2', number: 2 })).toBeNull();
    expect(missionOpening({ ...scenario, id: 'nats-scenario2', number: 2, openingScene: { body: 'A new shift.' } })?.body).toBe('A new shift.');
  });
});
