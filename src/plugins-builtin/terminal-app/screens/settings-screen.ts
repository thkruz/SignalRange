/**
 * @file settings-screen - SkyLink Settings: restart, snow melt, power save, Wi-Fi (phase 40, WP3, E2 verbs)
 * @description Inputs are filled on mount and after a save only; `sync` never touches them, so
 * a half-typed value is safe. Buttons are disabled while the dish cannot be reached.
 */
import type { SnowMeltMode } from '@app/physical/physical-plant-types';
import { tr } from '../strings';
import type { TerminalView } from '../terminal-app-model';
import type { TerminalScreen, TerminalScreenContext, TerminalScreenFactory } from './terminal-screen';

const SNOW_MODES: SnowMeltMode[] = ['automatic', 'preheat', 'off'];
const MIN_PASSWORD_LENGTH = 8;

export function secondsToHhmm(s: number): string {
  const m = Math.floor(s / 60);

  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function hhmmToSeconds(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(text);
  if (!match) {
    return null;
  }
  const h = Number(match[1]);
  const m = Number(match[2]);

  return h < 24 && m < 60 ? h * 3600 + m * 60 : null;
}

export const createSettingsScreen: TerminalScreenFactory = (ctx: TerminalScreenContext): TerminalScreen => {
  let root: HTMLElement | null = null;
  const handlers: Array<{ el: Element; fn: EventListener }> = [];

  const q = <T extends HTMLElement>(id: string): T => root?.querySelector(`#set-${id}`) as T;
  const on = (id: string, fn: () => void): void => {
    const el = q(id);
    el.addEventListener('click', fn);
    handlers.push({ el, fn });
  };
  const note = (text: string): void => {
    q('note').textContent = text;
  };
  const fillInputs = (): void => {
    const s = ctx.actions.settings();
    for (const mode of SNOW_MODES) {
      q<HTMLInputElement>(`snow-${mode}`).checked = s.snowMelt === mode;
    }
    q<HTMLInputElement>('sleep-on').checked = s.sleep !== null;
    q<HTMLInputElement>('sleep-start').value = s.sleep ? secondsToHhmm(s.sleep.startS) : '22:00';
    q<HTMLInputElement>('sleep-end').value = s.sleep ? secondsToHhmm(s.sleep.endS) : '06:00';
    q<HTMLInputElement>('ssid').value = s.wifi.ssid;
    q<HTMLInputElement>('password').value = s.wifi.password;
    q('sleep-current').textContent = s.sleep
      ? tr('settings.sleep.current', { value: `${secondsToHhmm(s.sleep.startS)} - ${secondsToHhmm(s.sleep.endS)}` })
      : tr('settings.sleep.currentOff');
  };

  const onReboot = async (): Promise<void> => {
    if (await ctx.confirm(tr('settings.reboot.confirm'), tr('settings.reboot.confirmButton'))) {
      ctx.actions.reboot();
      note(tr('settings.reboot.done'));
      ctx.refresh();
    }
  };
  const onSnow = (mode: SnowMeltMode): void => {
    ctx.actions.setSnowMelt(mode);
    note(tr('settings.snow.saved'));
    ctx.refresh();
  };
  const onSleep = async (): Promise<void> => {
    const enabled = q<HTMLInputElement>('sleep-on').checked;
    const startS = hhmmToSeconds(q<HTMLInputElement>('sleep-start').value);
    const endS = hhmmToSeconds(q<HTMLInputElement>('sleep-end').value);
    if (enabled && (startS === null || endS === null)) {
      note(tr('settings.sleep.invalid'));

      return;
    }
    const text = enabled ? tr('settings.sleep.confirm', { start: secondsToHhmm(startS as number), end: secondsToHhmm(endS as number) }) : tr('settings.sleep.confirmOff');
    if (!(await ctx.confirm(text, tr('settings.sleep.confirmButton')))) {
      return;
    }
    ctx.actions.setSleep(enabled ? { startS: startS as number, endS: endS as number } : null);
    fillInputs();
    note(tr('settings.sleep.saved'));
    ctx.refresh();
  };
  const onWifi = (): void => {
    const ssid = q<HTMLInputElement>('ssid').value.trim();
    const password = q<HTMLInputElement>('password').value;
    if (!ssid || password.length < MIN_PASSWORD_LENGTH) {
      note(tr('settings.wifi.invalid'));

      return;
    }
    ctx.actions.setRouterWifi(ssid, password);
    note(tr('settings.wifi.saved'));
  };

  const snowRow = (mode: SnowMeltMode): string =>
    `<label class="form-check"><input class="form-check-input" type="radio" name="snow-melt" id="set-snow-${mode}"><span class="form-check-label">${tr(`settings.snow.${mode}`)}<span class="d-block text-secondary small">${tr(`settings.snow.${mode}Hint`)}</span></span></label>`;

  return {
    id: 'settings',
    mount(container) {
      root = container;
      container.innerHTML = `
        <h2 class="mb-3">${tr('settings.title')}</h2>
        <div class="text-secondary mb-2" id="set-note" role="status"></div>
        <div class="text-warning mb-2" id="set-offline" hidden>${tr('settings.offline')}</div>
        <div class="row g-3">
          <div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title">${tr('settings.reboot.title')}</h3></div>
            <div class="card-body"><p>${tr('settings.reboot.body')}</p><button class="btn btn-danger" id="set-reboot" data-act>${tr('settings.reboot.button')}</button></div></div></div>
          <div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title">${tr('settings.snow.title')}</h3></div>
            <div class="card-body"><p>${tr('settings.snow.body')}</p>${SNOW_MODES.map(snowRow).join('')}</div></div></div>
          <div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title">${tr('settings.sleep.title')}</h3></div>
            <div class="card-body"><p>${tr('settings.sleep.body')}</p>
              <label class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" id="set-sleep-on"><span class="form-check-label">${tr('settings.sleep.enable')}</span></label>
              <div class="d-flex gap-3 mb-2">
                <label>${tr('settings.sleep.start')}<input class="form-control" type="time" id="set-sleep-start"></label>
                <label>${tr('settings.sleep.end')}<input class="form-control" type="time" id="set-sleep-end"></label>
              </div>
              <div class="text-secondary small mb-2" id="set-sleep-current"></div>
              <button class="btn btn-primary" id="set-sleep-save" data-act>${tr('settings.sleep.save')}</button></div></div></div>
          <div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title">${tr('settings.wifi.title')}</h3></div>
            <div class="card-body"><p>${tr('settings.wifi.body')}</p>
              <label class="d-block mb-2">${tr('settings.wifi.name')}<input class="form-control" type="text" id="set-ssid" autocomplete="off"></label>
              <label class="d-block mb-2">${tr('settings.wifi.password')}<input class="form-control" type="password" id="set-password" autocomplete="off"></label>
              <button class="btn btn-primary" id="set-wifi-save" data-act>${tr('settings.wifi.save')}</button></div></div></div>
        </div>`;
      fillInputs();
      on('reboot', () => void onReboot());
      on('sleep-save', () => void onSleep());
      on('wifi-save', onWifi);
      for (const mode of SNOW_MODES) {
        on(`snow-${mode}`, () => onSnow(mode));
      }
    },
    sync(view: TerminalView) {
      const offline = view.link !== 'connected';
      for (const el of root?.querySelectorAll<HTMLButtonElement>('[data-act]') ?? []) {
        el.disabled = offline;
      }
      for (const mode of SNOW_MODES) {
        q<HTMLInputElement>(`snow-${mode}`).disabled = offline;
      }
      q('offline').hidden = !offline;
    },
    dispose() {
      for (const { el, fn } of handlers) {
        el.removeEventListener('click', fn);
      }
      handlers.length = 0;
      root = null;
    },
  };
};
