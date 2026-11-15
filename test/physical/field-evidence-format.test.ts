import { badgeText } from '@app/physical/field-evidence-format';
import type { ServiceSample } from '@app/physical/service-types';
import { describe, expect, it } from 'vitest';

const sample = (extra: Partial<ServiceSample> = {}): ServiceSample => ({ tS: 0, maxAgeS: 300, ...extra }) as ServiceSample;

describe('badgeText expiry', () => {
  it('names tS + window, plus any time already held', () => {
    expect(badgeText({ freshness: 'current', sample: sample() })).toContain('fresh until elapsed 05:00');
    expect(badgeText({ freshness: 'current', sample: sample({ heldS: 120 }) })).toContain('fresh until elapsed 07:00');
  });

  it('names no time while a held object has stopped the clock', () => {
    const text = badgeText({ freshness: 'current', sample: sample(), agingPaused: true });
    expect(text).toContain('aging paused');
    expect(text).not.toContain('fresh until');
  });
});
