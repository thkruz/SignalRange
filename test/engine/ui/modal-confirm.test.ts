import { ModalConfirm } from '@app/engine/ui/modal-confirm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const escapeKey = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

describe('ModalConfirm Escape', () => {
  afterEach(() => {
    ModalConfirm.getInstance().close();
    vi.restoreAllMocks();
  });

  it('cancels the confirm and marks the key handled, so the window pause-menu listener skips it', () => {
    const onConfirm = vi.fn();
    ModalConfirm.getInstance().open(onConfirm, { message: 'You are outside' });
    const box = document.getElementById('modal-confirm-container') as HTMLElement;
    expect(box.style.display).not.toBe('none');

    // The game menu listens on window and returns when the event is already defaultPrevented
    const pauseMenu = vi.fn();
    const onWindow = (event: KeyboardEvent) => {
      if (!event.defaultPrevented) pauseMenu();
    };
    window.addEventListener('keydown', onWindow);
    document.dispatchEvent(escapeKey());
    window.removeEventListener('keydown', onWindow);

    expect(box.style.display).toBe('none');
    expect(pauseMenu).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('removes its document Escape listener on close and keeps one listener across reopens', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const modal = ModalConfirm.getInstance();
    modal.open(vi.fn());
    modal.close();
    modal.open(vi.fn());
    modal.close();

    const keydownAdds = add.mock.calls.filter((c) => c[0] === 'keydown');
    const keydownRemoves = remove.mock.calls.filter((c) => c[0] === 'keydown');
    // The keydown listener added on open is the one removed on close, every time
    const removed = keydownRemoves.map((c) => c[1]);
    expect(removed.length).toBe(2);
    expect(new Set(removed).size).toBe(1);
    expect(keydownAdds.map((c) => c[1])).toContain(removed[0]);
  });
});
