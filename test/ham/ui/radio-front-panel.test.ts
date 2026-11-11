import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { HamStationTab } from '../../../src/pages/mission-control/tabs/ham-station-tab';
import { baseConfig, baseConnections, baseDevices, harness } from '../manager/harness';

const q = <T extends HTMLElement>(id: string): T => {
  const e = document.querySelector<T>(`[data-testid="${id}"]`);
  if (!e) throw new Error(`missing ${id}`);

  return e;
};
const key = (el: HTMLElement, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};
const pickOnBench = (id: string): void => {
  q(`ham-bench-dev-${id}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
};
const ch = (name: string, colorCode: number, timeSlot: 1 | 2) => ({ name, rxMHz: 442.1, txMHz: 447.1, colorCode, timeSlot, talkgroup: 31337 });

function setup() {
  document.body.innerHTML = '<div id="canvas-content"></div>';
  const devices = [
    ...baseDevices(),
    {
      id: 'dmr-ht',
      kind: 'dmr-handheld' as const,
      label: 'DMR handheld',
      location: 'bench',
      profileId: 'loaner-dmr-ht',
      powered: true,
      radio: { mode: 'DMR' as const, codeplug: [ch('One', 2, 2), ch('Two', 1, 1), ch('Three', 1, 2)] },
    },
  ];
  const h = harness(baseConfig({ devices, connections: baseConnections() }));
  const tab = new HamStationTab(h.m, 'canvas-content');

  return { h, tab };
}

describe('TransceiverFront', () => {
  const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
  });
  afterAll(() => {
    if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('DMR CH knob starts at "--" so channel 1 is one click away, and springs back from "--"', () => {
    const { h, tab } = setup();
    pickOnBench('dmr-ht');
    q('ham-radio-dmr-ht-operate').click();
    const knob = q('ham-radio-dmr-ht-dmr-channel');
    expect(h.m.radio('dmr-ht')?.activeDmrChannel).toBeNull();
    expect(knob.getAttribute('aria-valuenow')).toBe('-1');
    expect(knob.getAttribute('aria-valuetext')).toBe('No channel loaded');
    expect(q('ham-radio-dmr-ht-chan').textContent).toBe('CH--');
    key(knob, 'ArrowUp');
    expect(h.m.radio('dmr-ht')?.activeDmrChannel).toBe(0);
    expect(q('ham-radio-dmr-ht-chan').textContent).toBe('CH1');
    key(knob, 'ArrowDown');
    expect(h.m.radio('dmr-ht')?.activeDmrChannel).toBe(0);
    expect(knob.getAttribute('aria-valuenow')).toBe('0');
    key(knob, 'ArrowUp');
    expect(h.m.radio('dmr-ht')?.activeDmrChannel).toBe(1);
    tab.dispose();
  });

  it('one wheel notch is one detent', () => {
    const { h, tab } = setup();
    pickOnBench('mobile');
    q('ham-radio-mobile-operate').click();
    const before = h.m.radio('mobile')?.volume ?? 0;
    q('ham-radio-mobile-volume').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(h.m.radio('mobile')?.volume).toBe(before + 1);
    tab.dispose();
  });

  it('names carry the printed legend, STEP announces its step, the endless dial is a spinbutton', () => {
    const { tab } = setup();
    pickOnBench('mobile');
    q('ham-radio-mobile-operate').click();
    expect(q('ham-radio-mobile-txpower').getAttribute('aria-label')).toMatch(/^PWR, /u);
    expect(q('ham-radio-mobile-squelch').getAttribute('aria-label')).toMatch(/^SQL, /u);
    const step = q('ham-radio-mobile-step');
    const first = step.getAttribute('aria-label');
    expect(first).toMatch(/^STEP, /u);
    step.click();
    expect(step.getAttribute('aria-label')).not.toBe(first);
    const dial = q('ham-radio-mobile-dial');
    expect(dial.getAttribute('role')).toBe('spinbutton');
    expect(dial.hasAttribute('aria-valuemin')).toBe(false);
    expect(q('ham-radio-mobile-volume').getAttribute('role')).toBe('slider');
    tab.dispose();
  });

  it('shows a tone outside the CTCSS table as it is', () => {
    const { h, tab } = setup();
    const r = h.m.radio('mobile');
    if (r) r.txToneHz = 100.5;
    pickOnBench('mobile');
    q('ham-radio-mobile-operate').click();
    expect(q('ham-radio-mobile-txtone').getAttribute('aria-valuetext')).toBe('TX tone 100.5 Hz');
    tab.dispose();
  });

  it('shows TX rather than the -200 sentinel while keyed', () => {
    const { h, tab } = setup();
    pickOnBench('mobile');
    q('ham-radio-mobile-operate').click();
    q('ham-ptt-mobile-transmit').click();
    expect(h.m.keyed()?.deviceId).toBe('mobile');
    expect(q('ham-radio-mobile-front').textContent).not.toContain('-200');
    expect(q('ham-radio-mobile-sql').textContent).toBe('TX');
    tab.dispose();
  });

  it('keeps the front panel live when the radio list changes while operating', () => {
    const { h, tab } = setup();
    pickOnBench('mobile');
    q('ham-radio-mobile-operate').click();
    const dialog = (): HTMLDialogElement => document.querySelector<HTMLDialogElement>('dialog.immersive-transceiver') as HTMLDialogElement;
    expect(dialog().contains(q('ham-radio-mobile-front'))).toBe(true);
    const spare = h.m.device('dmr-ht');
    if (spare) spare.removed = true;
    EventBus.getInstance().emit(Events.HAM_STATION_UPDATED, { stateVersion: 99, nowS: 1 });
    const after = q('ham-radio-mobile-front');
    expect(after.isConnected).toBe(true);
    expect(dialog().contains(after)).toBe(true);
    key(q('ham-radio-mobile-volume'), 'ArrowUp');
    expect(q('ham-radio-mobile-volume').getAttribute('aria-valuenow')).toBe(String(h.m.radio('mobile')?.volume));
    tab.dispose();
  });

  it('does not build a front panel for an SDR', () => {
    const { tab } = setup();
    expect(document.querySelector('[data-testid="ham-radio-sdr-front"]')).toBeNull();
    tab.dispose();
  });

  it('Escape closes only the front panel over the close-up and focus returns to Operate', () => {
    const { tab } = setup();
    pickOnBench('mobile');
    const before = document.querySelectorAll('dialog.immersive-view').length;
    const operate = q('ham-radio-mobile-operate');
    operate.focus();
    operate.click();
    const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog.immersive-view');
    expect(dialogs.length).toBe(before + 1);
    dialogs[dialogs.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelectorAll('dialog.immersive-view').length).toBe(before);
    expect(document.querySelector('dialog.immersive-transceiver')).toBeNull();
    expect(document.activeElement).toBe(operate);
    tab.dispose();
  });
});
