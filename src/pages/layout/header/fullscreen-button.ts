/** Native fullscreen; fullscreenchange also handles Escape and browser controls. */
export function setupFullscreenButton(button: HTMLButtonElement, status: HTMLElement): () => void {
  const sync = (): void => {
    const active = Boolean(document.fullscreenElement);
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  const supported = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  button.disabled = !supported;
  sync();
  if (!supported) {
    button.title = 'Fullscreen is not supported in this browser';
    button.setAttribute('aria-label', button.title);
  }
  const toggle = async (): Promise<void> => {
    button.disabled = true;
    status.textContent = '';
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      status.textContent = 'Fullscreen could not be changed. Please try again.';
      button.title = status.textContent;
    } finally {
      button.disabled = !supported;
    }
  };
  document.addEventListener('fullscreenchange', sync);
  button.addEventListener('click', toggle);
  return () => {
    document.removeEventListener('fullscreenchange', sync);
    button.removeEventListener('click', toggle);
  };
}
