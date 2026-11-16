import { fillDialogTokens, formatStationTime, STATION_TIME_TOKEN } from '../../src/modal/dialog-tokens';

describe('dialog tokens (nats-r4-s21-F1)', () => {
  const at1035 = Date.UTC(2026, 1, 14, 10, 35, 50);

  it('stamps {{stationTime}} with the station clock (UTC HH:MM) when shown', () => {
    const text = `<em>[Regulator coordination desk - SYSTEM notification, ${STATION_TIME_TOKEN}]</em>`;

    expect(fillDialogTokens(text, at1035)).toBe('<em>[Regulator coordination desk - SYSTEM notification, 10:35]</em>');
  });

  it('fills every occurrence and leaves text without the token untouched', () => {
    expect(fillDialogTokens('{{stationTime}} / {{stationTime}}', at1035)).toBe('10:35 / 10:35');
    expect(fillDialogTokens('[Call from Dana at 10:22]', at1035)).toBe('[Call from Dana at 10:22]');
  });

  it('pads hours and minutes', () => {
    expect(formatStationTime(Date.UTC(2026, 0, 1, 7, 5))).toBe('07:05');
  });
});
