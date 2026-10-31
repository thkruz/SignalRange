/**
 * nats-eu-r1 s16-F2: a lock loss whose carrier is simply gone (the pass ended)
 * does not make the station DEGRADED; any other error still does.
 */
import type { GroundStation } from '@app/assets/ground-station/ground-station';
import { stationStatusLabel } from '@app/pages/mission-control/station-status-label';
import { AlarmService } from '@app/services/alarm-service';
import { afterEach, describe, expect, it, vi } from 'vitest';

function station(): GroundStation {
  return { state: { isOperational: true }, antennas: [{ state: { trackingMode: 'program' } }] } as unknown as GroundStation;
}

function withAlarms(alarms: { severity: string; message: string; detail?: string }[]): void {
  vi.spyOn(AlarmService, 'getAlarms').mockReturnValue(alarms as never);
}

describe('stationStatusLabel lock loss', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ignores Carrier lock lost when every lost modem has no carrier', () => {
    withAlarms([{ severity: 'error', message: 'Carrier lock lost', detail: 'Modem 1: no carrier' }]);
    expect(stationStatusLabel(station())).toBe('OPERATIONAL');
  });

  it('is DEGRADED when a lost modem still sees a carrier', () => {
    withAlarms([{ severity: 'error', message: 'Carrier lock lost', detail: 'Modem 1: no carrier; Modem 2: Es/N0 3.3 dB, locks at 5.5 dB' }]);
    expect(stationStatusLabel(station())).toBe('DEGRADED');
  });

  it('is DEGRADED for any other error alarm', () => {
    withAlarms([{ severity: 'error', message: 'BUC FAULT', detail: undefined }]);
    expect(stationStatusLabel(station())).toBe('DEGRADED');
  });
});
