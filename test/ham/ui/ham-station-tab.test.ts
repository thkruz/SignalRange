import { missionItemBridge } from '../../../src/pages/mission-control/tabs/field-kit';
import { HamStationTab } from '../../../src/pages/mission-control/tabs/ham-station-tab';
import { baseConfig, baseConnections, baseDevices, harness } from '../manager/harness';

const q = <T extends HTMLElement>(id: string): T => {
  const e = document.querySelector<T>(`[data-testid="${id}"]`);
  if (!e) throw new Error(`missing ${id}`);

  return e;
};

/** Click a device or cable on the bench drawing so its Close-up shows */
const pickOnBench = (kind: 'dev' | 'conn', id: string): void => {
  q(`ham-bench-${kind}-${id}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

function setup(license: 'none' | 'technician' = 'technician') {
  document.body.innerHTML = '<div id="canvas-content"></div>';
  const cfg = baseConfig({
    operator: { license, callsign: 'KF0SRT', name: 'Trainee' },
    connections: baseConnections().map((c) => (c.id === 'sdr-feed' ? { ...c, seated: false } : c)),
    faults: [{ id: 'loose', target: 'sdr-feed', kind: 'loose-connector', inspectClue: 'Thread is showing at the antenna connector.', clearedBy: { action: 'seat' } }],
    devices: baseDevices(),
    worksheets: [
      {
        id: 'w1',
        title: 'Coax loss',
        prompt: 'Which cable loses less?',
        fields: [{ id: 'pick', label: 'Cable', kind: 'choice', options: ['RG-58', 'LMR-400'], answer: 'LMR-400' }],
        explanation: 'LMR-400 has lower loss.',
        wrongFeedback: { pick: 'Look at loss per 100 ft.' },
      },
    ],
    cards: [{ id: 'c1', title: 'Band plan', body: '2 m: 144 to 148 MHz' }],
  });
  const h = harness(cfg);
  const tab = new HamStationTab(h.m, 'canvas-content');

  return { h, tab };
}

describe('HamStationTab', () => {
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

  it('tunes a radio by direct entry (F.INP, type, ENT) and with the main dial', () => {
    const { h, tab } = setup();
    pickOnBench('dev', 'mobile');
    q('ham-radio-mobile-operate').click();
    q('ham-radio-mobile-finp').click();
    const input = q<HTMLInputElement>('ham-radio-mobile-freq-input');
    expect(input.hidden).toBe(false);
    const before = h.m.radio('mobile')?.vfoMHz;
    input.value = '145.5';
    expect(h.m.radio('mobile')?.vfoMHz).toBe(before);
    q('ham-radio-mobile-apply').click();
    expect(h.m.radio('mobile')?.vfoMHz).toBe(145.5);
    expect(input.hidden).toBe(true);
    const dial = q('ham-radio-mobile-dial');
    dial.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(h.m.radio('mobile')?.vfoMHz).toBe(145.505);
    expect(dial.getAttribute('aria-valuetext')).toContain('145.5050 MHz');
    tab.dispose();
  });

  it('seats a loose connection and clears the fault', () => {
    const { h, tab } = setup();
    expect(h.m.connection('sdr-feed')?.seated).toBe(false);
    pickOnBench('conn', 'sdr-feed');
    q('ham-conn-sdr-feed-seat').click();
    expect(h.m.connection('sdr-feed')?.seated).toBe(true);
    expect(h.m.faultCleared('loose')).toBe(true);
    tab.dispose();
  });

  it('shows the inspect clue and submits a worksheet', () => {
    const { h, tab } = setup();
    pickOnBench('conn', 'sdr-feed');
    q('ham-conn-sdr-feed-inspect').click();
    expect(q('ham-conn-sdr-feed-clue').textContent).toContain('Thread is showing');
    const pick = q<HTMLSelectElement>('ham-ws-w1-pick');
    pick.value = 'RG-58';
    q('ham-ws-w1-submit').click();
    expect(q('ham-ws-w1-feedback').textContent).toContain('Look at loss');
    expect(h.m.worksheet('w1')?.correct).toBe(false);
    pick.value = 'LMR-400';
    q('ham-ws-w1-submit').click();
    expect(h.m.worksheet('w1')?.correct).toBe(true);
    expect(q('ham-ws-w1-feedback').textContent).toContain('lower loss');
    tab.dispose();
  });

  it('shows the refusal reason when keying is refused', () => {
    const { h, tab } = setup('none');
    pickOnBench('dev', 'mobile');
    q('ham-ptt-mobile-transmit').click();
    expect(h.m.keyed()).toBeNull();
    expect(q('ham-ptt-mobile-refusal').textContent?.length).toBeGreaterThan(0);
    expect(q('ham-station-feedback').hidden).toBe(false);
    tab.dispose();
  });

  it('moves between locations with the location bar', () => {
    const { h, tab } = setup();
    q('ham-loc-yard').click();
    expect(h.m.location).toBe('yard');
    tab.dispose();
    expect(document.querySelector('[data-testid="ham-station-tab"]')).toBeNull();
  });

  it('marks where you stand with a plaque and the other spots with walk signs', () => {
    const { h, tab } = setup();
    expect(q('ham-loc-bench').getAttribute('aria-pressed')).toBe('true');
    expect(q('ham-loc-yard').getAttribute('aria-label')).toMatch(/^Walk to/u);
    q('ham-loc-yard').click();
    expect(q('ham-loc-yard').getAttribute('aria-pressed')).toBe('true');
    expect(h.m.location).toBe('yard');
    tab.dispose();
  });

  it('opens the logbook at the worksheets and turns to the station log', () => {
    const { tab } = setup();
    const logbook = document.querySelector<HTMLButtonElement>('[data-field-kit="logbook"]');
    expect(logbook?.hidden).toBe(false);
    logbook?.click();
    const dialog = document.querySelector('dialog.immersive-paper');
    expect(dialog?.hasAttribute('open') || (dialog as HTMLDialogElement | null)?.open).toBe(true);
    expect(q('ham-notebook').dataset.page).toBe('worksheets');
    expect(dialog?.contains(q('ham-ws-w1-submit'))).toBe(true);
    const logTab = document.querySelector<HTMLButtonElement>('[data-field-object="ham-log"]');
    logTab?.focus();
    logTab?.click();
    expect(q('ham-notebook').dataset.page).toBe('log');
    // The page turns in place: same dialog, the pressed tab moves, focus stays on the tab
    expect(document.querySelectorAll('dialog.immersive-paper')).toHaveLength(1);
    expect(document.querySelector('dialog.immersive-paper')).toBe(dialog);
    expect(logTab?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-field-object="ham-worksheets"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(logTab);
    tab.dispose();
  });

  it('opens the reference cards from the tray', () => {
    const { tab } = setup();
    document.querySelector<HTMLButtonElement>('[data-field-kit="cards"]')?.click();
    expect(q('ham-notebook').dataset.page).toBe('cards');
    expect(document.querySelector('dialog.immersive-paper')?.contains(q('ham-card-c1'))).toBe(true);
    // The first card lies open, not a bar of closed titles
    expect(q('ham-card-c1-body').hidden).toBe(false);
    expect(q('ham-card-c1-toggle').getAttribute('aria-expanded')).toBe('true');
    tab.dispose();
  });

  it('opens the logbook with the Mission brief tab marked while the scenario waits on the brief', () => {
    const saved = { ...missionItemBridge };
    missionItemBridge.available = (item) => item === 'brief';
    missionItemBridge.locked = () => true;
    const open = vi.fn(() => true);
    missionItemBridge.open = open;
    try {
      const { tab } = setup();
      document.querySelector<HTMLButtonElement>('[data-field-kit="logbook"]')?.click();
      expect(q('ham-notebook').dataset.page).toBe('worksheets');
      const brief = document.querySelector<HTMLButtonElement>('dialog.immersive-paper [data-field-mission="brief"]');
      expect(brief?.classList.contains('is-due')).toBe(true);
      expect(brief?.textContent).toContain('read this first');
      brief?.click();
      expect(open).toHaveBeenCalledWith('brief');
      expect(document.querySelector('dialog.immersive-paper')).toBeNull();
      tab.dispose();
    } finally {
      Object.assign(missionItemBridge, saved);
    }
  });
});
