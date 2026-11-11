import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { HamSdrConsoleTab } from '../../../src/pages/mission-control/tabs/ham-sdr-console-tab';
import { baseConfig, harness } from '../manager/harness';

describe('SkyWatcher Technician console', () => {
  it('tunes the lesson receiver and recovers its display after USB reconnection', () => {
    document.body.innerHTML = '<div id="canvas-content"></div>';
    const { m, actOk } = harness(baseConfig());
    const tab = new HamSdrConsoleTab(m, 'canvas-content');
    const input = document.querySelector<HTMLInputElement>('[data-testid="ham-sdr-sdr-freq-input"]')!;
    input.value = '146.57';
    document.querySelector<HTMLButtonElement>('[data-testid="ham-sdr-sdr-freq-enter"]')!.click();
    expect(m.radio('sdr')?.vfoMHz).toBe(146.57);
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ham-spectrum-sdr-canvas"]')!;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(m.radio('sdr')?.vfoMHz).toBeCloseTo(146.569, 5);
    actOk({ type: 'disconnect', connectionId: 'sdr-usb' });
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED);
    expect(tab.dom.textContent).toContain('No receiver found');
    expect(document.querySelector('canvas')).toBeNull();
    actOk({ type: 'connect', a: { deviceId: 'sdr', portId: 'usb' }, b: { deviceId: 'laptop', portId: 'usb1' } });
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED);
    expect(document.querySelector('[data-testid="ham-spectrum-sdr-canvas"]')).not.toBeNull();
    tab.dispose();
    expect(document.querySelector('[data-testid="ham-sdr-console"]')).toBeNull();
  });
});
