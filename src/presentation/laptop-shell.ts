import wallpaper from '@app/assets/images/ui/laptop-wallpaper.jpg';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import './laptop-shell.css';

/**
 * LaptopShell - The field laptop as an object: a rugged bezel around a small desktop OS.
 *
 * The player sits down at the laptop and sees its screen: wallpaper, app icons, one app window
 * with a title bar, and a taskbar with pinned apps and the scenario clock. Closing the window
 * shows the desktop; "Close lid" (or Escape) leaves the laptop. The app content is a borrowed
 * node: the shell only frames it, so app state survives switching and leaving.
 */

export type LaptopIcon = 'probe' | 'browser' | 'dish' | 'modem' | 'apps' | 'terminal';

export interface LaptopApp {
  id: string;
  label: string;
  icon: LaptopIcon;
  open: () => void;
}

export interface LaptopShellOptions {
  apps: LaptopApp[];
  /** The app whose window holds the borrowed content */
  activeId: string;
  /** Start with the window closed, showing the desktop */
  showDesktop: boolean;
  /** Maker's name on the chin; the C6 field laptop's by default */
  brand?: string;
}

const ICONS: Record<LaptopIcon, string> = {
  probe: '<path d="M3 13h4l2-6 4 12 3-9 2 3h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>',
  browser:
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 12h17M12 3.5c-3 3.2-3 13.8 0 17M12 3.5c3 3.2 3 13.8 0 17" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  dish: '<path d="M5 6a10 10 0 0 0 13 13Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M11.5 12.5 17 7M16 5l3 3M9 18l-2 3h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  modem:
    '<rect x="3.5" y="9" width="17" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.5" cy="13" r="1" fill="currentColor"/><circle cx="11" cy="13" r="1" fill="currentColor"/><path d="M16 4.5 13.5 9M18.5 6.5 16.5 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  terminal:
    '<rect x="3.5" y="5" width="17" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m7 10 3 2.5L7 15M12 15h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};

export function laptopIconSvg(icon: LaptopIcon): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[icon]}</svg>`;
}

interface TimeTick {
  timestampMs: number;
}

export class LaptopShell {
  readonly element: HTMLElement;
  private readonly window_: HTMLElement;
  private readonly clock_: HTMLElement;
  private readonly onTick_ = (data: TimeTick): void => this.setClock_(data.timestampMs);

  constructor(
    content: HTMLElement,
    leave: HTMLButtonElement,
    private readonly options_: LaptopShellOptions
  ) {
    const active = options_.apps.find((a) => a.id === options_.activeId);
    const root = document.createElement('section');
    root.className = 'lt-device';
    root.innerHTML = `
      <div class="lt-screen">
        <div class="lt-desktop" style="background-image:url('${wallpaper}')">
          <ul class="lt-icons" aria-label="Desktop"></ul>
        </div>
        <section class="lt-window" aria-label="${active?.label ?? 'Application'}">
          <header class="lt-titlebar">
            <span class="lt-title-icon">${laptopIconSvg(active?.icon ?? 'terminal')}</span>
            <span class="lt-title">${active?.label ?? ''}</span>
            <button type="button" class="lt-win-close" aria-label="Close window" title="Close window">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
          </header>
          <div class="lt-window-body"></div>
        </section>
        <footer class="lt-taskbar">
          <span class="lt-os" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 21 8v8l-9 5-9-5V8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v8M8 10.5l4 2.5 4-2.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></span>
          <nav class="lt-pins" aria-label="Laptop applications"></nav>
          <span class="lt-tray"><span class="lt-clock" aria-label="Laptop clock"></span></span>
        </footer>
        <div class="lt-glare" aria-hidden="true"></div>
      </div>
      <div class="lt-chin">
        <span class="lt-led" aria-hidden="true"></span>
        <span class="lt-brand" aria-hidden="true">FIELDBOOK R7</span>
      </div>`;
    this.element = root;
    if (options_.brand) root.querySelector<HTMLElement>('.lt-brand')!.textContent = options_.brand;
    this.window_ = root.querySelector<HTMLElement>('.lt-window')!;
    this.clock_ = root.querySelector<HTMLElement>('.lt-clock')!;
    root.querySelector('.lt-window-body')!.append(content);
    leave.textContent = 'Close lid · Esc';
    root.querySelector('.lt-chin')!.append(leave);

    const icons = root.querySelector('.lt-icons')!;
    const pins = root.querySelector('.lt-pins')!;
    for (const app of options_.apps) {
      const li = document.createElement('li');
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'lt-icon';
      icon.dataset.laptopApp = app.id;
      icon.innerHTML = `${laptopIconSvg(app.icon)}<span>${app.label}</span>`;
      icon.addEventListener('click', () => this.launch_(app));
      li.append(icon);
      icons.append(li);

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'lt-pin';
      pin.dataset.laptopApp = app.id;
      pin.innerHTML = `${laptopIconSvg(app.icon)}<span>${app.label}</span>`;
      pin.addEventListener('click', () => this.launch_(app));
      pins.append(pin);
    }
    root.querySelector('.lt-win-close')!.addEventListener('click', () => this.setDesktop_(true));
    this.setDesktop_(options_.showDesktop);
    this.setClock_(Number.NaN);
    EventBus.getInstance().on(Events.SIMULATED_TIME_TICK, this.onTick_);
  }

  dispose(): void {
    EventBus.getInstance().off(Events.SIMULATED_TIME_TICK, this.onTick_);
  }

  private launch_(app: LaptopApp): void {
    if (app.id === this.options_.activeId) {
      this.setDesktop_(false);

      return;
    }
    app.open();
  }

  private setDesktop_(desktop: boolean): void {
    this.window_.hidden = desktop;
    this.element.classList.toggle('lt-on-desktop', desktop);
    for (const pin of this.element.querySelectorAll<HTMLElement>('.lt-pin')) {
      const current = !desktop && pin.dataset.laptopApp === this.options_.activeId;
      pin.toggleAttribute('aria-current', current);
      if (current) pin.setAttribute('aria-current', 'page');
    }
  }

  private setClock_(timestampMs: number): void {
    const text = Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString().slice(11, 16) : '';
    if (this.clock_.textContent !== text) this.clock_.textContent = text;
  }
}
