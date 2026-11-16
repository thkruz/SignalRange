import { vi } from 'vitest';
import { createRFFrontEnd } from '../../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../../src/events/event-bus';
import { Events } from '../../../../src/events/events';
import { TapPointAdapter } from '../../../../src/pages/mission-control/tabs/tap-point-adapter';

const TAP_DOM = `
  <div id="tap-default-mode">
    <input type="checkbox" id="tap-default-enable" />
    <select id="tap-default-select"><option value="RX IF">RX IF</option><option value="TX IF">TX IF</option></select>
    <span id="tap-default-status"></span><span id="tap-default-coupling"></span>
  </div>
  <div id="tap-engineering-mode-container">
    <input type="checkbox" id="tap-a-enable" /><select id="tap-a-select"></select>
    <span id="tap-a-status"></span><span id="tap-a-coupling"></span>
    <input type="checkbox" id="tap-b-enable" /><select id="tap-b-select"></select>
    <span id="tap-b-status"></span><span id="tap-b-coupling"></span>
  </div>`;

describe('TapPointAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="rf-root"></div><div id="tap-root"></div>';
    EventBus.destroy();
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('opening the tab is not a coupler change: no RF_FE_COUPLER_CHANGED, so no Ops Log line (nats-r4-s11-F2)', () => {
    const coupler = createRFFrontEnd('rf-root').couplerModule;
    const container = document.getElementById('tap-root') as HTMLElement;
    container.innerHTML = TAP_DOM;
    const analyzer = { state: { isUseTapA: false, isUseTapB: false } };
    const emitted = vi.fn();
    EventBus.getInstance().on(Events.RF_FE_COUPLER_CHANGED, emitted);

    const adapter = new TapPointAdapter(coupler, analyzer as never, container);

    expect(emitted).not.toHaveBeenCalled();
    // The analyzer still follows the coupler's taps
    expect(analyzer.state.isUseTapA || analyzer.state.isUseTapB).toBe(coupler.state.isEnabledB);

    // A real operator change still reports
    const enable = container.querySelector('#tap-default-enable') as HTMLInputElement;
    enable.checked = !coupler.state.isEnabledB;
    enable.dispatchEvent(new Event('change'));
    expect(emitted).toHaveBeenCalledTimes(1);

    adapter.dispose();
  });
});
