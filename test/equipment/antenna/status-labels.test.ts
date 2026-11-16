import { BEACON_CN_FLOOR_DB, usableBeaconCn } from '../../../src/equipment/antenna/beacon-cn';
import { trackingModeLabel } from '../../../src/equipment/antenna/tracking-mode-label';

describe('trackingModeLabel', () => {
  it('prints the tracking mode', () => {
    expect(trackingModeLabel({ trackingMode: 'manual', isStepTrackEnabled: false })).toBe('MANUAL');
    expect(trackingModeLabel({ trackingMode: 'program-track', isStepTrackEnabled: false })).toBe('PROGRAM TRACK');
  });

  it('shows the step-track overlay on program-track (s01-F3, s10-F5)', () => {
    expect(trackingModeLabel({ trackingMode: 'program-track', isStepTrackEnabled: true })).toBe('PROGRAM TRACK + STEP');
  });
});

describe('usableBeaconCn', () => {
  it('passes a usable C/N through', () => {
    expect(usableBeaconCn(10.4, true)).toBe(10.4);
    expect(usableBeaconCn(BEACON_CN_FLOOR_DB, true)).toBe(BEACON_CN_FLOOR_DB);
  });

  it('is null with the LNB off, below the floor, or with no measurement', () => {
    expect(usableBeaconCn(10.4, false)).toBeNull();
    expect(usableBeaconCn(-267, true)).toBeNull();
    expect(usableBeaconCn(null, true)).toBeNull();
    expect(usableBeaconCn(Number.NEGATIVE_INFINITY, true)).toBeNull();
  });
});
