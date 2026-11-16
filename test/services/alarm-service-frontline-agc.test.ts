import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fieldHooks from '../../src/physical/field-hooks';
import { FieldTabPolicy } from '../../src/physical/field-tab-policy';
import { AlarmService } from '../../src/services/alarm-service';

type Hidden = (gs: { state: { id: string } }, message: string) => boolean;
const hidden = (id: string, message: string): boolean => (AlarmService as unknown as { isHiddenFieldChainAlarm_: Hidden }).isHiddenFieldChainAlarm_({ state: { id } }, message);
const AGC = 'AGC at max gain (12.0 dB) - weak signal';

describe('frontline legacy RF-chain AGC alarm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    FieldTabPolicy.reset();
  });

  it('is hidden at the frontline station while a field plant is active', () => {
    vi.spyOn(fieldHooks, 'getActiveField').mockReturnValue({} as never);
    expect(hidden('FL-01', AGC)).toBe(true);
  });

  it('shows again once the trainer unlocks the engineering tabs', () => {
    vi.spyOn(fieldHooks, 'getActiveField').mockReturnValue({} as never);
    FieldTabPolicy.setEngineeringUnlocked(true);
    expect(hidden('FL-01', AGC)).toBe(false);
  });

  it('never hides other stations or other alarms', () => {
    vi.spyOn(fieldHooks, 'getActiveField').mockReturnValue({} as never);
    expect(hidden('GALWAY', AGC)).toBe(false);
    expect(hidden('FL-01', 'HPA overdrive')).toBe(false);
  });

  it('does not hide anything without a field plant', () => {
    vi.spyOn(fieldHooks, 'getActiveField').mockReturnValue(null);
    expect(hidden('FL-01', AGC)).toBe(false);
  });
});
