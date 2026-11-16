import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { MINIMAL_HUD_CLASS, MinimalHud, objectHeld, runningTimer } from '../../../src/presentation/minimal-hud/minimal-hud';
import { minimalHudActive } from '../../../src/presentation/minimal-hud/minimal-hud-policy';
import { readWatch, waitLabel } from '../../../src/presentation/minimal-hud/watch-readout';

function commandBar(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <span id="utc-clock">2027-03-15 09:42:07 UTC</span>
    <div id="objective-timer-display"><span class="timer-label">Objective <span class="timer-hold-tag">HOLD</span></span><span class="timer-value">04:10</span></div>
    <div id="scenario-timer-display" style="display:none"><span class="timer-label">Scenario</span><span class="timer-value">55:00</span></div>
    <button id="objective-skip-control" title="Wait for the relay"><span id="objective-skip-control-label">Skip to 10:00</span></button>
    <button id="time-skip-control" style="display:none"><span id="time-skip-control-label">Skip 7 min</span></button>
  `;

  return root;
}

describe('minimalHudActive', () => {
  it('is on only at a field station that is not unlocked and not a sandbox', () => {
    expect(minimalHudActive({ stationClass: 'field', engineeringUnlocked: false, sandbox: false })).toBe(true);
    expect(minimalHudActive({ stationClass: 'field', engineeringUnlocked: true, sandbox: false })).toBe(false);
    expect(minimalHudActive({ stationClass: 'field', engineeringUnlocked: false, sandbox: true })).toBe(false);
    expect(minimalHudActive({ stationClass: 'fixed', engineeringUnlocked: false, sandbox: false })).toBe(false);
    expect(minimalHudActive({ stationClass: null, engineeringUnlocked: false, sandbox: false })).toBe(false);
  });

  it('is on at a Campaign 3 backyard bench, not at a bench-less backyard station or in a sandbox', () => {
    expect(minimalHudActive({ stationClass: 'backyard', engineeringUnlocked: false, sandbox: false, hamBench: true })).toBe(true);
    expect(minimalHudActive({ stationClass: 'backyard', engineeringUnlocked: false, sandbox: false })).toBe(false);
    expect(minimalHudActive({ stationClass: 'backyard', engineeringUnlocked: false, sandbox: true, hamBench: true })).toBe(false);
    expect(minimalHudActive({ stationClass: 'fixed', engineeringUnlocked: false, sandbox: false, hamBench: true })).toBe(false);
  });
});

describe('watch readout', () => {
  it('rewords command-bar skips as waits', () => {
    expect(waitLabel('Skip to 10:00')).toBe('Wait until 10:00');
    expect(waitLabel('  Skip   7 min ')).toBe('Wait 7 min');
    expect(waitLabel('Skip')).toBe('Wait');
    expect(waitLabel('Resume')).toBe('Resume');
  });

  it('mirrors the clock, the shown timers and the shown skips', () => {
    const readout = readWatch(commandBar());
    expect(readout.time).toBe('09:42:07');
    expect(readout.timers).toEqual([{ label: 'Objective', value: '04:10', hold: true }]);
    expect(readout.skips).toEqual([{ sourceId: 'objective-skip-control', label: 'Wait until 10:00', title: 'Wait for the relay', disabled: false }]);
  });

  it('falls back to dashes without a command bar', () => {
    expect(readWatch(document.createElement('div'))).toEqual({ time: '--:--', timers: [], skips: [] });
  });
});

describe('MinimalHud', () => {
  let hud: MinimalHud | null = null;
  afterEach(() => {
    hud?.dispose();
    hud = null;
    document.body.innerHTML = '';
  });

  it('toggles the document class and paints the watch from the command bar', () => {
    const bar = commandBar();
    hud = new MinimalHud(document.body, { readSource: () => bar });
    expect(document.documentElement.classList.contains(MINIMAL_HUD_CLASS)).toBe(false);
    hud.setActive(true);
    expect(document.documentElement.classList.contains(MINIMAL_HUD_CLASS)).toBe(true);
    // The wrist shows HH:MM only; the raised watch has the seconds and the running countdown
    expect(document.getElementById('hud-watch-time')!.textContent).toBe('09:42');
    expect(document.getElementById('hud-watch-panel-time')!.textContent).toBe('09:42:07');
    expect(document.getElementById('hud-watch-panel-sub')!.textContent).toBe('OBJ 04:10 H');
    expect(document.getElementById('hud-watch')!.getAttribute('aria-label')).toBe('Check your watch, 09:42');
    const wait = document.querySelector<HTMLButtonElement>('#hud-watch-skips button[data-skip-source="objective-skip-control"]');
    expect(wait?.textContent).toBe('Wait until 10:00');
    hud.setActive(false);
    expect(document.documentElement.classList.contains(MINIMAL_HUD_CLASS)).toBe(false);
  });

  it('a wait on the watch presses the command bar skip', () => {
    const bar = commandBar();
    let pressed = 0;
    bar.querySelector('#objective-skip-control')!.addEventListener('click', () => pressed++);
    hud = new MinimalHud(document.body, { readSource: () => bar });
    hud.setActive(true);
    document.querySelector<HTMLButtonElement>('#hud-watch-skips button')!.click();
    expect(pressed).toBe(1);
  });

  it('drops timers that are not running', () => {
    expect(runningTimer({ label: 'Objective', value: 'No limit', hold: false })).toBe(false);
    expect(runningTimer({ label: 'Scenario', value: '--:--', hold: false })).toBe(false);
    expect(runningTimer({ label: 'Objective', value: '04:10', hold: false })).toBe(true);
  });

  const alarm = { assetId: 'gs1', equipmentType: 'modem', equipmentIndex: 0, severity: 'error', message: 'Modem unlocked', raisedAtMs: 1 };
  const emit = (alarms: object[], restored = false): void => {
    EventBus.getInstance().emit(Events.ALARM_STATE_CHANGED, { alarms, restored } as never);
  };

  it('raises a plate for a new warning or critical alarm, not for restored, repeated or info ones', () => {
    hud = new MinimalHud(document.body, { readSource: () => commandBar(), isHeld: () => false });
    hud.setActive(true);
    const notice = document.getElementById('hud-alarm-notice')!;
    emit([alarm], true);
    expect(notice.hidden).toBe(true);
    emit([alarm]);
    expect(notice.hidden).toBe(true);
    emit([alarm, { ...alarm, equipmentType: 'receiver', severity: 'info', message: 'Signal(s) Detected', raisedAtMs: 3 }]);
    expect(notice.hidden).toBe(true);
    const fresh = { ...alarm, equipmentType: 'hpa', message: 'HPA fault', raisedAtMs: 2 };
    emit([alarm, fresh]);
    expect(notice.hidden).toBe(false);
    expect(document.getElementById('hud-alarm-text')!.textContent).toBe('HPA fault');
    expect(document.getElementById('hud-alarm-kicker')!.textContent).toBe('Critical');
    expect(document.getElementById('hud-alarm-body')!.getAttribute('role')).toBe('alert');
    document.getElementById('hud-alarm-ack')!.click();
    expect(notice.hidden).toBe(true);
  });

  it('keeps the plate up until acknowledged and the watch lamp lit while alarms stay raised', () => {
    vi.useFakeTimers();
    try {
      hud = new MinimalHud(document.body, { readSource: () => commandBar(), isHeld: () => false });
      hud.setActive(true);
      emit([]);
      const warning = { ...alarm, severity: 'warning', message: 'Generator fuel low' };
      emit([warning]);
      vi.advanceTimersByTime(60_000);
      expect(document.getElementById('hud-alarm-notice')!.hidden).toBe(false);
      document.getElementById('hud-alarm-ack')!.click();
      expect(document.getElementById('hud-alarm-notice')!.hidden).toBe(true);
      const lamp = document.getElementById('hud-watch-alarm')!;
      expect(lamp.hidden).toBe(false);
      expect(document.getElementById('hud-watch-alarm-count')!.textContent).toBe('1');
      expect(document.getElementById('hud-watch')!.getAttribute('aria-label')).toContain('1 alarm raised');
      expect(document.getElementById('hud-watch-alarms')!.textContent).toContain('Generator fuel low');
      emit([]);
      expect(lamp.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds back a plate that fires while an object is held and shows it once it is put down', () => {
    hud = new MinimalHud(document.body, { readSource: () => commandBar() });
    hud.setActive(true);
    emit([]);
    // The player is filling in the clipboard (an ImmersiveView) when the supply-restart alarm sounds
    const held = document.createElement('dialog');
    held.className = 'immersive-view';
    held.setAttribute('open', '');
    document.body.append(held);
    expect(objectHeld()).toBe(true);
    emit([{ ...alarm, equipmentType: 'supply', message: 'Supply restarted', raisedAtMs: 9 }]);
    const notice = document.getElementById('hud-alarm-notice')!;
    expect(notice.hidden).toBe(true);
    // Later ticks while still held do not use it up
    hud.sync();
    emit([{ ...alarm, equipmentType: 'supply', message: 'Supply restarted', raisedAtMs: 9 }]);
    expect(notice.hidden).toBe(true);
    // Put down
    held.removeAttribute('open');
    held.remove();
    emit([{ ...alarm, equipmentType: 'supply', message: 'Supply restarted', raisedAtMs: 9 }]);
    expect(notice.hidden).toBe(false);
    expect(document.getElementById('hud-alarm-text')!.textContent).toBe('Supply restarted');
  });

  it('shows the held-back plate when the held dialog closes, without waiting for another alarm report', async () => {
    hud = new MinimalHud(document.body, { readSource: () => commandBar() });
    hud.setActive(true);
    emit([]);
    const held = document.createElement('dialog');
    held.className = 'immersive-view';
    held.setAttribute('open', '');
    document.body.append(held);
    emit([{ ...alarm, message: 'Router down', raisedAtMs: 11 }]);
    const notice = document.getElementById('hud-alarm-notice')!;
    expect(notice.hidden).toBe(true);
    held.removeAttribute('open');
    held.dispatchEvent(new Event('close'));
    held.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notice.hidden).toBe(false);
  });

  it('the Pause pusher puts the watch down and opens the pause menu', () => {
    let paused = 0;
    hud = new MinimalHud(document.body, { readSource: () => commandBar(), onPause: () => paused++ });
    hud.setActive(true);
    const pause = document.getElementById('hud-watch-pause')!;
    expect(pause.hidden).toBe(false);
    pause.click();
    expect(paused).toBe(1);
  });
});
