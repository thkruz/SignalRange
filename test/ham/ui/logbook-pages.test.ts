import { ConversationsPanel } from '../../../src/ham/ui/panels/conversations-panel';
import { FrontPanel } from '../../../src/ham/ui/panels/front-panel';
import { htmlToParagraphs } from '../../../src/ham/ui/panels/plain-text';
import type { PanelContext } from '../../../src/ham/ui/station-panel';
import { Character } from '../../../src/modal/character-enum';
import { DialogHistoryManager } from '../../../src/modal/dialog-history-manager';
import { ObjectivesManager } from '../../../src/objectives';
import { missionItemBridge } from '../../../src/pages/mission-control/tabs/field-kit';
import { HamStationTab } from '../../../src/pages/mission-control/tabs/ham-station-tab';
import { ScenarioManager } from '../../../src/scenario-manager';
import { baseConfig, baseDevices, harness } from '../manager/harness';

describe('htmlToParagraphs', () => {
  it('splits on br, p and raw newlines and decodes entities', () => {
    expect(htmlToParagraphs('One<br/>Two</p><p>Three &amp; four\nFive')).toEqual(['One', 'Two', 'Three & four', 'Five']);
  });

  it('keeps a literal less-than sign with spaces and drops real tags', () => {
    expect(htmlToParagraphs('Keep SNR < 10 dB and then > 3 dB <b>bold</b>')).toEqual(['Keep SNR < 10 dB and then > 3 dB bold']);
  });

  it('returns nothing for an empty string', () => {
    expect(htmlToParagraphs('')).toEqual([]);
  });
});

describe('FrontPanel', () => {
  const saved = { ...missionItemBridge };
  let prevData: unknown;
  beforeEach(() => {
    document.body.innerHTML = '';
    ObjectivesManager.destroy();
    ObjectivesManager.initialize([]);
    prevData = ScenarioManager.getInstance().data;
    ScenarioManager.getInstance().data = { title: 'Shift 1', subtitle: 'Bench', description: 'First line<br/>Second &amp; third' } as never;
    missionItemBridge.available = (item) => item === 'checklist' || item === 'brief';
  });
  afterEach(() => {
    ObjectivesManager.destroy();
    Object.assign(missionItemBridge, saved);
    ScenarioManager.getInstance().data = prevData as never;
  });

  it('builds the cover only while the page is open, and takes it apart on close', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = new FrontPanel();
    p.mount(host);
    expect(host.querySelector('.cbk-cover')).toBeNull();
    p.open();
    expect(host.querySelectorAll('.cbk-cover')).toHaveLength(1);
    expect(host.querySelectorAll('.cbk-brief')).toHaveLength(2);
    expect(host.querySelector('.cbk-brief:last-of-type')?.textContent).toBe('Second & third');
    p.open();
    expect(host.querySelectorAll('.cbk-cover')).toHaveLength(1);
    p.close();
    expect(host.querySelector('.cbk-cover')).toBeNull();
    p.dispose();
  });

  it('reading it counts as reading the mission brief but does not register the checklist window', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = new FrontPanel();
    p.mount(host);
    expect(ObjectivesManager.isBoxOpened('mission-brief')).toBe(false);
    p.open();
    expect(ObjectivesManager.isBoxOpened('mission-brief')).toBe(true);
    expect(ObjectivesManager.isBoxOpened('checklist')).toBe(false);
    p.dispose();
  });
});

describe('ConversationsPanel', () => {
  const saved = { ...missionItemBridge };
  beforeEach(() => {
    document.body.innerHTML = '';
    DialogHistoryManager.getInstance().clearHistory();
    missionItemBridge.available = (item) => item === 'dialog-history';
  });
  afterEach(() => Object.assign(missionItemBridge, saved));

  it('shows an empty page, then each line as text with paragraphs kept', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = new ConversationsPanel();
    p.mount(host, { putDown: vi.fn() } as unknown as PanelContext);
    expect(host.textContent).toContain('Nothing said on the radio yet.');
    DialogHistoryManager.getInstance().addEntry('<p>Copy that.</p><p>Out &amp; over.</p>', Character.CHARLIE_BROOKS, 'a.mp3', 'Check-in');
    const text = host.querySelector('.hl-said-text');
    expect(text?.textContent).toBe('Copy that.\nOut & over.');
    expect(text?.querySelector('p')).toBeNull();
    p.dispose();
  });

  it('puts the book down before it replays a clip', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const putDown = vi.fn();
    const p = new ConversationsPanel();
    p.mount(host, { putDown } as unknown as PanelContext);
    DialogHistoryManager.getInstance().addEntry('Hello', Character.CHARLIE_BROOKS, 'b.mp3', 'Hi');
    const replay = vi.spyOn(DialogHistoryManager.getInstance(), 'replayDialog').mockImplementation(() => {});
    host.querySelector<HTMLButtonElement>('[data-testid="ham-conv-0-replay"]')?.click();
    expect(putDown).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    replay.mockRestore();
    p.dispose();
  });
});

describe('HamStationTab feedback', () => {
  const q = (id: string): HTMLElement => {
    const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!e) throw new Error(`missing ${id}`);

    return e;
  };
  const make = () => {
    document.body.innerHTML = '<div id="canvas-content"></div>';
    const h = harness(baseConfig({ devices: baseDevices() }));
    const tab = new HamStationTab(h.m, 'canvas-content');

    return { h, tab };
  };
  beforeAll(() => {
    // jsdom has no modal dialog
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('scales the info duration with the message length', () => {
    expect(HamStationTab.toastMs('Short')).toBe(5000);
    expect(HamStationTab.toastMs('x'.repeat(100))).toBe(9500);
    expect(HamStationTab.toastMs('x'.repeat(1000))).toBe(15000);
  });

  it('keeps its text after the timer, hides an info slip, and keeps a warning up', () => {
    const { tab } = make();
    tab.feedback('Tuned to 145.500 MHz.', 'success');
    const toast = q('ham-station-feedback');
    expect(toast.hidden).toBe(false);
    vi.advanceTimersByTime(5100);
    expect(toast.hidden).toBe(true);
    expect(toast.textContent).toBe('Tuned to 145.500 MHz.');
    tab.feedback('The key refused: no licence.', 'warning');
    vi.advanceTimersByTime(60000);
    expect(toast.hidden).toBe(false);
    tab.feedback('', 'info');
    expect(toast.hidden).toBe(true);
    tab.dispose();
  });

  it('keeps a sticky instruction up and does not write it to the log', () => {
    const { tab } = make();
    tab.feedback('Holding the plug. Esc to put it down.', 'info', { sticky: true, log: false });
    vi.advanceTimersByTime(60000);
    expect(q('ham-station-feedback').hidden).toBe(false);
    tab.feedback('Plugged in.', 'success');
    tab.pickUp('logbook', 'ham-log');
    document.querySelector<HTMLButtonElement>('[data-testid="ham-log-tab-notes"]')?.click();
    const rows = q('ham-log-note-rows').textContent ?? '';
    expect(rows).toContain('Plugged in.');
    expect(rows).not.toContain('Holding the plug');
    tab.dispose();
  });

  it('shows no slip over a held logbook but still logs and announces', () => {
    const { tab } = make();
    tab.pickUp('logbook', 'ham-log');
    expect(document.querySelector('dialog.immersive-paper')).not.toBeNull();
    tab.feedback('Answer saved.', 'success');
    expect(q('ham-station-feedback').hidden).toBe(true);
    vi.advanceTimersByTime(100);
    expect(document.querySelector('dialog.immersive-paper')?.contains(q('ham-station-announcer'))).toBe(true);
    expect(q('ham-station-announcer').textContent).toBe('Answer saved.');
    tab.dispose();
  });
});
