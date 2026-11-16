import { describe, expect, it } from 'vitest';
import { conditionLabel, tabHintLabel, tabLabel } from '../../src/objectives/condition-label';
import type { Condition } from '../../src/objectives/objective-types';

describe('conditionLabel (nats-r3-s20-F1)', () => {
  it('reads the authored description', () => {
    expect(conditionLabel({ type: 'tab-active', description: 'Dashboard Open', params: { tab: 'dashboard' } })).toBe('Dashboard Open');
  });

  it('falls back to the tab for a tab-active row with no description', () => {
    expect(conditionLabel({ type: 'tab-active', description: '', params: { tab: 'rx-analysis-2' } })).toBe('Open the RX Analysis tab');
    expect(conditionLabel({ type: 'tab-active', description: '   ', params: { tab: 'dashboard' } })).toBe('Open the Dashboard tab');
  });

  it('falls back to the condition type for any other row with no description', () => {
    const condition = { type: 'buc-temperature-normal', description: undefined } as unknown as Condition;
    expect(conditionLabel(condition)).toBe('Buc temperature normal');
  });

  it('names the tab on the B5 hint row', () => {
    expect(tabHintLabel('dashboard')).toBe('(open the Dashboard tab to continue)');
    expect(tabLabel('tx-chain')).toBe('TX Chain');
    expect(tabLabel('unknown-tab')).toBe('unknown-tab');
  });
});
