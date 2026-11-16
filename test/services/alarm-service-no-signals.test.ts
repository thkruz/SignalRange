import { afterEach, describe, expect, it } from 'vitest';
import { AlarmService } from '../../src/services/alarm-service';

/**
 * nats-eu-r1 s22-F5: a NO SIGNALS RECEIVED warning is raised on its second
 * consecutive poll, so carrier arrival does not raise and clear it within a second.
 */
type Settle = { settleNoSignals_: (alarms: unknown[]) => unknown[]; previousAlarms_: Map<string, unknown> };

const noSignals = { assetId: 'GW-01', severity: 'warning', message: 'NO SIGNALS RECEIVED', source: 'antenna' };
const other = { assetId: 'GW-01', severity: 'warning', message: 'Manual Tracking Enabled', source: 'antenna' };

describe('AlarmService NO SIGNALS settling', () => {
  afterEach(() => AlarmService.destroy());

  it('holds the warning on the first sighting and raises it on the second', () => {
    const svc = AlarmService.getInstance() as unknown as Settle;
    expect(svc.settleNoSignals_([noSignals, other])).toEqual([other]);
    expect(svc.settleNoSignals_([noSignals, other])).toEqual([noSignals, other]);
  });

  it('never raises a warning that clears before the second poll (carrier arrival)', () => {
    const svc = AlarmService.getInstance() as unknown as Settle;
    expect(svc.settleNoSignals_([noSignals])).toEqual([]);
    expect(svc.settleNoSignals_([])).toEqual([]);
    // the pending sighting was forgotten: the next sighting is a first one again
    expect(svc.settleNoSignals_([noSignals])).toEqual([]);
  });

  it('keeps a raised warning raised and drops it at once when it clears', () => {
    const svc = AlarmService.getInstance() as unknown as Settle;
    svc.settleNoSignals_([noSignals]);
    expect(svc.settleNoSignals_([noSignals])).toHaveLength(1);
    svc.previousAlarms_.set((AlarmService as unknown as { raiseKey_: (a: unknown) => string }).raiseKey_(noSignals), {});
    expect(svc.settleNoSignals_([noSignals])).toHaveLength(1);
    expect(svc.settleNoSignals_([])).toEqual([]);
  });
});
