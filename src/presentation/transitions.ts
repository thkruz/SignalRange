import { prefersReducedMotion } from '@app/game-menu/display-preferences';
import './transitions.css';

export const TRANSITION_MS = { interface: 180, scene: 240, audio: 600 } as const;

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
