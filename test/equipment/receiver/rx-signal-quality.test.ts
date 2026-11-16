import { describe, expect, it } from 'vitest';
import type { IQSignalInfo } from '../../../src/equipment/receiver/receiver';
import { DEGRADED_MARGIN_LABEL, describePayloadProblem, LOCK_LOST_LABEL, modemLiveDetail, modemLockAlarm, rxModemVerdict } from '../../../src/equipment/receiver/rx-signal-quality';

/** A locked carrier with 10 dB of margin, overridable per case */
function info(overrides: Partial<IQSignalInfo> = {}): IQSignalInfo {
  return {
    hasCarrier: true,
    hasLock: true,
    cnRatio_dB: 15,
    effectiveCnRatio_dB: 15,
    effectiveEsN0_dB: 15,
    requiredEsN0_dB: 5.03,
    ...overrides,
  } as IQSignalInfo;
}

describe('rxModemVerdict (Phase 33 D4)', () => {
  it('is green with no alarm at a good margin, interferer or not', () => {
    for (const interferenceCount of [0, 2]) {
      const verdict = rxModemVerdict(1, info({ interferenceCount }), null);
      expect(verdict).toEqual({
        grade: 'good',
        badgeClass: 'status-badge-good',
        badgeText: 'Good',
        statusText: 'Signal locked - Good margin (Es/N0 15.0 dB, need 5.0 dB)',
        severity: 'success',
        alarmMessage: null,
      });
    }
  });

  it('turns badge, status and LED amber together for a payload problem at a good margin', () => {
    const verdict = rxModemVerdict(1, info(), 'Frame sync lost');
    expect(verdict.grade).toBe('good');
    expect(verdict.badgeClass).toBe('status-badge-degraded');
    expect(verdict.badgeText).toBe('Degraded');
    expect(verdict.statusText).toBe('Signal locked - Frame sync lost (Es/N0 15.0 dB, need 5.0 dB)');
    expect(verdict.severity).toBe('warning');
    expect(verdict.alarmMessage).toBe('Frame sync lost');
  });

  it('names in-band interferers after the Dashboard degraded-margin text (Phase 34 D6)', () => {
    const verdict = rxModemVerdict(2, info({ isLowMargin: true, effectiveEsN0_dB: 5.6, interferenceCount: 1 }), null);
    expect(verdict.badgeText).toBe('Degraded');
    expect(verdict.severity).toBe('warning');
    expect(verdict.alarmMessage).toBe('Degraded margin - Modem 2: Es/N0 5.6 dB, need 5.0 dB - 1 interferer(s) in band');
    expect(verdict.statusText).toBe('Signal locked - Degraded margin (Es/N0 5.6 dB, need 5.0 dB) - 1 interferer(s) in band');
  });

  it('reads the Dashboard title verbatim with no interferer (nats-r9-s21-F2)', () => {
    const lowMargin = info({ isLowMargin: true, effectiveEsN0_dB: 5.6 });
    const dashboard = modemLockAlarm(1, lowMargin, null);
    const message = rxModemVerdict(1, lowMargin, null).alarmMessage;
    expect(message).toBe('Degraded margin - Modem 1: Es/N0 5.6 dB, need 5.0 dB');
    expect(message).toBe(`${dashboard?.label} - ${dashboard?.detail}`);
  });

  it('keeps the unlocked grades as before', () => {
    const acquiring = rxModemVerdict(1, info({ hasLock: false, lockState: 'acquiring', effectiveEsN0_dB: 5.9 }), 'Frame sync lost');
    expect(acquiring).toMatchObject({ badgeText: 'Acquiring', severity: 'info', statusText: 'Acquiring lock (Es/N0 5.9 dB, locks at 5.5 dB)' });

    const mismatch = rxModemVerdict(1, info({ hasLock: false, formatMismatch: true, effectiveCnRatio_dB: 13.7 }), null);
    expect(mismatch).toMatchObject({ badgeText: 'Mismatch', badgeClass: 'status-badge-error', severity: 'error', alarmMessage: 'No lock: format mismatch (modulation/FEC)' });
    expect(mismatch.statusText).toContain('C/N: 13.7 dB');

    const clipped = rxModemVerdict(1, info({ hasLock: false, isBandwidthClipped: true }), null);
    expect(clipped).toMatchObject({ badgeText: 'Clipped', severity: 'error' });

    const below = rxModemVerdict(1, info({ hasLock: false, lockState: 'unlocked', effectiveEsN0_dB: 5.2 }), null);
    expect(below).toMatchObject({ badgeText: 'No Lock', severity: 'error', statusText: 'Signal no lock - Below threshold (Es/N0 5.2 dB, locks at 5.5 dB)' });
  });
});

describe('modemLockAlarm (Phase 34 D5)', () => {
  const lost = { hadLock: true, lockLostAtMs: 1, lastSignalId: 'c1' };

  it('reports a lost lock with no carrier as "Modem N: no carrier"', () => {
    expect(modemLockAlarm(1, info({ hasCarrier: false, hasLock: false }), lost)).toEqual({
      severity: 'error',
      label: LOCK_LOST_LABEL,
      detail: 'Modem 1: no carrier',
    });
  });

  it('quotes the acquire line for a lost lock with the carrier still there', () => {
    expect(modemLockAlarm(3, info({ hasLock: false, effectiveEsN0_dB: 5.2 }), lost)).toEqual({
      severity: 'error',
      label: 'Carrier lock lost',
      detail: 'Modem 3: Es/N0 5.2 dB, locks at 5.5 dB',
    });
  });

  it('reports a locked low-margin modem as degraded', () => {
    expect(modemLockAlarm(2, info({ isLowMargin: true, effectiveEsN0_dB: 5.6 }), null)).toEqual({
      severity: 'warning',
      label: DEGRADED_MARGIN_LABEL,
      detail: 'Modem 2: Es/N0 5.6 dB, need 5.0 dB',
    });
  });

  it('is null for a good lock, an idle modem with no history, or a lock still held', () => {
    expect(modemLockAlarm(1, info(), null)).toBeNull();
    expect(modemLockAlarm(1, info({ hasCarrier: false, hasLock: false }), null)).toBeNull();
    expect(modemLockAlarm(1, info({ hasCarrier: false, hasLock: false }), { hadLock: false, lockLostAtMs: null, lastSignalId: '' })).toBeNull();
    expect(modemLockAlarm(1, info(), { hadLock: true, lockLostAtMs: null, lastSignalId: 'c1' })).toBeNull();
  });

  it('modemLiveDetail quotes "need" or no carrier', () => {
    expect(modemLiveDetail(1, info({ effectiveEsN0_dB: 9.3 }))).toBe('Modem 1: Es/N0 9.3 dB, need 5.0 dB');
    expect(modemLiveDetail(4, info({ hasCarrier: false }))).toBe('Modem 4: no carrier');
  });
});

describe('describePayloadProblem', () => {
  it('ignores the FEC Degraded status (the margin grade shows it)', () => {
    expect(describePayloadProblem({ frameSyncLocked: true, rsUncorrectableBlocks: 0, channelStatus: 'Degraded' })).toBeNull();
    expect(describePayloadProblem({ frameSyncLocked: true, rsUncorrectableBlocks: 0, channelStatus: 'Good' })).toBeNull();
    expect(describePayloadProblem(null)).toBeNull();
  });

  it('keeps frame-sync loss, RS failure and Critical', () => {
    expect(describePayloadProblem({ frameSyncLocked: false, rsUncorrectableBlocks: 0, channelStatus: 'No Lock' })).toBe('Frame sync lost');
    expect(describePayloadProblem({ frameSyncLocked: true, rsUncorrectableBlocks: 4, channelStatus: 'Critical' })).toBe('RS overload');
    expect(describePayloadProblem({ frameSyncLocked: true, rsUncorrectableBlocks: 0, channelStatus: 'Critical' })).toBe('Payload errors');
  });
});
