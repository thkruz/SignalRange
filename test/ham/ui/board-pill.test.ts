import type { HamDeviceKind } from '../../../src/ham/ham-station-config';
import { HamStationTab } from '../../../src/pages/mission-control/tabs/ham-station-tab';
import { baseConfig, baseDevices, harness } from '../manager/harness';

const q = <T extends HTMLElement>(id: string): T => {
  const e = document.querySelector<T>(`[data-testid="${id}"]`);
  if (!e) throw new Error(`missing ${id}`);

  return e;
};

describe('bench close-up power pill on the practice board (issue 306)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('switches the board supply on, not just SW1', () => {
    document.body.innerHTML = '<div id="canvas-content"></div>';
    const devices = [...baseDevices(), { id: 'board', kind: 'circuit-board' as HamDeviceKind, label: 'Practice board', location: 'bench', board: true as const, powered: false }];
    const h = harness(baseConfig({ devices }));
    const tab = new HamStationTab(h.m, 'canvas-content');
    q('ham-bench-dev-board').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const pill = q('ham-conn-board-power');
    expect(pill.textContent).toBe('Switch on');
    pill.click();
    expect(h.m.device('board')?.powered).toBe(true);
    expect(h.m.energized('board')).toBe(true);
    expect(q('ham-conn-board-power').textContent).toBe('Switch off');
    tab.dispose();
  });
});
