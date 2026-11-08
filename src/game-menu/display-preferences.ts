import { type GameResolution, resolutionScale } from './display-viewport';

export type TextSize = 'standard' | 'large' | 'largest';
export interface DisplayPrefs {
  textSize: TextSize;
  reducedMotion: boolean;
  resolution: GameResolution;
}
const KEY = '__SR_DISPLAY__';

export class DisplayPreferences {
  private prefs_: DisplayPrefs = { textSize: 'standard', reducedMotion: false, resolution: 'native' };
  private initialized_ = false;
  private readonly resizeHandler_ = (): void => this.applyResolution_();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      this.prefs_.textSize = saved.textSize === 'large' || saved.textSize === 'largest' ? saved.textSize : 'standard';
      this.prefs_.reducedMotion = saved.reducedMotion === true;
      this.prefs_.resolution = saved.resolution === '1080p' || saved.resolution === '1440p' ? saved.resolution : 'native';
    } catch {
      /* Defaults when storage is unavailable. */
    }
  }

  get prefs(): Readonly<DisplayPrefs> {
    return this.prefs_;
  }

  set(update: Partial<DisplayPrefs>): void {
    this.prefs_ = { ...this.prefs_, ...update };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs_));
    } catch {
      /* Session-only. */
    }
    this.apply();
  }

  apply(): void {
    if (!this.initialized_) {
      window.addEventListener('resize', this.resizeHandler_);
      document.addEventListener('fullscreenchange', this.resizeHandler_);
      this.initialized_ = true;
    }
    document.documentElement.dataset.textSize = this.prefs_.textSize;
    document.documentElement.classList.toggle('reduce-motion', this.prefs_.reducedMotion);
    this.applyResolution_();
  }

  private applyResolution_(): void {
    const root = document.documentElement;
    const scale = resolutionScale(this.prefs_.resolution, window.innerWidth, window.innerHeight);
    root.style.zoom = scale === 1 ? '' : String(scale);
    // CSS viewport units do not account for CSS zoom. Keep layout dimensions in game pixels.
    root.style.setProperty('--mc-viewport-width', `${window.innerWidth / scale}px`);
    root.style.setProperty('--mc-viewport-height', `${window.innerHeight / scale}px`);
    root.dataset.resolution = this.prefs_.resolution;
    // Keep already-open movable windows reachable after changing resolution or window size.
    document.querySelectorAll<HTMLElement>('.draggable-box').forEach((box) => {
      if (!box.getClientRects().length) return;
      const rect = box.getBoundingClientRect();
      if (rect.left < 0 || rect.right > window.innerWidth || rect.top < 0 || rect.bottom > window.innerHeight) {
        box.style.left = `${Math.max(0, (window.innerWidth / scale - box.offsetWidth) / 2)}px`;
        box.style.top = `${Math.max(0, (window.innerHeight / scale - box.offsetHeight) / 2)}px`;
      }
    });
    window.dispatchEvent(new Event('game-display-change'));
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler_);
    document.removeEventListener('fullscreenchange', this.resizeHandler_);
    this.initialized_ = false;
  }
}

export const displayPreferences = new DisplayPreferences();
export function prefersReducedMotion(): boolean {
  return displayPreferences.prefs.reducedMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
