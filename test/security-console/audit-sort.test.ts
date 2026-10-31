import { describe, expect, it } from 'vitest';
import { type AuditEventConfig, sortAuditByTimestamp } from '../../src/security-console/security-console-core';

const e = (id: string, timestampLabel?: string): AuditEventConfig => ({ id, timestampLabel, actor: 'a', action: 'x', category: 'auth', severity: 'info' });

describe('sortAuditByTimestamp', () => {
  it('orders by displayed clock time', () => {
    expect(sortAuditByTimestamp([e('b', '01:58 UTC'), e('a', '01:55 UTC'), e('c', '02:00 UTC')]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('rolls past midnight and keeps authored order for ties', () => {
    expect(sortAuditByTimestamp([e('a', '23:50'), e('c', '00:10'), e('b', '23:55')]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortAuditByTimestamp([e('x', '01:00'), e('y', '01:00')]).map((x) => x.id)).toEqual(['x', 'y']);
  });
  it('leaves the list alone when a label is missing', () => {
    expect(sortAuditByTimestamp([e('b', '02:00'), e('a')]).map((x) => x.id)).toEqual(['b', 'a']);
  });
});
