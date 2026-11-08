export type TextSize = 'standard' | 'large' | 'largest';
export interface DisplayPrefs {
  textSize: TextSize;
  reducedMotion: boolean;
}
const KEY = '__SR_DISPLAY__';

export class DisplayPreferences {
  private prefs_: DisplayPrefs = { textSize: 'standard', reducedMotion: false };

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      this.prefs_.textSize = saved.textSize === 'large' || saved.textSize === 'largest' ? saved.textSize : 'standard';
      this.prefs_.reducedMotion = saved.reducedMotion === true;
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
    document.documentElement.dataset.textSize = this.prefs_.textSize;
    document.documentElement.classList.toggle('reduce-motion', this.prefs_.reducedMotion);
  }
}

export const displayPreferences = new DisplayPreferences();
export function prefersReducedMotion(): boolean {
  return displayPreferences.prefs.reducedMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
