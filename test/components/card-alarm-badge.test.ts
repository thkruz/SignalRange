import { vi } from 'vitest';
import { CardAlarmBadge } from '../../src/components/card-alarm-badge/card-alarm-badge';
import type { AlarmStatus } from '../../src/equipment/base-equipment';

describe('CardAlarmBadge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function mount(badge: CardAlarmBadge): void {
    document.body.innerHTML = badge.html;
  }

  function ledEl(): HTMLElement {
    const el = document.querySelector('.card-alarm-led');
    if (!el) throw new Error('Missing .card-alarm-led element');
    return el as HTMLElement;
  }

  it('renders default success LED with No alarms tooltip', () => {
    const badge = CardAlarmBadge.create('alarm-badge-1');
    mount(badge);

    expect(document.querySelector('#alarm-badge-1')).not.toBeNull();
    expect(ledEl().className).toBe('card-alarm-led success');
    expect(ledEl().title).toBe('No alarms');
  });

  it('update() keeps success + No alarms when no active alarms', () => {
    const badge = new CardAlarmBadge('alarm-badge-2');
    mount(badge);

    badge.update([]);

    expect(ledEl().className).toBe('card-alarm-led success');
    expect(ledEl().title).toBe('No alarms');
  });

  it('update() shows warning and uses message as tooltip', () => {
    const badge = new CardAlarmBadge('alarm-badge-3');
    mount(badge);

    const alarms: AlarmStatus[] = [{ severity: 'warning', message: 'Low SNR' }];
    badge.update(alarms);

    expect(ledEl().className).toBe('card-alarm-led warning');
    expect(ledEl().title).toBe('Low SNR');
  });

  it('update() picks highest severity (error > warning > info) and sorts tooltip messages', () => {
    const badge = new CardAlarmBadge('alarm-badge-4');
    mount(badge);

    const alarms: AlarmStatus[] = [
      { severity: 'success', message: 'OK' },
      { severity: 'off', message: 'OFF' },
      { severity: 'info', message: 'FYI' },
      { severity: 'warning', message: 'WARN' },
      { severity: 'error', message: 'FAIL' },
    ];

    badge.update(alarms);

    expect(ledEl().className).toBe('card-alarm-led error');
    expect(ledEl().title).toBe('FAIL\nWARN\nFYI');
  });

  it('update() ignores empty messages and falls back to No alarms tooltip', () => {
    const badge = new CardAlarmBadge('alarm-badge-5');
    mount(badge);

    const alarms: AlarmStatus[] = [
      { severity: 'success', message: 'OK' },
      { severity: 'off', message: 'OFF' },
      { severity: 'info', message: '' },
    ];

    badge.update(alarms);

    // Highest severity among active alarms is info (even though the message is empty)
    expect(ledEl().className).toBe('card-alarm-led info');
    // But tooltip should still display the default when no messages exist
    expect(ledEl().title).toBe('No alarms');
  });

  it('dispose() clears cached DOM references and update() still works after dispose', () => {
    const badge = new CardAlarmBadge('alarm-badge-6');
    mount(badge);

    badge.update([{ severity: 'warning', message: 'W1' }]);

    expect((badge as any).dom_).toBeTruthy();
    expect((badge as any).ledEl_).toBeTruthy();

    badge.dispose();

    expect((badge as any).dom_).toBeUndefined();
    expect((badge as any).ledEl_).toBeUndefined();

    badge.update([{ severity: 'error', message: 'E1' }]);
    expect(ledEl().className).toBe('card-alarm-led error');
    expect(ledEl().title).toBe('E1');
  });

  it('handles unknown severity strings defensively', () => {
    const badge = new CardAlarmBadge('alarm-badge-7');
    mount(badge);

    badge.update([{ severity: 'weird', message: 'Odd Alarm' } as unknown as AlarmStatus]);

    // Unknown severity is treated as non-alarm for the LED class
    expect(ledEl().className).toBe('card-alarm-led success');
    // But messages still display if provided
    expect(ledEl().title).toBe('Odd Alarm');
  });

  it('sorts unknown severity messages after known severities', () => {
    const badge = new CardAlarmBadge('alarm-badge-8');
    mount(badge);

    badge.update([{ severity: 'weird', message: 'Z' } as unknown as AlarmStatus, { severity: 'error', message: 'A' }]);

    expect(ledEl().className).toBe('card-alarm-led error');
    expect(ledEl().title).toBe('A\nZ');
  });

  it('handles sorting when all severities are unknown', () => {
    const badge = new CardAlarmBadge('alarm-badge-9');
    mount(badge);

    badge.update([{ severity: 'weird', message: 'B' } as unknown as AlarmStatus, { severity: 'strange', message: 'C' } as unknown as AlarmStatus]);

    expect(ledEl().className).toBe('card-alarm-led success');
    const lines = ledEl().title.split('\n').sort();
    expect(lines).toEqual(['B', 'C']);
  });

  it('update() with the equipment off and no alarm is grey "Powered off", never green (phase 29 D4, nats-r4-s02-F3)', () => {
    const badge = new CardAlarmBadge('alarm-badge-off');
    mount(badge);

    badge.update([], false);
    expect(ledEl().className).toBe('card-alarm-led off');
    expect(ledEl().title).toBe('Powered off');

    // A real alarm still shows while off
    badge.update([{ severity: 'error', message: 'Fault' }], false);
    expect(ledEl().className).toBe('card-alarm-led error');

    badge.update([], true);
    expect(ledEl().className).toBe('card-alarm-led success');
  });

  it('update() powered with an idle status and no alarm is grey with that tooltip (phase 31 D6, r6-s09-F1)', () => {
    const badge = new CardAlarmBadge('alarm-badge-idle');
    mount(badge);

    badge.update([], true, 'Output disabled');
    expect(ledEl().className).toBe('card-alarm-led off');
    expect(ledEl().title).toBe('Output disabled');

    // A real alarm still wins over the idle status
    badge.update([{ severity: 'warning', message: 'Hot' }], true, 'Output muted');
    expect(ledEl().className).toBe('card-alarm-led warning');
    expect(ledEl().title).toBe('Hot');

    // Unpowered reads "Powered off" whatever the idle status
    badge.update([], false, 'Output muted');
    expect(ledEl().title).toBe('Powered off');

    badge.update([], true, undefined);
    expect(ledEl().className).toBe('card-alarm-led success');
    expect(ledEl().title).toBe('No alarms');
  });
});
