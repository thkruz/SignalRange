/**
 * Phase 29 D4 hooks in the antenna log line (engine agent B):
 * - a staged STOW/MAINT arrives as `stagedTrackingMode` beside the applied mode
 *   and still logs as staged (nats-r3-s11-F2);
 * - no beacon frequency is logged without a target outside MANUAL
 *   (nats-r4-s12-F1): PROGRAM with no target carries the last satellite's.
 */
import type { AntennaState } from '@app/equipment/antenna';
import { formatAntennaEvent } from '@app/ops-log/event-formatters';
import { describe, expect, it } from 'vitest';

describe('formatAntennaEvent phase 29 D4 readouts', () => {
  it('logs a staged MAINT from stagedTrackingMode while PROGRAM still runs', () => {
    const msg = formatAntennaEvent({
      trackingMode: 'program-track',
      stagedTrackingMode: 'maintenance',
      hasStagedChanges: true,
      stagedTargetElevation: 5,
    } as Partial<AntennaState>);

    expect(msg).toBe('Tracking mode: MAINTENANCE staged (El 5.0 pending APPLY)');
  });

  it('leaves the beacon frequency out of a PROGRAM line with no target', () => {
    const msg = formatAntennaEvent({ trackingMode: 'program-track', targetSatelliteId: null, beaconFrequencyHz: 3948e6 } as Partial<AntennaState>);

    expect(msg).not.toContain('Beacon freq');
  });

  it("logs the target's beacon once a target is set", () => {
    const msg = formatAntennaEvent({ trackingMode: 'program-track', targetSatelliteId: 42, beaconFrequencyHz: 4175.5e6 } as Partial<AntennaState>);

    expect(msg).toContain('Beacon freq: 4175.50 MHz');
  });
});
