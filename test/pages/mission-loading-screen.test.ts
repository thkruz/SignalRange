import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionLoadingScreen } from '../../src/pages/mission-loading-screen';
import type { ScenarioData } from '../../src/ScenarioData';

vi.mock('../../src/utils/asset-url', () => ({ getAssetUrl: (path: string) => path }));

const scenario = { title: 'First Day', imageUrl: 'nats/1/card.png' } as ScenarioData;
afterEach(() => {
  document.body.innerHTML = '';
});

describe('mission loading screen', () => {
  it('shows the selected mission, offers a way back, and is removed when ready', async () => {
    const back = vi.fn();
    const screen = new MissionLoadingScreen(scenario, back);
    expect(document.querySelector('.mission-loading-content h1')?.textContent).toBe('First Day');
    const button = document.querySelector('button')!;
    expect(document.activeElement).toBe(button);
    button.click();
    expect(back).toHaveBeenCalledOnce();
    await screen.reveal();
    expect(document.querySelector('.mission-loading-screen')).toBeNull();
  });

  it('keeps preparation errors recoverable, including errors after reveal', async () => {
    const screen = new MissionLoadingScreen(scenario, vi.fn());
    await screen.reveal();
    screen.fail();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Your save has not been replaced');
    expect(document.querySelector('[data-retry]')?.textContent).toBe('Retry');
    expect(document.activeElement?.textContent).toBe('Retry');
    screen.dispose();
    expect(document.querySelector('.mission-loading-screen')).toBeNull();
  });
});
