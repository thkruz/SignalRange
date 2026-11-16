import { ClipboardShell } from '@app/pages/mission-control/tabs/clipboard/clipboard-shell';
import { clipboardPages } from '@app/pages/mission-control/tabs/clipboard/clipboard-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('clipboard equipment log badge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('marks the equipment log tab when notices arrive and clears it when they are read', () => {
    let unread = 0;
    const pages = clipboardPages(
      new Set(['field-records']),
      () => true,
      () => undefined,
      () => unread
    );
    const records = pages.find((p) => p.id === 'field-records');
    expect(records?.badge).toBeDefined();

    const leave = document.createElement('button');
    const shell = new ClipboardShell(document.createElement('div'), leave, { pages, activeId: 'field-records' });
    const tab = (): HTMLElement | null => shell.element.querySelector('[data-cbk-page="field-records"]');
    expect(tab()?.dataset.badge).toBeUndefined();

    unread = 2;
    vi.advanceTimersByTime(1100);
    expect(tab()?.dataset.badge).toBe('2');

    unread = 0;
    vi.advanceTimersByTime(1100);
    expect(tab()?.dataset.badge).toBeUndefined();
    shell.dispose();
  });
});
