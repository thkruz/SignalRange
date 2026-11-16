import { alarmLed, applyAlarmLed } from '../../../src/pages/mission-control/alarm-led';
import type { AlarmWithDetail } from '../../../src/services/alarm-service';

const alarm = (severity: AlarmWithDetail['severity'], message: string, equipmentType = 'RF', detail?: string): AlarmWithDetail => ({
  severity,
  message,
  assetId: 'GS-001',
  equipmentType,
  equipmentIndex: 0,
  detail,
});

const isRf = (a: AlarmWithDetail) => a.equipmentType === 'RF';

describe('alarmLed (Phase 33 D2)', () => {
  it('is grey with the off title while unpowered, whatever the alarms', () => {
    const led = alarmLed([alarm('error', 'LNB not locked')], isRf, { isPowered: false, offTitle: 'LNB off', idleTitle: 'Idle' });
    expect(led).toEqual({ state: 'off', title: 'LNB off' });
  });

  it('is green "No alarms" when powered with nothing to report', () => {
    expect(alarmLed([], isRf, { isPowered: true, offTitle: 'off' })).toEqual({ state: 'success', title: 'No alarms' });
  });

  it('takes the worst matching error over a warning that comes first, titled "message - detail"', () => {
    const alarms = [alarm('warning', 'AGC on noise only'), alarm('error', 'HPA over-temperature', 'RF', '95 °C')];
    expect(alarmLed(alarms, isRf, { isPowered: true, offTitle: 'off' })).toEqual({ state: 'error', title: 'HPA over-temperature - 95 °C' });
  });

  it('keeps the first of equal severity and titles without a detail by the message alone', () => {
    const alarms = [alarm('warning', 'AGC on noise only'), alarm('warning', 'Filter insertion loss high')];
    expect(alarmLed(alarms, isRf, { isPowered: true, offTitle: 'off' })).toEqual({ state: 'warning', title: 'AGC on noise only' });
  });

  it('ignores alarms the matcher rejects', () => {
    const alarms = [alarm('error', 'Modem 1 Faulted', 'TX')];
    expect(alarmLed(alarms, isRf, { isPowered: true, offTitle: 'off' }).state).toBe('success');
  });

  it('never lights for info (or success) alarms', () => {
    const alarms = [alarm('info', 'LOOPBACK ENABLED'), alarm('success', 'LOCKED')];
    expect(alarmLed(alarms, isRf, { isPowered: true, offTitle: 'off' })).toEqual({ state: 'success', title: 'No alarms' });
    expect(alarmLed(alarms, isRf, { isPowered: true, offTitle: 'off', idleTitle: 'No carrier' })).toEqual({ state: 'off', title: 'No carrier' });
  });

  it('is grey with the idle title when idle, but a real alarm outranks idle', () => {
    expect(alarmLed([], isRf, { isPowered: true, offTitle: 'off', idleTitle: 'HPA output disabled' })).toEqual({ state: 'off', title: 'HPA output disabled' });
    expect(alarmLed([alarm('warning', 'BUC cooling fault')], isRf, { isPowered: true, offTitle: 'off', idleTitle: 'HPA output disabled' })).toEqual({
      state: 'warning',
      title: 'BUC cooling fault',
    });
  });

  it('counts the extras: an extra error beats a matching warning, a matching error beats an extra warning', () => {
    const warn = [alarm('warning', 'RAIN FADE', 'ANT', 'fade 3.1 dB')];
    const isAnt = (a: AlarmWithDetail) => a.equipmentType === 'ANT';
    expect(alarmLed(warn, isAnt, { isPowered: true, offTitle: 'Antenna off', extra: [{ severity: 'error', message: 'Azimuth limit' }] })).toEqual({
      state: 'error',
      title: 'Azimuth limit',
    });
    expect(alarmLed(warn, isAnt, { isPowered: true, offTitle: 'Antenna off', extra: [{ severity: 'warning', message: 'Later' }] })).toEqual({
      state: 'warning',
      title: 'RAIN FADE - fade 3.1 dB',
    });
    expect(alarmLed([], isAnt, { isPowered: false, offTitle: 'Antenna off', extra: [{ severity: 'error', message: 'Azimuth limit' }] }).state).toBe('off');
  });
});

describe('applyAlarmLed', () => {
  it('swaps only the state class and sets the title', () => {
    const el = document.createElement('span');
    el.className = 'card-alarm-led ms-2 success';
    applyAlarmLed(el, { state: 'error', title: 'SUN TRANSIT' });
    expect([...el.classList].sort()).toEqual(['card-alarm-led', 'error', 'ms-2']);
    expect(el.title).toBe('SUN TRANSIT');
    applyAlarmLed(el, { state: 'off', title: 'Antenna off' });
    expect([...el.classList].sort()).toEqual(['card-alarm-led', 'ms-2', 'off']);
  });
});
