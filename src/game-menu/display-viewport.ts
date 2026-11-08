export type GameResolution = 'native' | '1080p' | '1440p';

/** Never shrink the UI on smaller windows; preserve extra space on ultrawide screens. */
export function resolutionScale(resolution: GameResolution, width: number, height: number): number {
  const targetHeight = resolution === '1080p' ? 1080 : resolution === '1440p' ? 1440 : 0;
  return targetHeight ? Math.max(1, Math.min(width / ((targetHeight * 16) / 9), height / targetHeight)) : 1;
}

export function displayScale(): number {
  return Number.parseFloat(document.documentElement.style.zoom) || 1;
}

/** Layout coordinates for positioned UI; pointer/DOMRect coordinates remain screen coordinates. */
export function displayViewport(): { width: number; height: number } {
  const scale = displayScale();
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}
