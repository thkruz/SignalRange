import { hamTechS02Data } from '../../../src/campaigns/ham-sdr/tech/s02-power-on-the-bench';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { HamStationTab } from '../../../src/pages/mission-control/tabs/ham-station-tab';
import { harness } from '../manager/harness';

const q = (id: string): HTMLElement => {
  const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!e) throw new Error(`missing ${id}`);

  return e;
};

describe('Close-up note after the meter locates a fault', () => {
  it('drops the sealed-covers clue once the fault is located', () => {
    document.body.innerHTML = '<div id="canvas-content"></div>';
    const h = harness(structuredClone(hamTechS02Data.settings.hamStation) as never);
    const tab = new HamStationTab(h.m, 'canvas-content');
    q('ham-bench-dev-board').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    q('ham-conn-board-inspect').click();
    expect(q('ham-conn-board-clue').textContent).toContain('covers are sealed');
    h.advance(2);
    h.actOk({ type: 'board.switch', deviceId: 'board', on: true } as never);
    h.actOk({ type: 'power', deviceId: 'board', on: false } as never);
    h.actOk({ type: 'meter.mode', mode: 'CONT' } as never);
    h.actOk({ type: 'meter.place', targetId: 'board', red: 'tp-sw1-in', black: 'tp-sw1-out' } as never);
    h.actOk({ type: 'meter.read' } as never);
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED);
    expect(document.querySelector('[data-testid="ham-conn-board-clue"]')).toBeNull();
    expect(q('ham-closeup').textContent).toContain('Repair');
    tab.dispose();
    document.body.innerHTML = '<div id="canvas-content"></div>';
  });
});
