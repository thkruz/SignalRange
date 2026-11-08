import { prefersReducedMotion } from '@app/game-menu/display-preferences';
import './transitions.css';

export const TRANSITION_MS = { interface: 180, scene: 240, audio: 600 } as const;

const panelAnimations = new WeakMap<Element, Animation>();
export function revealPanel(element: Element): void {
  panelAnimations.get(element)?.cancel();
  if (prefersReducedMotion() || typeof element.animate !== 'function') return;
  panelAnimations.set(element, element.animate([{ opacity: 0.85 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }));
}

/** Only newly completed, already-visible rows receive a one-time highlight. */
export function updateChecklistWithMotion(container: HTMLElement, content: string): void {
  const previous = new Map(
    Array.from(container.querySelectorAll<HTMLElement>('.objective-item[data-objective-id]'), (row) => [row.dataset.objectiveId, row.classList.contains('completed')])
  );
  const visible = container.getClientRects().length > 0;
  container.innerHTML = content;
  if (!visible || prefersReducedMotion()) return;
  for (const row of container.querySelectorAll<HTMLElement>('.objective-item.completed[data-objective-id]')) {
    if (previous.get(row.dataset.objectiveId) !== false) continue;
    row.querySelector('.objective-header')?.animate?.([{ backgroundColor: 'rgba(76, 175, 80, 0.24)' }, { backgroundColor: 'transparent' }], { duration: 450, easing: 'ease-out' });
  }
}

export function fade(element: Pick<Element, 'animate'>, from: number, to: number, scene = false): Animation | null {
  if (prefersReducedMotion() || typeof element.animate !== 'function') return null;
  return element.animate([{ opacity: from }, { opacity: to }], { duration: scene ? TRANSITION_MS.scene : TRANSITION_MS.interface, easing: 'ease-out' });
}

const artwork = new Map<string, HTMLImageElement>();
export function preloadArtwork(url: string): void {
  if (!url || artwork.has(url)) return;
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  artwork.set(url, image);
  if (artwork.size > 8) artwork.delete(artwork.keys().next().value!);
}
