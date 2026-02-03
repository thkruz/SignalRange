import { vi } from 'vitest';
import { RFFrontEndCore } from '../../../src/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '../../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

describe('RFFrontEndUIStandard', () => {
  let rfFrontEnd: RFFrontEndCore;

  beforeEach(() => {
    vi.resetModules();

    document.body.innerHTML = '<div id="test-root"></div>';

    EventBus.getInstance().clear(Events.UPDATE);
    EventBus.getInstance().clear(Events.SYNC);
  });

  afterEach(() => {
    vi.clearAllMocks();
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  it('updates nested numeric state via data-param on input', () => {
    rfFrontEnd = createRFFrontEnd('test-root');

    const container = document.querySelector(
      `.equipment-case[data-unit="${rfFrontEnd.state.uuid}"]`,
    ) as HTMLElement;
    expect(container).toBeTruthy();

    const input = document.createElement('input');
    input.type = 'number';
    input.value = '12';
    input.dataset.param = 'buc.gain';
    container.appendChild(input);

    // Re-attach listeners so the new input is wired
    (rfFrontEnd as any).attachEventListeners();

    const syncSpy = vi.spyOn(rfFrontEnd, 'syncDomWithState');

    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(rfFrontEnd.state.buc.gain).toBe(12);
    expect(syncSpy).toHaveBeenCalled();
  });

  it('updates nested string state via data-param on select', () => {
    rfFrontEnd = createRFFrontEnd('test-root');

    const container = document.querySelector(
      `.equipment-case[data-unit="${rfFrontEnd.state.uuid}"]`,
    ) as HTMLElement;
    expect(container).toBeTruthy();

    const select = document.createElement('select');
    select.dataset.param = 'omt.txPolarization';
    select.innerHTML = '<option value="H">H</option><option value="V">V</option>';
    select.value = 'V';
    container.appendChild(select);

    (rfFrontEnd as any).attachEventListeners();

    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rfFrontEnd.state.omt.txPolarization).toBe('V');
  });

  it('ignores inputs without data-param', () => {
    rfFrontEnd = createRFFrontEnd('test-root');

    const container = document.querySelector(
      `.equipment-case[data-unit="${rfFrontEnd.state.uuid}"]`,
    ) as HTMLElement;
    expect(container).toBeTruthy();

    const input = document.createElement('input');
    input.type = 'number';
    input.value = '99';
    // no data-param
    container.appendChild(input);

    (rfFrontEnd as any).attachEventListeners();

    const originalGain = rfFrontEnd.state.buc.gain;
    const syncSpy = vi.spyOn(rfFrontEnd, 'syncDomWithState');

    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rfFrontEnd.state.buc.gain).toBe(originalGain);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('does not write state for non 2-part param paths', () => {
    rfFrontEnd = createRFFrontEnd('test-root');

    const container = document.querySelector(
      `.equipment-case[data-unit="${rfFrontEnd.state.uuid}"]`,
    ) as HTMLElement;
    expect(container).toBeTruthy();

    const input = document.createElement('input');
    input.type = 'number';
    input.value = '123';
    input.dataset.param = 'buc.gain.extra';
    container.appendChild(input);

    (rfFrontEnd as any).attachEventListeners();

    const originalGain = rfFrontEnd.state.buc.gain;
    const syncSpy = vi.spyOn(rfFrontEnd, 'syncDomWithState');

    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(rfFrontEnd.state.buc.gain).toBe(originalGain);
    // handleInputChange always calls syncDomWithState once param exists
    expect(syncSpy).toHaveBeenCalled();
  });
});
