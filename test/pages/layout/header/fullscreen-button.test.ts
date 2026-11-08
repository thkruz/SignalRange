import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFullscreenButton } from '../../../../src/pages/layout/header/fullscreen-button';

describe('fullscreen control', () => {
  let button: HTMLButtonElement;
  let status: HTMLElement;
  let dispose: () => void;
  beforeEach(() => {
    button = document.createElement('button');
    status = document.createElement('span');
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(() => dispose?.());

  it('enters/exits fullscreen and reflects external Escape changes', async () => {
    dispose = setupFullscreenButton(button, status);
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(button.getAttribute('aria-label')).toBe('Exit fullscreen');
    button.click();
    await vi.waitFor(() => expect(document.exitFullscreen).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.title).toBe('Enter fullscreen');
  });

  it('reports browser rejection and leaves the button usable', async () => {
    vi.mocked(document.documentElement.requestFullscreen).mockRejectedValue(new Error('Denied'));
    dispose = setupFullscreenButton(button, status);
    button.click();
    await vi.waitFor(() => expect(status.textContent).toContain('could not'));
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables unsupported fullscreen and removes listeners on disposal', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    dispose = setupFullscreenButton(button, status);
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('not supported');
    dispose();
    button.disabled = false;
    button.click();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
});
